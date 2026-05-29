# @kinesisjs/openlayers

> OpenLayers map adapter for Kinesis.js.

[![npm](https://img.shields.io/npm/v/@kinesisjs/openlayers.svg)](https://www.npmjs.com/package/@kinesisjs/openlayers)
[![Downloads](https://img.shields.io/npm/dm/@kinesisjs/openlayers.svg)](https://www.npmjs.com/package/@kinesisjs/openlayers)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/openlayers?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/openlayers)
[![Provenance](https://img.shields.io/badge/npm%20provenance-signed-brightgreen.svg?logo=sigstore&logoColor=white)](https://www.npmjs.com/package/@kinesisjs/openlayers)
[![Changelog](https://img.shields.io/badge/changelog-keep%20a%20changelog-blue)](https://github.com/kinesisjs/kinesis.js/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![OpenLayers](https://img.shields.io/badge/peer-ol%20%E2%89%A58-3eaaaf.svg)](https://openlayers.org/)

OpenLayers feature lifecycle and styling layer on top of `@kinesisjs/core`.

## Scope

- `Feature<Point>` create / update / delete per vehicle
- Vector layer and source management (creates a new layer or attaches to an existing one)
- **`managedFeatureIds`** — co-exists with non-vehicle features (geofences, custom markers) in a shared layer
- Static or dynamic styling — `(vehicle, id) => Style` factory
- **Trail rendering** — fading per-vehicle polyline on a layer below the markers (opt-in)
- **`updateOpacity`** — fade-behaviour support (used by the tracker's fade animation)
- **`setVehicleState`** + **`warningOpacity`** — gap visualisation (dim a vehicle while it's in the `warning` state)
- **`getMemoryEstimate`** — feeds `Tracker.getStats().memoryBreakdown`
- Heading / speed property propagation (for rotation, colour bands)
- `EPSG:3857` by default; custom projections supported

## Installation

```bash
pnpm add @kinesisjs/core @kinesisjs/openlayers ol
```

`ol` is a **peer dependency** — your project controls the OpenLayers version (`>=8.0.0` recommended).

## Usage

```ts
import Map from 'ol/Map';
import View from 'ol/View';
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle } from '@kinesisjs/openlayers';

const map = new Map({ target: 'map', view: new View({ center: [0, 0], zoom: 10 }) });

const adapter = new OpenLayersAdapter(map, {
  style: createVehicleStyle({
    icon: '/car.png',
    iconScale: 0.7,
  }),
  // Speed-based colouring:
  // style: createVehicleStyle({
  //   speedColorBands: [
  //     { max: 30, color: '#22c55e' },
  //     { max: 80, color: '#eab308' },
  //     { max: 130, color: '#ef4444' },
  //   ],
  // }),
});

const tracker = new Tracker({ adapter, interpolation: 'adaptive' });
tracker.start();
```

### Co-existing with non-vehicle features

When an existing `VectorLayer` already holds geofences, custom markers, or other features, pass it as `existingLayer` and scope the adapter to a managed ID set so it never touches anything else:

```ts
const adapter = new OpenLayersAdapter(map, {
  existingLayer: sharedLayer,
  managedFeatureIds: vehicleIds, // only these are managed
});

// Update the managed set at runtime:
adapter.setManagedIds(newVehicleIds);
```

### Trails

Draw a fading polyline behind each vehicle. Trails render on a separate `VectorLayer` below the marker layer, and each vehicle keeps a bounded ring buffer of recent points (fixed memory — it never grows unbounded):

```ts
const adapter = new OpenLayersAdapter(map, {
  trail: {
    enabled: true,
    maxPoints: 60, // ring-buffer capacity per vehicle (default 60)
    intervalMs: 100, // min ms between samples (default 100 ≈ 10 Hz)
    width: 3,
    opacity: 0.5,
    // color: '#3b82f6',   // fixed colour; overrides meta.color
    // defaultColor: '#3b82f6',
  },
});
```

Trail colour resolves in order: explicit `color` → `TrailPoint.meta.color` → `defaultColor` → `#3b82f6` — so a per-vehicle colour attached via `Position.meta` flows into the trail automatically.

### Gap visualisation

When a vehicle stops sending data it transitions to the `warning` state (before `stale` removal). Pass `warningOpacity` to dim its marker while it's in `warning`; the next ingest — or a sweeper-detected recovery to `active` — restores full opacity:

```ts
const adapter = new OpenLayersAdapter(map, {
  warningOpacity: 0.5, // dim to 50% in the warning state (omit to leave opacity untouched)
});
```

This is wired through the core `setVehicleState` adapter hook — no extra subscription needed.

## Public API

```ts
export { OpenLayersAdapter, createVehicleStyle, colorForSpeed };

export type {
  OpenLayersAdapterOptions,
  TrailRenderOptions,
  VehicleStyleOptions,
  VehicleStyleProvider,
  SpeedColorBand,
};
```

## License

[MIT](./LICENSE)
