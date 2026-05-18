# @kinesisjs/angular

> Angular Signals / RxJS wrapper for Kinesis.js — one-line directive setup.

[![npm](https://img.shields.io/npm/v/@kinesisjs/angular.svg)](https://www.npmjs.com/package/@kinesisjs/angular)
[![Changelog](https://img.shields.io/badge/changelog-keep%20a%20changelog-blue)](https://github.com/kinesisjs/kinesis.js/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Angular](https://img.shields.io/badge/peer-Angular%20%E2%89%A517-dd0031.svg?logo=angular&logoColor=white)](https://angular.dev/)

Angular lifecycle and reactive-binding layer on top of `@kinesisjs/core` and `@kinesisjs/openlayers`.

## Scope

- **`KinesisMapDirective`** — standalone directive, one-line declarative setup
- **`kinesisTracker`** factory — programmatic use inside services or route resolvers
- Automatic binding for both `Signal<Position[]>` and `Observable<Position[]>`
- Automatic teardown via `DestroyRef` — no manual `tracker.destroy()` required
- Angular 17+ standalone APIs

## Installation

```bash
pnpm add @kinesisjs/core @kinesisjs/openlayers @kinesisjs/angular ol
```

**Peer dependencies:** `@angular/core >=17`, `@angular/common >=17`, `rxjs >=7`, `ol >=8`.

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

| Input                 | Type                                                                              | Default        | Description                  |
| --------------------- | --------------------------------------------------------------------------------- | -------------- | ---------------------------- |
| `positions` ⭐        | `Signal<Position[]> \| Observable<Position[]>`                                    | —              | Position source (required)   |
| `center`              | `[number, number]`                                                                | `[29.0, 41.0]` | Initial map centre (lng/lat) |
| `zoom`                | `number`                                                                          | `10`           | Initial zoom                 |
| `interpolation`       | `'linear' \| 'cubic' \| 'geodesic' \| 'none' \| 'adaptive' \| CustomInterpolator` | `'linear'`     | Interpolation behaviour      |
| `maxInterpolationGap` | `number`                                                                          | `30000`        | Milliseconds                 |
| `warningThreshold`    | `number`                                                                          | `60000`        | Milliseconds                 |
| `staleThreshold`      | `number`                                                                          | `600000`       | Milliseconds                 |
| `ingestThrottle`      | `number`                                                                          | `100`          | Milliseconds                 |
| `vehicleStyle`        | `VehicleStyleProvider`                                                            | —              | OpenLayers style provider    |

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
