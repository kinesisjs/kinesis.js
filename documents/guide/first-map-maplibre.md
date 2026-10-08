# First map — MapLibre

This mirrors the [vanilla OpenLayers guide](/guide/first-map-vanilla) and the [Leaflet one](/guide/first-map-leaflet): same tracker, same options, different map library.

> **Coordinate note:** MapLibre uses `[lng, lat]` — the same order core uses, so nothing is swapped. (The Leaflet adapter does swap, because Leaflet is `[lat, lng]`.)

> **SSR note:** `maplibre-gl` touches `window` at import time and needs a WebGL context. Keep the map and the adapter in a browser-only code path.

## 1. Install

```bash
pnpm add @kinesisjs/core @kinesisjs/maplibre maplibre-gl
```

## 2. HTML + CSS

MapLibre needs its stylesheet and a container with a real height:

```html
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
<div id="map"></div>
```

```css
#map {
  width: 100%;
  height: 100vh;
}
```

If you bundle instead of using the CDN tag:

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
```

## 3. Setup

```ts
import { Map as MapLibreMap } from 'maplibre-gl';
import { Tracker } from '@kinesisjs/core';
import { MapLibreAdapter, createVehicleStyle } from '@kinesisjs/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new MapLibreMap({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [29.0, 41.0], // [lng, lat]
  zoom: 11,
});

const tracker = new Tracker({
  adapter: new MapLibreAdapter(map, {
    style: createVehicleStyle({
      speedColorBands: [
        { max: 30, color: '#22c55e' },
        { max: 80, color: '#eab308' },
        { max: 130, color: '#ef4444' },
      ],
    }),
  }),
  interpolation: 'adaptive',
});

tracker.start();

// From your WebSocket / polling handler:
tracker.ingest([
  { id: 'bus-1', lng: 29.0, lat: 41.0, heading: 45, speed: 40 },
  { id: 'bus-2', lng: 29.01, lat: 41.01, heading: 180, speed: 90 },
]);
```

You do not have to wait for `map.on('load')`. The adapter installs its source and layers as soon as the style is ready and writes anything ingested in the meantime.

## How it renders

This adapter is built differently from the other two, and the difference is worth knowing when you reason about performance.

Leaflet and OpenLayers get **one object per vehicle** — a marker, a feature. MapLibre draws the whole fleet from a **single GeoJSON source in one GPU pass**, so the adapter keeps plain features in a fixed array, mutates them in place, and uploads once per tick with a single `setData`. A thousand vehicles cost one upload and zero DOM nodes.

Colour, heading rotation and opacity are not set per marker either — they live in feature properties and the layer reads them through data-driven expressions, so the GPU applies them.

## Styling

`createVehicleStyle()` returns a `(vehicle, id) => VehicleStyle` factory. Unlike the Leaflet helper it does not build an icon — it produces the plain values the layer reads:

```ts
createVehicleStyle({
  iconSize: 28, // pixels, for the built-in arrow
  rotationOffset: 0, // if your sprite already points east, use -90
  defaultColor: '#3b82f6',
  speedColorBands: [{ max: 50, color: '#22c55e' }],
});
```

The default arrow is generated at runtime as an SDF sprite, so there is no sprite sheet to host and no image request.

### Your own sprite

`icon` is a **sprite id**, not a URL. Register the image on the map first:

```ts
const img = new Image();
img.src = '/bus.png';
await img.decode();
map.addImage('bus', img);

new MapLibreAdapter(map, {
  style: createVehicleStyle({ icon: 'bus', iconScale: 0.5 }),
});
```

Loading the image this way works on every supported MapLibre version. From v4
onward `map.loadImage(url)` returns a promise and would do the same job; in v3
it is callback-based, and this package's peer range still allows v3.

Speed-band colouring only tints **SDF** images. Register with `{ sdf: true }` if you want `color` to apply to your own sprite.

## Trails and gap dimming

```ts
new MapLibreAdapter(map, {
  trail: { enabled: true, maxPoints: 60, width: 3, opacity: 0.5 },
  warningOpacity: 0.5,
});
```

Trails render on their own line layer, always inserted beneath the vehicle layer. `warningOpacity` dims a vehicle whose feed has gone quiet and restores it on recovery — see [gap visualisation](/concepts/architecture).

## Co-existing with other layers

```ts
new MapLibreAdapter(map, {
  sourceId: 'fleet',
  layerId: 'fleet',
  beforeId: 'place-labels', // keep the basemap's labels above the vehicles
  managedFeatureIds: ['bus-1', 'bus-2'],
});
```

`beforeId` is MapLibre's layer-ordering hook: the adapter inserts its layers _below_ the id you name. `managedFeatureIds` restricts the adapter to the vehicles you list, even when the tracker is managing more.

## Which adapter?

|                  | OpenLayers                 | Leaflet                   | MapLibre                               |
| ---------------- | -------------------------- | ------------------------- | -------------------------------------- |
| Rendering        | Canvas vector features     | DOM markers               | GPU, one draw call                     |
| Per vehicle      | one `Feature`              | one `L.Marker`            | one GeoJSON feature in a shared source |
| Heading rotation | native style rotation      | baked into the icon       | `icon-rotate` expression               |
| Best at          | rich GIS work, projections | simple maps, small fleets | large fleets, vector basemaps          |

All three pass the same cross-adapter parity suite, so switching is a constructor change — the tracker, events and options surface do not move.

## Next steps

- [Live data (WebSocket / HTTP)](/guide/realtime-data)
- [Interpolation](/concepts/interpolation)
- [Limitations](/concepts/limitations)
