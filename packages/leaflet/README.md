# @kinesisjs/leaflet

> Leaflet map adapter for Kinesis.js.

[![npm](https://img.shields.io/npm/v/@kinesisjs/leaflet.svg)](https://www.npmjs.com/package/@kinesisjs/leaflet)
[![Downloads](https://img.shields.io/npm/dm/@kinesisjs/leaflet.svg)](https://www.npmjs.com/package/@kinesisjs/leaflet)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/leaflet?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/leaflet)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Leaflet](https://img.shields.io/badge/peer-leaflet%20%E2%89%A51.7-199900.svg)](https://leafletjs.com/)

Leaflet feature lifecycle and styling layer on top of `@kinesisjs/core`. Behaves
identically to `@kinesisjs/openlayers` under the same scenario — same tracker,
same events, same options surface, different map library.

## Scope

- `L.Marker` create / update / delete per vehicle
- `L.LayerGroup` management (creates a new group or attaches to an existing one)
- **Built-in heading-aware marker** — rotates to the vehicle's heading (Leaflet has
  no native marker rotation; rotation is baked into the icon)
- Static or dynamic styling — `(vehicle, id) => L.Icon | L.DivIcon` factory, or the
  `createVehicleStyle()` helper (speed-band colouring, image or SVG markers)
- **`managedFeatureIds`** — co-exists with non-vehicle layers in a shared group
- **`updateOpacity`** — fade-behaviour support
- **`setVehicleState`** + **`warningOpacity`** — gap visualisation (dim a vehicle in `warning`)
- **Trail rendering** — fading per-vehicle polyline in the `overlayPane` (below markers)
- **`getMemoryEstimate`** — feeds `Tracker.getStats().memoryBreakdown`

> **Coordinate order:** Leaflet uses `[lat, lng]` — the opposite of OpenLayers /
> GeoJSON `[lng, lat]`. You still feed the tracker `{ lng, lat }` positions; the
> adapter does the swap.

## Installation

```bash
pnpm add @kinesisjs/core @kinesisjs/leaflet leaflet
```

`leaflet` is a **peer dependency** — your project controls the Leaflet version
(`>=1.7.0`).

> **SSR note:** Leaflet touches `window` at import time, so this adapter is
> browser-only. In SSR frameworks (Next, Nuxt, SvelteKit) import it on the
> client (dynamic `import()` / a browser guard).

## Usage

```ts
import L from 'leaflet';
import { Tracker } from '@kinesisjs/core';
import { LeafletAdapter, createVehicleStyle } from '@kinesisjs/leaflet';

const map = L.map('map').setView([41, 29], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const adapter = new LeafletAdapter(map, {
  style: createVehicleStyle({
    speedColorBands: [
      { max: 30, color: '#22c55e' },
      { max: 80, color: '#eab308' },
      { max: 130, color: '#ef4444' },
    ],
  }),
});

const tracker = new Tracker({ adapter, interpolation: 'adaptive' });
tracker.start();
```

### Trails and gap visualisation

```ts
const adapter = new LeafletAdapter(map, {
  trail: { enabled: true, maxPoints: 60, width: 3, opacity: 0.5 },
  warningOpacity: 0.5, // dim a marker while it's in the `warning` state
});
```

### Co-existing with other layers

```ts
const shared = L.layerGroup().addTo(map);
const adapter = new LeafletAdapter(map, {
  existingLayer: shared,
  managedFeatureIds: vehicleIds, // only these are managed
});
adapter.setManagedIds(newVehicleIds); // update at runtime
```

## Public API

```ts
export { LeafletAdapter, createVehicleStyle, colorForSpeed };

export type {
  LeafletAdapterOptions,
  TrailRenderOptions,
  VehicleStyleOptions,
  VehicleStyleProvider,
  SpeedColorBand,
};
```

## License

[MIT](./LICENSE)
