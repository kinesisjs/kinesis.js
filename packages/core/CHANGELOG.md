# @kinesisjs/core

## 0.1.2

### Patch Changes

- [`946aeeb`](https://github.com/kinesisjs/kinesis.js/commit/946aeebee1c64daa69acb450a0c375baef06d478) Thanks [@Mu-As](https://github.com/Mu-As)! - Lower `AdaptiveInterpolator` default `minPeriodMs` from 1000 to 500.

  At 1000 ms the default placed a typical 1 Hz GPS feed exactly on the boundary between the `none` and `linear` adaptive zones, and `setInterval`/`interval(1000)` jitter routinely produced sub-1000 ms periods. Each clipped tick fell into the `none` zone and teleported the marker — visible micro-skipping with the otherwise smooth `renderLagMs` buffer.

  The new 500 ms default keeps 1 Hz feeds firmly inside `linear` regardless of jitter. Sub-second feeds that explicitly want the `none` behavior can opt in:

  ```ts
  new Tracker({ adapter, interpolation: 'adaptive', adaptive: { minPeriodMs: 1000 } });
  ```

  No API change, only the default value.

## 0.1.1

### Patch Changes

- Fix two critical issues discovered while building the first downstream Angular demo:

  **`@kinesisjs/core` — real-time interpolation now actually runs.**
  v0.1.0's `Tracker.tick()` always took the snap-to-current branch: at the moment a position was ingested, `now == current.receivedAt`, so `elapsed = now − previous.receivedAt ≥ period` immediately and stayed true, making interpolation unreachable outside fake-timer tests that rewind `Date.now()`. Added `TrackerOptions.renderLagMs` (default **1000 ms**), the standard interpolation-buffer pattern from real-time networking: tick computes `renderTime = now − renderLagMs` and uses that for elapsed/ratio. With the default, a 1 Hz feed slides the marker smoothly from the previous to the current point over each second. Pass `renderLagMs: 0` to restore the legacy snap-on-ingest behavior. Added two new tests covering both modes; the existing custom-interpolator tests no longer rely on `vi.setSystemTime` rewinding.

  **`@kinesisjs/angular` — built with ng-packagr, finally importable by Angular AOT consumers.**
  v0.1.0 was bundled with tsup, which preserved raw TS decorator output (`__decorate([Directive({...})], cls)`). Angular AOT consumers compile against Ivy partial-Ivy metadata (`ɵdir`, `ɵfac`, `ɵngDeclareDirective`, `ɵngDeclareClassMetadata`), which tsup does not emit — so `imports: [KinesisMapDirective]` in any consuming standalone component failed at AOT compile time with "Component imports must be standalone components, directives, pipes, or must be NgModules." Migrated build to `ng-packagr` (FESM2022 + partial-Ivy `.d.ts`); the package now compiles cleanly into Angular 17+ apps. No source-level API changes.

  **`@kinesisjs/openlayers`** — patch bump for monorepo cohesion only; no behavior change.

## 0.1.0

Initial public release.

- `Tracker` orchestrator with validation, throttling, and configurable initial-position behaviour (`show-immediately` / `wait-for-second` / `fade-in`)
- `Interpolator` modes: `linear`, `cubic`, `geodesic`, `none`
- `AdaptiveInterpolator` — period-aware four-zone classifier
- `Sweeper` — multi-state vehicle lifecycle (`active` / `warning` / `stale` / `completed`)
- `CustomInterpolator` interface with sync/async support
- Tick-loop sanity checks: anomalous-jump (haversine + speed) and sharp-turn (heading)
- Event-based error handling — public methods never throw
- Performance telemetry — tick history percentiles, dropped ticks, ingest rate, memory breakdown
- Public utilities: `haversineDistance`, `shortestArcDiff`, `linearLerp`
- Benchmarked: 1000 vehicles ≈ 0.15 ms per tick
