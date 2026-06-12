# @kinesisjs/core

## 0.4.0

### Minor Changes

- [#16](https://github.com/kinesisjs/kinesis.js/pull/16) [`95099fe`](https://github.com/kinesisjs/kinesis.js/commit/95099fe082d5a1bf715a4ad3bc88a76f98f7951a) Thanks [@Mu-As](https://github.com/Mu-As)! - Add `interpolation: 'smooth'` — a 3-point centripetal Catmull-Rom mode for
  jitter and variable-period feeds.

  The Tracker now keeps a third historical point per vehicle (`previous2`)
  and routes smooth-mode ticks through a cubic spline over `previous2 →
previous → current`, with a mirror phantom for the trailing tangent. The
  marker glides through each waypoint instead of kinking, which is
  especially visible on irregular feeds (random arrival times, dead
  reckoning, replay scrubbing).

  Opt-in and conservative:
  - Default stays `'linear'`. Existing apps see no behavioural change.
  - Until the third ingest lands the spline falls back to linear — no
    spurious motion from incomplete history.
  - If the `previous2 → previous` gap exceeds `maxInterpolationGap`, that
    control point is dropped (stale data shouldn't warp the curve).
  - All sanity checks (anomalous jump, sharp turn, render-lag warm-up) and
    the existing custom-interpolator path are untouched.

  Also exposes `catmullRomLerp` as a public math helper, alongside
  `linearLerp` / `haversineDistance` / `shortestArcDiff`, for authors of
  custom interpolators who want the same smoothing primitive.

## 0.3.0

### Minor Changes

- [`02cf547`](https://github.com/kinesisjs/kinesis.js/commit/02cf547fae529c6d7669e4c8be47794445e3139a) Thanks [@Mu-As](https://github.com/Mu-As)! - Add opt-in Web Worker mode (`worker: true` or `worker: { url }`).

  The tick loop — interpolation, sanity checks, and the sweeper — can now run
  off the main thread inside a Web Worker, keeping the UI thread free for the
  actual map/DOM writes. The adapter stays on the main thread and is driven by
  messages the worker streams back, so existing adapters work unchanged.
  - `worker: true` spins the worker up from an inlined Blob (zero setup; adds
    ~2.4 KB gzip to the core bundle).
  - `worker: { url }` loads the bundled worker script from a URL you control,
    avoiding the inline payload.

  The public API is unchanged — `new Tracker({ worker: true })` transparently
  returns a worker-backed tracker with the same surface. `@kinesisjs/angular`'s
  `[kinesisMap]` directive exposes it via a new `[worker]` input.

  Caveats: a `CustomInterpolator` isn't supported in worker mode (functions
  can't cross the worker boundary; construction throws), `updateOpacity`-based
  fade animations degrade to snapping, and `getStats()` returns a snapshot
  refreshed every ~30 ticks.

## 0.2.1

### Patch Changes

- [`fb22257`](https://github.com/kinesisjs/kinesis.js/commit/fb22257de11eb0e42b975c18cffdc0ffe6199c0f) Thanks [@Mu-As](https://github.com/Mu-As)! - Release pipeline restored — npm Trusted Publishing now verified end-to-end.

  No runtime changes. This patch only re-establishes the OIDC publish flow
  after the v0.1.2 / v0.2.0 / v0.2.1 release failures, by ensuring all three
  packages have valid Trusted Publisher rules on npmjs.com that match the
  release workflow.

## 0.2.0

### Minor Changes

- [`22cbc42`](https://github.com/kinesisjs/kinesis.js/commit/22cbc4258a81403e35f29254793ffca520059701) Thanks [@Mu-As](https://github.com/Mu-As)! - `TrackAdapter` gains an optional `setVehicleState(id, state)` hook. Tracker calls it whenever a vehicle transitions between lifecycle states (`active ↔ warning`), so adapters can render gap-visualization treatment — fading, badging, dashed trails — without having to subscribe to the event bus externally.

  The hook fires:
  - On warning (sweeper detects idle > warningThreshold)
  - On recovery to active (fresh ingest, or sweeper after slot revives)

  It does NOT fire for `stale` or `completed` — those are followed immediately by `removeVehicle(id)`, and rendering a transient terminal state isn't useful.

  Backward compatible: the method is optional in the interface, and adapters that don't implement it (or instances on the existing v0.1.x API) keep working unchanged.

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
