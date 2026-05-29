# @kinesisjs/angular

> Angular Signals / RxJS wrapper for Kinesis.js — one-line directive setup.

[![npm](https://img.shields.io/npm/v/@kinesisjs/angular.svg)](https://www.npmjs.com/package/@kinesisjs/angular)
[![Downloads](https://img.shields.io/npm/dm/@kinesisjs/angular.svg)](https://www.npmjs.com/package/@kinesisjs/angular)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/angular?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/angular)
[![Provenance](https://img.shields.io/badge/npm%20provenance-signed-brightgreen.svg?logo=sigstore&logoColor=white)](https://www.npmjs.com/package/@kinesisjs/angular)
[![Changelog](https://img.shields.io/badge/changelog-keep%20a%20changelog-blue)](https://github.com/kinesisjs/kinesis.js/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Angular](https://img.shields.io/badge/peer-Angular%20%E2%89%A517-dd0031.svg?logo=angular&logoColor=white)](https://angular.dev/)

Angular lifecycle and reactive-binding layer on top of `@kinesisjs/core` and `@kinesisjs/openlayers`.

## Scope

- **`KinesisMapDirective`** — standalone directive, one-line declarative setup
- **`kinesisTracker`** factory — programmatic use inside services or route resolvers
- **OpenLayers or Leaflet** — pick via `[adapter]="'openlayers' | 'leaflet'"`
- Automatic binding for both `Signal<Position[]>` and `Observable<Position[]>`
- Automatic teardown via `DestroyRef` — no manual `tracker.destroy()` required
- Angular 17+ standalone APIs

## Installation

Pick the adapter you'll use:

```bash
# OpenLayers
pnpm add @kinesisjs/core @kinesisjs/openlayers @kinesisjs/angular ol

# Leaflet
pnpm add @kinesisjs/core @kinesisjs/leaflet @kinesisjs/angular leaflet
```

**Peer dependencies:** `@angular/core >=17`, `@angular/common >=17`, `rxjs >=7`. **`ol >=8` and `leaflet >=1.7` are both _optional_** — install whichever adapter(s) you use. Both map libraries touch `window` at import; if you SSR (Angular Universal), gate the directive to client-side rendering.

## Usage

```ts
import { Component, inject } from '@angular/core';
import { KinesisMapDirective } from '@kinesisjs/angular';

@Component({
  selector: 'app-live-map',
  standalone: true,
  imports: [KinesisMapDirective],
  template: `
    <div
      kinesisMap
      [positions]="positions"
      [center]="[29.0, 41.0]"
      [zoom]="10"
      [interpolation]="'adaptive'"
      class="map-container"
    ></div>
  `,
  styles: [
    `
      .map-container {
        width: 100%;
        height: 600px;
      }
    `,
  ],
})
export class LiveMapComponent {
  positions = inject(PositionsService).positions; // Signal<Position[]>
}
```

### Switching to Leaflet

Pass `[adapter]="'leaflet'"` and import Leaflet's CSS in your app's global styles (Leaflet needs it; OpenLayers ships its tiny CSS via the `ol/ol.css` import you do yourself). Same template, same inputs:

```ts
import 'leaflet/dist/leaflet.css';
import { createVehicleStyle } from '@kinesisjs/leaflet';

@Component({
  template: `
    <div
      kinesisMap
      [adapter]="'leaflet'"
      [positions]="positions"
      [interpolation]="'adaptive'"
      [vehicleStyle]="lfStyle"
      class="map-container"
    ></div>
  `,
  imports: [KinesisMapDirective],
  standalone: true,
})
export class LiveLeafletMapComponent {
  positions = inject(PositionsService).positions;
  lfStyle = createVehicleStyle({
    speedColorBands: [
      { max: 30, color: '#22c55e' },
      { max: 80, color: '#eab308' },
      { max: 130, color: '#ef4444' },
    ],
  });
}
```

### Programmatic factory

Use `kinesisTracker(...)` when you need control outside a template — for example inside a service or route resolver, or when you manage the OpenLayers map yourself:

```ts
@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly map = inject(MapService).map;
  private readonly positions = inject(PositionsService).positions;

  tracker = kinesisTracker({
    map: this.map,
    positions: this.positions,
    trackerOptions: { interpolation: 'adaptive' },
    adapterOptions: {
      style: createVehicleStyle({ icon: '/car.png' }),
    },
  });
}
```

**Note:** `kinesisTracker(...)` must be called inside an Angular injection context (constructor, field initializer, or `runInInjectionContext`).

## Directive inputs

| Input                     | Type                                                                              | Default        | Description                                                 |
| ------------------------- | --------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `positions` ⭐            | `Signal<Position[]> \| Observable<Position[]>`                                    | —              | Position source (required)                                  |
| `adapter`                 | `'openlayers' \| 'leaflet'`                                                       | `'openlayers'` | Map adapter — install the matching peer (`ol` or `leaflet`) |
| `center`                  | `[number, number]`                                                                | `[29.0, 41.0]` | Initial map centre (lng/lat) — swapped for Leaflet          |
| `zoom`                    | `number`                                                                          | `10`           | Initial zoom                                                |
| `interpolation`           | `'linear' \| 'cubic' \| 'geodesic' \| 'none' \| 'adaptive' \| CustomInterpolator` | `'linear'`     | Interpolation behaviour                                     |
| `renderLagMs`             | `number`                                                                          | `1000`         | Render-buffer lag (ms); `0` disables real-time interp       |
| `maxInterpolationGap`     | `number`                                                                          | `30000`        | Skip interpolation past this gap (ms)                       |
| `warningThreshold`        | `number`                                                                          | `60000`        | Idle ms before `warning` state                              |
| `staleThreshold`          | `number`                                                                          | `600000`       | Idle ms before `stale` removal                              |
| `ingestThrottle`          | `number`                                                                          | `100`          | Min ms between ingests per vehicle                          |
| `adaptive`                | `AdaptiveOptions`                                                                 | —              | Zone thresholds for `interpolation: 'adaptive'`             |
| `fadeAnimation`           | `FadeAnimationOptions`                                                            | —              | Fade duration/easing (adaptive `fade` zone)                 |
| `initialPositionBehavior` | `'show-immediately' \| 'wait-for-second' \| 'fade-in'`                            | —              | Behaviour on a vehicle's first position                     |
| `vehicleStyle`            | OL `VehicleStyleProvider` \| Leaflet `VehicleStyleProvider`                       | —              | Style provider matching the chosen `[adapter]`              |
| `trail`                   | `TrailRenderOptions` (OL or Leaflet — structurally identical)                     | —              | Fading per-vehicle trail (`[trail]="{ enabled: true }"`)    |
| `warningOpacity`          | `number`                                                                          | —              | Dim opacity (0–1) while a vehicle is in `warning`           |
| `worker`                  | `boolean \| { url: string \| URL }`                                               | `false`        | Run the tick loop in a Web Worker                           |

## Accessing the tracker

```ts
@ViewChild('map', { read: KinesisMapDirective }) directive!: KinesisMapDirective;

ngAfterViewInit() {
  const tracker = this.directive.getTracker(); // Tracker | undefined
  const map = this.directive.getMap();         // OLMap | undefined

  tracker?.on('vehiclewarning', ({ vehicleId }) => /* apply visual hint */);
  tracker?.markCompleted('v1');
  console.log(tracker?.getStats());
}
```

## Public API

```ts
export { KinesisMapDirective, kinesisTracker, bindPositions };
export type { KinesisTrackerConfig };
```

## License

[MIT](./LICENSE)
