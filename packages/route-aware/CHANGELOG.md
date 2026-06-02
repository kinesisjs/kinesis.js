# @kinesisjs/route-aware

## 0.1.0

### Minor Changes

- [#12](https://github.com/kinesisjs/kinesis.js/pull/12) [`3a5f3f6`](https://github.com/kinesisjs/kinesis.js/commit/3a5f3f6dd57e0cf2afe906bb252376123547dc43) Thanks [@Mu-As](https://github.com/Mu-As)! - feat(route-aware): add the road-snapping CustomInterpolator package

  New `@kinesisjs/route-aware` — a `CustomInterpolator` for `@kinesisjs/core`
  that asks an OSRM server for the real road between two GPS points and walks
  that polyline at constant arc-length speed. Markers follow the actual street
  network instead of cutting straight lines across buildings.

  Highlights:
  - `OSRMInterpolator` drops into `new Tracker({ interpolation: ri })` — no
    changes to the existing engine, no map adapter coupling.
  - The tick is never blocked: `compute()` is always synchronous. `prepare()`
    warms the cache in the background; cache misses fall back to a linear lerp
    this tick and snap to the road on the next.
  - LRU + coordinate-grid hashing → high cache hit rate (a 500-vehicle fleet on
    recurring routes typically generates tens of unique segment fetches).
  - Coalesces concurrent fetches for the same segment hash.
  - Detour guard (default `2.5×` straight-line) rejects implausible routes —
    segment keeps using linear fallback rather than misleading the operator.
  - `dispose()` clears cache + in-flight set on `tracker.destroy()`.

  Defaults point at the public `router.project-osrm.org` demo endpoint for
  evaluation; production fleets should self-host (see README + PRD §22).
