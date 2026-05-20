# @kinesisjs/angular

## 0.2.0

### Minor Changes

- [`3c697f6`](https://github.com/kinesisjs/kinesis.js/commit/3c697f652750f12fb55acef20792fef8f9fcb97e) Thanks [@Mu-As](https://github.com/Mu-As)! - `KinesisMapDirective` now exposes the new `trail` adapter option as an optional `@Input`.

  ```html
  <div
    kinesisMap
    [positions]="positions"
    [trail]="{ enabled: true, maxPoints: 60, intervalMs: 100, color: '#3b82f6' }"
  ></div>
  ```

  Omit the input and the directive behaves identically to v0.1.2 (no trail layer created). See `@kinesisjs/openlayers` `TrailRenderOptions` for the full option surface.

### Patch Changes

- Updated dependencies [[`22cbc42`](https://github.com/kinesisjs/kinesis.js/commit/22cbc4258a81403e35f29254793ffca520059701), [`0ddb2b6`](https://github.com/kinesisjs/kinesis.js/commit/0ddb2b6380ecd574cfc37608f68a43db0d228f7a), [`bf6f455`](https://github.com/kinesisjs/kinesis.js/commit/bf6f45559eb0d34d666dcd5b30034f00cf41a448)]:
  - @kinesisjs/core@0.2.0
  - @kinesisjs/openlayers@0.2.0

## 0.1.2

### Patch Changes

- [`1f65ffb`](https://github.com/kinesisjs/kinesis.js/commit/1f65ffb7b52e704e35e197b02413e616f6c4f71c) Thanks [@Mu-As](https://github.com/Mu-As)! - `KinesisMapDirective` now exposes four advanced `TrackerOptions` as optional `@Input`s. Previously these were only reachable via the lower-level `kinesisTracker(...)` factory.
  - `[renderLagMs]` — real-time interpolation buffer size (default `1000`)
  - `[adaptive]` — adaptive zone thresholds object
  - `[fadeAnimation]` — duration / easing for the adaptive `fade` zone
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

- Updated dependencies [[`946aeeb`](https://github.com/kinesisjs/kinesis.js/commit/946aeebee1c64daa69acb450a0c375baef06d478)]:
  - @kinesisjs/core@0.1.2
  - @kinesisjs/openlayers@0.1.2

## 0.1.1

### Patch Changes

- Fix two critical issues discovered while building the first downstream Angular demo:

  **`@kinesisjs/core` — real-time interpolation now actually runs.**
  v0.1.0's `Tracker.tick()` always took the snap-to-current branch: at the moment a position was ingested, `now == current.receivedAt`, so `elapsed = now − previous.receivedAt ≥ period` immediately and stayed true, making interpolation unreachable outside fake-timer tests that rewind `Date.now()`. Added `TrackerOptions.renderLagMs` (default **1000 ms**), the standard interpolation-buffer pattern from real-time networking: tick computes `renderTime = now − renderLagMs` and uses that for elapsed/ratio. With the default, a 1 Hz feed slides the marker smoothly from the previous to the current point over each second. Pass `renderLagMs: 0` to restore the legacy snap-on-ingest behavior. Added two new tests covering both modes; the existing custom-interpolator tests no longer rely on `vi.setSystemTime` rewinding.

  **`@kinesisjs/angular` — built with ng-packagr, finally importable by Angular AOT consumers.**
  v0.1.0 was bundled with tsup, which preserved raw TS decorator output (`__decorate([Directive({...})], cls)`). Angular AOT consumers compile against Ivy partial-Ivy metadata (`ɵdir`, `ɵfac`, `ɵngDeclareDirective`, `ɵngDeclareClassMetadata`), which tsup does not emit — so `imports: [KinesisMapDirective]` in any consuming standalone component failed at AOT compile time with "Component imports must be standalone components, directives, pipes, or must be NgModules." Migrated build to `ng-packagr` (FESM2022 + partial-Ivy `.d.ts`); the package now compiles cleanly into Angular 17+ apps. No source-level API changes.

  **`@kinesisjs/openlayers`** — patch bump for monorepo cohesion only; no behavior change.

- Updated dependencies []:
  - @kinesisjs/core@0.1.1
  - @kinesisjs/openlayers@0.1.1

## 0.1.0

Initial public release.

- `KinesisMapDirective` — standalone directive for one-line setup
- `kinesisTracker` factory for programmatic use in services and route resolvers
- Automatic `DestroyRef` cleanup
- `Signal<Position[]>` and `Observable<Position[]>` both supported as the input source
- Peer dependency: Angular 17+
