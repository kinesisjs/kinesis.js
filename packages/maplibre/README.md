# @kinesisjs/maplibre

> MapLibre GL map adapter for Kinesis.js.

[![npm](https://img.shields.io/npm/v/@kinesisjs/maplibre.svg)](https://www.npmjs.com/package/@kinesisjs/maplibre)
[![Downloads](https://img.shields.io/npm/dm/@kinesisjs/maplibre.svg)](https://www.npmjs.com/package/@kinesisjs/maplibre)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/maplibre?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/maplibre)
[![Provenance](https://img.shields.io/badge/npm%20provenance-signed-brightgreen.svg?logo=sigstore&logoColor=white)](https://www.npmjs.com/package/@kinesisjs/maplibre)
[![Changelog](https://img.shields.io/badge/changelog-keep%20a%20changelog-blue)](https://github.com/kinesisjs/kinesis.js/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![MapLibre](https://img.shields.io/badge/peer-maplibre--gl%20%E2%89%A53-295DAA.svg)](https://maplibre.org/)

GPU-rendered vehicle layer on top of `@kinesisjs/core`. Behaves identically to
`@kinesisjs/openlayers` and `@kinesisjs/leaflet` under the same scenario — same
tracker, same events, same options surface, different map library. All three
pass the same cross-adapter parity suite.

## Scope

- One GeoJSON source + one symbol layer for the whole fleet
- **Built-in heading-aware arrow** — generated as an SDF sprite at runtime, so
  there is no sprite sheet to host and no image to fetch
- Static or dynamic styling — `(vehicle, id) => VehicleStyle` factory, or the
  `createVehicleStyle()` helper (speed-band colouring, custom sprite ids)
- **`managedFeatureIds`** — render only the vehicles you name
- **`updateOpacity`** — fade-behaviour support
- **`setVehicleState`** + **`warningOpacity`** — gap visualisation (dim a vehicle in `warning`)
- **Trail rendering** — per-vehicle line layer inserted beneath the vehicles
- **`getMemoryEstimate`** — feeds `Tracker.getStats().memoryBreakdown`

> **Why this one is built differently.** Leaflet and OpenLayers get one object
> per vehicle — a marker, a feature. MapLibre draws the whole fleet from a single
> source in one GPU pass, so this adapter keeps plain GeoJSON features in a fixed
> array, mutates them in place, and uploads once per tick with a single
> `setData`. A thousand vehicles cost one upload and zero DOM nodes.
>
> `TrackAdapter` has no end-of-tick hook, so that upload is coalesced with
> `queueMicrotask`. The Tracker's tick is synchronous, so every `addVehicle` /
> `updatePosition` in a tick lands before the microtask runs.

> **Coordinate order:** MapLibre uses `[lng, lat]` — the same order core uses, so
> nothing is swapped here (unlike the Leaflet adapter).

> **SSR:** `maplibre-gl` touches `window` at import time and needs a WebGL
> context. Construct the map and the adapter in a browser-only code path.

## Installation

```bash
pnpm add @kinesisjs/core @kinesisjs/maplibre maplibre-gl
```

MapLibre's stylesheet is required for the map container:

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
```

## Usage

```ts
import { Map as MapLibreMap } from 'maplibre-gl';
import { Tracker } from '@kinesisjs/core';
import { MapLibreAdapter, createVehicleStyle } from '@kinesisjs/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new MapLibreMap({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [29.0, 41.0],
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
tracker.ingest(positions); // call from your WebSocket handler
```

The adapter waits for the map style to load on its own — you can construct it
and start ingesting immediately, before `map.on('load')` fires.

### Trails and gap visualisation

```ts
new MapLibreAdapter(map, {
  trail: { enabled: true, maxPoints: 60, width: 3, opacity: 0.5 },
  warningOpacity: 0.5, // dim a vehicle whose feed has gone quiet
});
```

### Using your own sprite

`icon` is a **sprite id**, not a URL — register the image on the map first:

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

`icon-color` only tints **SDF** images. A plain raster sprite is drawn as-is and
the style's `color` is ignored for it — register it with `{ sdf: true }` if you
want speed-band colouring to apply.

### Co-existing with other layers

```ts
new MapLibreAdapter(map, {
  sourceId: 'fleet',
  layerId: 'fleet',
  beforeId: 'place-labels', // keep the basemap's labels on top
  managedFeatureIds: ['bus-1', 'bus-2'],
});
```

## Public API

```ts
export { MapLibreAdapter } from './maplibre-adapter';
export {
  createVehicleStyle,
  colorForSpeed,
  createArrowImage,
  DEFAULT_ICON_ID,
  ARROW_SPRITE_SIZE,
} from './style-builder';

export type {
  MapLibreAdapterOptions,
  TrailRenderOptions,
  VehicleStyle,
  VehicleStyleOptions,
  VehicleStyleProvider,
  SpeedColorBand,
} from './types';

export const VERSION = '0.1.0' as const;
```

## License

MIT © Muzaffer Aşkar
