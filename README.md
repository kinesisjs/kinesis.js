# Kinesis.js

> **Smooth, 60fps vehicle movement between periodic position updates.**

[![CI](https://github.com/kinesisjs/kinesis.js/actions/workflows/ci.yml/badge.svg)](https://github.com/kinesisjs/kinesis.js/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-f69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Provenance](https://img.shields.io/badge/npm%20provenance-signed-brightgreen.svg?logo=sigstore&logoColor=white)](https://docs.npmjs.com/generating-provenance-statements)

A framework-agnostic interpolation engine for fleet tracking, telematics, ride-hailing, transit, and asset-tracking applications. Renders smooth 60fps movement between periodic WebSocket or HTTP position updates while keeping memory bounded across multi-hour sessions.

## Packages

| Package                                          | Version                                                                                                               | Downloads                                                                                                             | Bundle                                                                                                                                               | Purpose                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`@kinesisjs/core`](./packages/core)             | [![npm](https://img.shields.io/npm/v/@kinesisjs/core.svg)](https://www.npmjs.com/package/@kinesisjs/core)             | [![dl](https://img.shields.io/npm/dm/@kinesisjs/core.svg)](https://www.npmjs.com/package/@kinesisjs/core)             | [![size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/core?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/core)             | Pure-TypeScript interpolation engine and lifecycle |
| [`@kinesisjs/openlayers`](./packages/openlayers) | [![npm](https://img.shields.io/npm/v/@kinesisjs/openlayers.svg)](https://www.npmjs.com/package/@kinesisjs/openlayers) | [![dl](https://img.shields.io/npm/dm/@kinesisjs/openlayers.svg)](https://www.npmjs.com/package/@kinesisjs/openlayers) | [![size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/openlayers?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/openlayers) | OpenLayers map adapter                             |
| [`@kinesisjs/angular`](./packages/angular)       | [![npm](https://img.shields.io/npm/v/@kinesisjs/angular.svg)](https://www.npmjs.com/package/@kinesisjs/angular)       | [![dl](https://img.shields.io/npm/dm/@kinesisjs/angular.svg)](https://www.npmjs.com/package/@kinesisjs/angular)       | [![size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/angular?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/angular)       | Angular 17+ Signals / RxJS wrapper                 |

All three packages are published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) and signed via sigstore — every release is cryptographically traceable to the GitHub Actions workflow that built it.

## Quick start

**Angular:**

```ts
import { Component, inject } from '@angular/core';
import { KinesisMapDirective } from '@kinesisjs/angular';

@Component({
  imports: [KinesisMapDirective],
  template: `<div kinesisMap [positions]="positions" class="map"></div>`,
})
export class LiveMapComponent {
  positions = inject(PositionsService).positions; // Signal<Position[]>
}
```

**TypeScript (any framework or vanilla):**

```ts
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle } from '@kinesisjs/openlayers';

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map, {
    style: createVehicleStyle({ icon: '/car.png' }),
  }),
  interpolation: 'adaptive',
});

tracker.start();
tracker.ingest(positions); // call from your WebSocket handler
```

## Features

- **Framework-agnostic core** — zero map or UI dependencies; adapters plug in
- **Adaptive interpolation** — period-aware classifier picks between linear, fade, and snap behaviour per vehicle
- **Bounded memory** — ring slot pattern, no growth across long-running sessions
- **Multi-state lifecycle** — `active` / `warning` / `stale` / `completed` events with typed payloads
- **Sanity checks** — anomalous-jump (distance vs. speed) and sharp-turn (heading) detection out of the box
- **Error-as-event** — public methods never throw; subscribe to the `error` channel instead
- **Custom interpolator interface** — sync or async; ready for route-aware map matching in v0.4
- **TypeScript-first** — strict typings, dual ESM + CJS build, source maps shipped

## Performance

1000 vehicles per tick: **~0.15 ms** — roughly 1% of the 60fps frame budget.

Run `pnpm test:bench` to reproduce on your hardware.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3: Framework wrapper                              │
│  (@kinesisjs/angular, react*, vue*, svelte*)             │
└──────────────────┬───────────────────────────────────────┘
                   │ uses
┌──────────────────▼───────────────────────────────────────┐
│  Layer 2: Map adapter                                    │
│  (@kinesisjs/openlayers, leaflet*, maplibre*, mapbox*)   │
└──────────────────┬───────────────────────────────────────┘
                   │ uses
┌──────────────────▼───────────────────────────────────────┐
│  Layer 1: Core engine                                    │
│  (@kinesisjs/core)                                       │
│  ─ Clock (rAF-based 60fps tick)                          │
│  ─ Interpolator (linear / cubic / geodesic / adaptive)   │
│  ─ Sweeper (multi-state lifecycle)                       │
│  ─ EventBus (typed)                                      │
│  ─ math-utils (haversine, shortest-arc, lerp)            │
└──────────────────────────────────────────────────────────┘
```

`*` planned for v0.2 and later.

## Development

```bash
pnpm install
pnpm verify     # lint + typecheck + test + build
pnpm test:bench # benchmark suite
```

Requirements: Node `>=20`, pnpm `>=9`.

### Scripts

| Script            | Description                             |
| ----------------- | --------------------------------------- |
| `pnpm test`       | Run the full test suite (Vitest)        |
| `pnpm test:watch` | Watch mode                              |
| `pnpm test:bench` | Run benchmarks                          |
| `pnpm typecheck`  | TypeScript noEmit across all packages   |
| `pnpm lint`       | ESLint flat config, zero warnings       |
| `pnpm format`     | Prettier write                          |
| `pnpm build`      | tsup build (dual ESM + CJS + .d.ts)     |
| `pnpm changeset`  | Create a changeset for the next release |

## Roadmap

| Version | Focus                                                 |
| ------- | ----------------------------------------------------- |
| v0.1    | Core, OpenLayers adapter, Angular wrapper             |
| v0.2    | Web Worker mode, gap visualisation                    |
| v0.3    | Leaflet adapter                                       |
| v0.4    | Route-aware interpolation (OSRM, Mapbox Map Matching) |
| v1.0+   | MapLibre, Mapbox GL, React, Vue, Svelte, and more     |

## Contributing

Run `pnpm verify` before opening a pull request. CI runs the same pipeline (lint, typecheck, test, build) on every push.

## License

[MIT](./LICENSE)
