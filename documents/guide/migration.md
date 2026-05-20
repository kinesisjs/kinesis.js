# Migration

Both 0.1.x bumps are **non-breaking** — same API surface, only fixed behavior and added optional inputs. Update with:

```bash
pnpm update @kinesisjs/core @kinesisjs/openlayers @kinesisjs/angular --latest
```

…then rebuild your consumer app.

## 0.1.0 → 0.1.1

Two critical bug fixes discovered by the first downstream Angular consumer.

### `@kinesisjs/core` — real-time interpolation now actually runs

v0.1.0's `Tracker.tick()` always snapped to `current` in real-time scenarios. The bug was in the elapsed/period computation: at the moment a position was ingested, `now == current.receivedAt`, so `elapsed = now − previous.receivedAt ≥ period` immediately and stayed true. The interpolation branch was unreachable outside fake-timer tests that rewound `Date.now()`.

The fix is a new option, `TrackerOptions.renderLagMs` (default **1 000 ms**), implementing the standard interpolation-buffer pattern from real-time networking. See [Interpolation → Render lag](/concepts/interpolation#render-lag).

**You do not need to change anything.** If you were relying on the legacy snap-on-ingest behavior, set `renderLagMs: 0` explicitly.

### `@kinesisjs/angular` — actually consumable by Angular AOT

v0.1.0 was bundled with tsup, which preserved raw TS decorator output. Angular AOT consumers couldn't read the directive's metadata; `imports: [KinesisMapDirective]` failed at compile time with _"Component imports must be standalone components, directives, pipes, or must be NgModules."_

Rebuilt with `ng-packagr` (FESM2022 + Ivy partial-Ivy). Drops in cleanly to any Angular 17+ AOT consumer.

## 0.1.1 → 0.1.2

Two polish items; **no API changes**, two default-behavior tweaks.

### Adaptive `minPeriodMs` default 1 000 → 500

At the previous 1 000 ms default, a 1 Hz GPS feed (the most common real-world case) landed exactly on the boundary between the `none` and `linear` adaptive zones. `setInterval` jitter routinely produced periods of 990–1 010 ms — under 1 000 dropped into `none` and teleported the marker for that tick.

The new 500 ms default keeps typical 1 Hz feeds firmly inside `linear`. If you have a sub-second feed and explicitly want the `none` behavior, set it back:

```ts
new Tracker({ adapter, interpolation: 'adaptive', adaptive: { minPeriodMs: 1000 } });
```

### `KinesisMapDirective` gains four new `@Input`s

Previously these tracker options were only reachable via the `kinesisTracker(...)` factory. The directive now exposes them directly:

- `[renderLagMs]` — interpolation buffer size (default `1000`)
- `[adaptive]` — adaptive zone thresholds object
- `[fadeAnimation]` — duration / easing for the `fade` zone
- `[initialPositionBehavior]` — `'show-immediately' | 'wait-for-second' | 'fade-in'`

Example:

```html
<div
  kinesisMap
  [positions]="positions"
  [interpolation]="'adaptive'"
  [renderLagMs]="800"
  [adaptive]="{ minPeriodMs: 200, fadeThresholdMs: 30000 }"
  [fadeAnimation]="{ duration: 400, easing: 'linear' }"
  [initialPositionBehavior]="'fade-in'"
></div>
```

All four inputs are optional — omitting them keeps the tracker defaults.
