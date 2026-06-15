# @kinesisjs/angular

## 0.5.1

### Patch Changes

- Updated dependencies [[`c982ab1`](https://github.com/kinesisjs/kinesis.js/commit/c982ab16cbf9efc7bc5915aa4d238891d0cc463a)]:
  - @kinesisjs/core@0.5.1
  - @kinesisjs/openlayers@0.2.6

## 0.5.0

### Minor Changes

- [#22](https://github.com/kinesisjs/kinesis.js/pull/22) [`baea34e`](https://github.com/kinesisjs/kinesis.js/commit/baea34e321fc74f3d3d3c91542eb567443f88b13) Thanks [@Mu-As](https://github.com/Mu-As)! - Expose `[playout]` `@Input` on `KinesisMapDirective`, mirroring the
  `TrackerOptions.playout` field that landed in `@kinesisjs/core@0.5.0`.

  ```html
  <div kinesisMap [positions]="positions" [interpolation]="'smooth'" [playout]="'auto'"></div>
  ```

  Forwarded to the underlying `Tracker` only when set, so omitting the
  input keeps the classical real-time path. Use `'auto'` for unknown
  feeds (Tracker self-calibrates from the gap history) or
  `{ pace, bufferMs, maxQueue }` when you know your worst-case gap.

## 0.4.0

### Minor Changes

- [#20](https://github.com/kinesisjs/kinesis.js/pull/20) [`e092515`](https://github.com/kinesisjs/kinesis.js/commit/e092515c3c8d927cbd2d106394a324bd4d6818c8) Thanks [@Mu-As](https://github.com/Mu-As)! - Expose `[playout]` `@Input` on `KinesisMapDirective`, mirroring the
  `TrackerOptions.playout` field that landed in `@kinesisjs/core@0.5.0`.

  ```html
  <div kinesisMap [positions]="positions" [interpolation]="'smooth'" [playout]="'auto'"></div>
  ```

  Forwarded to the underlying `Tracker` only when set, so omitting the
  input keeps the classical real-time path. Use `'auto'` for unknown
  feeds (Tracker self-calibrates from the gap history) or
  `{ pace, bufferMs, maxQueue }` when you know your worst-case gap.

## 0.3.2

### Patch Changes

- Updated dependencies [[`cbf8a56`](https://github.com/kinesisjs/kinesis.js/commit/cbf8a562caaf557e98882b11be6b94b7e447572f)]:
  - @kinesisjs/core@0.5.0
  - @kinesisjs/openlayers@0.2.5

## 0.3.1

### Patch Changes

- Updated dependencies [[`95099fe`](https://github.com/kinesisjs/kinesis.js/commit/95099fe082d5a1bf715a4ad3bc88a76f98f7951a)]:
  - @kinesisjs/core@0.4.0
  - @kinesisjs/openlayers@0.2.4

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

### Patch Changes

- Updated dependencies [[`02cf547`](https://github.com/kinesisjs/kinesis.js/commit/02cf547fae529c6d7669e4c8be47794445e3139a)]:
  - @kinesisjs/core@0.3.0
  - @kinesisjs/openlayers@0.2.3

## 0.2.2

### Patch Changes

- [`fb22257`](https://github.com/kinesisjs/kinesis.js/commit/fb22257de11eb0e42b975c18cffdc0ffe6199c0f) Thanks [@Mu-As](https://github.com/Mu-As)! - Release pipeline restored — npm Trusted Publishing now verified end-to-end.

  No runtime changes. This patch only re-establishes the OIDC publish flow
  after the v0.1.2 / v0.2.0 / v0.2.1 release failures, by ensuring all three
  packages have valid Trusted Publisher rules on npmjs.com that match the
  release workflow.

- Updated dependencies [[`fb22257`](https://github.com/kinesisjs/kinesis.js/commit/fb22257de11eb0e42b975c18cffdc0ffe6199c0f)]:
  - @kinesisjs/core@0.2.1
  - @kinesisjs/openlayers@0.2.2

## 0.2.1

### Patch Changes

- [`a2e436a`](https://github.com/kinesisjs/kinesis.js/commit/a2e436a57dbd27981624461ec64f2d90e6a3c317) Thanks [@Mu-As](https://github.com/Mu-As)! - `KinesisMapDirective` now exposes the `warningOpacity` adapter option as an
  optional `@Input`, completing the v0.2.0 gap-visualization story for directive
  users (previously reachable only via the `kinesisTracker` factory).

  ```html
  <div kinesisMap [positions]="positions" [warningThreshold]="60000" [warningOpacity]="0.5"></div>
  ```

  Marker dims to 50% when a vehicle's idle exceeds `warningThreshold`; restores to
  1.0 on the next ingest or sweeper-detected recovery. Omit the input to keep the
  v0.2.0 behavior (no opacity change on warning).

- Updated dependencies [[`aa2ea81`](https://github.com/kinesisjs/kinesis.js/commit/aa2ea8143a724f03db310636ef48658b54a36095)]:
  - @kinesisjs/openlayers@0.2.1

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
