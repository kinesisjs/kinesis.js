# @kinesisjs/core

> Pure-TypeScript interpolation engine — framework-agnostic, ~5 KB minified+gzipped.

[![npm](https://img.shields.io/npm/v/@kinesisjs/core.svg)](https://www.npmjs.com/package/@kinesisjs/core)
[![Downloads](https://img.shields.io/npm/dm/@kinesisjs/core.svg)](https://www.npmjs.com/package/@kinesisjs/core)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/core?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/core)
[![Provenance](https://img.shields.io/badge/npm%20provenance-signed-brightgreen.svg?logo=sigstore&logoColor=white)](https://www.npmjs.com/package/@kinesisjs/core)
[![Changelog](https://img.shields.io/badge/changelog-keep%20a%20changelog-blue)](https://github.com/kinesisjs/kinesis.js/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Mathematical engine for smooth movement between periodic position updates. No dependency on any map library or UI framework; extends through the adapter pattern.

## Scope

- **rAF-based clock** — 60fps tick, no tab-background catch-up jumps
- **Interpolation modes** — linear, cubic, geodesic, none, adaptive
- **Web Worker mode** — `worker: true` runs the tick loop off the main thread (adapter stays on it)
- **Bounded memory** — ring slot pattern, allocation-free hot path
- **Multi-state lifecycle** — `active` / `warning` / `stale` / `completed` + `markCompleted` API
- **Sanity checks** — anomalous-jump (distance vs. speed) and sharp-turn (heading) detection
- **Typed event bus** — `tick`, `vehicleadded`, `vehiclewarning`, `vehiclestale`, `vehiclecompleted`, `vehicleremoved`, `ingest`, `error`
- **`TrackAdapter` interface** — map adapters implement this contract
- **`CustomInterpolator` interface** — sync/async; foundation for route-aware extensions
- **`math-utils`** — `haversineDistance`, `shortestArcDiff`, `linearLerp` as public exports

## Out of scope

- Map feature lifecycle → adapter packages
- Framework lifecycle → wrapper packages
- Data fetching, WebSocket management → application code

## Installation

```bash
pnpm add @kinesisjs/core
```

## Usage

```ts
import { Tracker } from '@kinesisjs/core';
import type { TrackAdapter, TrailPoint, Position } from '@kinesisjs/core';

class MyAdapter implements TrackAdapter {
  addVehicle(id: string, p: TrailPoint): void {
    /* draw on your map */
  }
  updatePosition(id: string, p: TrailPoint): void {
    /* feature.setCoordinates */
  }
  removeVehicle(id: string): void {
    /* remove from layer */
  }
  destroy(): void {
    /* cleanup */
  }
  // Optional: updateOpacity(id, opacity), getMemoryEstimate()
}

const tracker = new Tracker({
  adapter: new MyAdapter(),
  interpolation: 'adaptive',
});

tracker.start();
tracker.on('vehiclestale', ({ vehicleId }) => console.log(`${vehicleId} stale`));
tracker.on('error', (e) => console.warn(`[${e.code}]`, e.message));

// From your WebSocket handler:
const positions: Position[] = [{ id: 'v1', lng: 29, lat: 41 }];
tracker.ingest(positions);
```

## Public API

```ts
// Classes
export { Tracker, WorkerTracker, Clock, Interpolator, AdaptiveInterpolator, EventBus, Sweeper };

// Utilities
export { haversineDistance, shortestArcDiff, linearLerp };

// Types
export type {
  Position,
  TrailPoint,
  VehicleSlot,
  VehicleState,
  SweepResult,
  InitialPositionBehavior,
  TrackerOptions,
  TrackerStats,
  TrackerEventMap,
  TrackAdapter,
  InterpolationMode,
  CustomInterpolator,
  InterpolationOptions,
  AdaptiveOptions,
  AdaptiveBehavior,
  TrackerError,
  TrackerErrorCode,
  FadeAnimationOptions,
};
```

## Performance

`Interpolator.compute` linear: **~50 ns/call** (20M ops/sec). `Tracker.tick` with 1000 vehicles: **~0.15 ms** (about 1% of the 60fps tick budget).

## License

[MIT](./LICENSE)
