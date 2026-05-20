# @kinesisjs/openlayers

## 0.1.2

### Patch Changes

- Updated dependencies [[`946aeeb`](https://github.com/kinesisjs/kinesis.js/commit/946aeebee1c64daa69acb450a0c375baef06d478)]:
  - @kinesisjs/core@0.1.2

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

## 0.1.0

Initial public release.

- Full `TrackAdapter` implementation for OpenLayers
- `managedFeatureIds` option to coexist safely with non-vehicle features inside a shared `VectorLayer`
- `updateOpacity` capability for fade animations
- `getMemoryEstimate` capability for accurate stats
- `createVehicleStyle` helper with Icon / Circle modes, heading rotation, and speed colour bands
- `colorForSpeed` exported standalone for custom style factories
