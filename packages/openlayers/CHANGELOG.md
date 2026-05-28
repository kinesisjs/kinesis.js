# @kinesisjs/openlayers

## 0.2.3

### Patch Changes

- Updated dependencies [[`02cf547`](https://github.com/kinesisjs/kinesis.js/commit/02cf547fae529c6d7669e4c8be47794445e3139a)]:
  - @kinesisjs/core@0.3.0

## 0.2.2

### Patch Changes

- [`fb22257`](https://github.com/kinesisjs/kinesis.js/commit/fb22257de11eb0e42b975c18cffdc0ffe6199c0f) Thanks [@Mu-As](https://github.com/Mu-As)! - Release pipeline restored — npm Trusted Publishing now verified end-to-end.

  No runtime changes. This patch only re-establishes the OIDC publish flow
  after the v0.1.2 / v0.2.0 / v0.2.1 release failures, by ensuring all three
  packages have valid Trusted Publisher rules on npmjs.com that match the
  release workflow.

- Updated dependencies [[`fb22257`](https://github.com/kinesisjs/kinesis.js/commit/fb22257de11eb0e42b975c18cffdc0ffe6199c0f)]:
  - @kinesisjs/core@0.2.1

## 0.2.1

### Patch Changes

- [`aa2ea81`](https://github.com/kinesisjs/kinesis.js/commit/aa2ea8143a724f03db310636ef48658b54a36095) Thanks [@Mu-As](https://github.com/Mu-As)! - Trail layer was invisible by default in v0.2.0 — the layer's `zIndex: -1` default
  placed it BELOW the standard OSM tile layer (zIndex 0), which then overdrew the
  trail. Reported by the first downstream consumer that enabled `trail: { enabled: true }`
  without overriding zIndex.

  Fix:
  - Trail layer is now added to the map BEFORE the adapter's vehicle layer. OpenLayers'
    natural render order (later-added on top) puts trails behind vehicles without
    needing zIndex tricks.
  - `TrailRenderOptions.zIndex` default is now `undefined` (previously `-1`). The
    option remains available as an explicit override for `existingLayer` mode, where
    the user's own vehicle layer is already in the stack and trail-vs-vehicle order
    cannot be controlled by add sequence alone.

  Two new tests lock in the fix:
  - `adds the trail layer BEFORE the vehicle layer (trail renders below)`
  - `honors explicit trail.zIndex when provided (existingLayer override)`

  No API surface change; users who were already setting `trail.zIndex` explicitly
  keep their behavior. Users on the default config get visible trails.

## 0.2.0

### Minor Changes

- [`0ddb2b6`](https://github.com/kinesisjs/kinesis.js/commit/0ddb2b6380ecd574cfc37608f68a43db0d228f7a) Thanks [@Mu-As](https://github.com/Mu-As)! - Gap visualization: `OpenLayersAdapter` now implements the new `setVehicleState` hook.

  Every state change always writes a `vehicleState` feature property (useful for external readers / popup labels). When `OpenLayersAdapterOptions.warningOpacity` is configured, the adapter additionally dims the marker on `warning` and restores opacity 1 on `active`:

  ```ts
  new OpenLayersAdapter(map, {
    style: vehicleStyle,
    warningOpacity: 0.5, // marker fades to 50% when warning threshold passes
  });
  ```

  `stale` and `completed` are handled by `removeVehicle` and produce no opacity work here. Without `warningOpacity`, only the property is set — no visual change (backward compatible default).

  Pairs naturally with the v0.2.0 `trail` rendering: the dimmed marker plus the still-rendered trail tell the user "we know the last position but haven't heard back" without removing the vehicle from the map.

- [`bf6f455`](https://github.com/kinesisjs/kinesis.js/commit/bf6f45559eb0d34d666dcd5b30034f00cf41a448) Thanks [@Mu-As](https://github.com/Mu-As)! - Per-vehicle trail rendering — fading polyline behind each marker showing recent positions.

  Opt in via `OpenLayersAdapter`:

  ```ts
  new OpenLayersAdapter(map, {
    style: vehicleStyle,
    trail: { enabled: true, maxPoints: 60, intervalMs: 100, width: 3, opacity: 0.5 },
  });
  ```

  A separate `VectorLayer` (`name: 'kinesis-trails'`, default `zIndex: -1`) is added when enabled — trails always render below vehicle markers regardless of the vehicle layer's own zIndex. Each vehicle gets a `Feature<LineString>` with id `trail:<vehicleId>`.

  Color resolution: explicit `trail.color` → `TrailPoint.meta.color` (string) → `trail.defaultColor` → `#3b82f6`. Hex inputs (`#rrggbb`, `#rgb`) have the trail's `opacity` applied automatically as alpha; non-hex colors (named, `rgb()`, `rgba()`) are passed through unchanged so the caller controls alpha.

  Throttling: `intervalMs` (default 100 ms) caps how often a tick is appended to a trail. The Tracker runs at ~60 fps, so without throttling a 60-point buffer fills in one second. The default samples at ~10 Hz, giving a ~6-second visible trail.

  Memory: per-trail overhead ≈ 64 bytes + 16 bytes per coordinate; reflected in `getMemoryEstimate()`. Trail features are torn down with `removeVehicle(id)` and the trail layer is removed from the map in `destroy()`.

  Backward compatible — adapter behaves identically to v0.1.x when `trail` is omitted or `{ enabled: false }`.

### Patch Changes

- Updated dependencies [[`22cbc42`](https://github.com/kinesisjs/kinesis.js/commit/22cbc4258a81403e35f29254793ffca520059701)]:
  - @kinesisjs/core@0.2.0

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
