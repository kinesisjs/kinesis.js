# First map — Leaflet

The Leaflet adapter mirrors the OpenLayers one — same `Tracker`, same options, different rendering layer.

> **Coordinate note:** Leaflet uses `[lat, lng]` (the opposite of OpenLayers and GeoJSON). You still hand the tracker `Position{ lng, lat }`; the adapter swaps internally.

## 1. Install

```bash
pnpm add @kinesisjs/core @kinesisjs/leaflet leaflet
```

`leaflet` is a peer dependency (`>=1.7`). The adapter is **browser-only** — Leaflet references `window` at import time, so guard SSR setups (Next, Nuxt, SvelteKit, Angular Universal) to client-side execution.

## 2. HTML + CSS

```html
<div id="map" style="width: 100%; height: 600px"></div>
```

Leaflet needs its own stylesheet for tile rendering. Import it once in your app's entry point or global styles:

```ts
import 'leaflet/dist/leaflet.css';
```

## 3. Setup

```ts
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { Tracker } from '@kinesisjs/core';
import { LeafletAdapter, createVehicleStyle } from '@kinesisjs/leaflet';
import type { Position } from '@kinesisjs/core';

// 1. Set up the Leaflet map.
const map = L.map('map').setView([41, 29], 11); // [lat, lng]
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// 2. Adapter and style. The built-in createVehicleStyle returns a
//    heading-aware DivIcon factory.
const adapter = new LeafletAdapter(map, {
  style: createVehicleStyle({
    speedColorBands: [
      { max: 30, color: '#22c55e' },
      { max: 80, color: '#eab308' },
      { max: 130, color: '#ef4444' },
    ],
  }),
});

// 3. Tracker — same shape as the OpenLayers example.
const tracker = new Tracker({
  adapter,
  interpolation: 'adaptive',
  ingestThrottle: 100,
  warningThreshold: 60_000,
  staleThreshold: 600_000,
});

tracker.start();

// 4. Feed positions from your data source.
const ws = new WebSocket('wss://your-backend/vehicles');
ws.onmessage = (event) => {
  const positions: Position[] = JSON.parse(event.data);
  tracker.ingest(positions);
};

// 5. Subscribe to lifecycle events (optional).
tracker.on('vehiclewarning', ({ vehicleId }) => {
  console.warn(`${vehicleId} has been silent for more than 60 seconds`);
});

tracker.on('error', (err) => {
  console.warn(`[kinesis ${err.code}]`, err.message);
});

// 6. Clean up on SPA navigation or page unload.
window.addEventListener('beforeunload', () => {
  tracker.destroy();
  map.remove();
});
```

## Trails and gap dimming

The Leaflet adapter ships the same trail + `warning`-state opacity treatment as the OpenLayers one:

```ts
const adapter = new LeafletAdapter(map, {
  style: createVehicleStyle(),
  trail: { enabled: true, maxPoints: 60, width: 3, opacity: 0.5 },
  warningOpacity: 0.5, // dim the marker while it's in the `warning` state
});
```

Trails render on a separate `L.LayerGroup` in Leaflet's `overlayPane` (below `markerPane`), so they sit under the vehicle markers without any z-index work.

## Co-existing with other layers

Add vehicles to a `LayerGroup` you already own — geofences, custom markers, anything else on it is left untouched:

```ts
const shared = L.layerGroup().addTo(map);

const adapter = new LeafletAdapter(map, {
  existingLayer: shared,
  managedFeatureIds: new Set(vehicleIds), // adapter only touches these ids
});

// Update the managed set at runtime:
adapter.setManagedIds(newVehicleIds);
```

## OpenLayers vs Leaflet

Behaviour is identical under the same scenario — the choice is purely about which map library you already use.

| Concern                | OpenLayers (`@kinesisjs/openlayers`) | Leaflet (`@kinesisjs/leaflet`)      |
| ---------------------- | ------------------------------------ | ----------------------------------- |
| Coordinate order       | `[lng, lat]` (GeoJSON)               | `[lat, lng]`                        |
| Default projection     | `EPSG:3857` (configurable)           | `EPSG:3857` (fixed)                 |
| Heading rotation       | OL `Style.image.rotation`            | Baked into the `DivIcon` HTML       |
| Stylesheet             | `import 'ol/ol.css'`                 | `import 'leaflet/dist/leaflet.css'` |
| SSR-friendly at import | Mostly (some Node setups fine)       | No — touches `window`               |
| Gzip bundle (adapter)  | ~2.0 KB                              | ~2.0 KB                             |

## Next steps

- [Architecture](/concepts/architecture)
- [Interpolation](/concepts/interpolation)
- [Limitations](/concepts/limitations)
