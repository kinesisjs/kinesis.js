# @kinesisjs/route-aware

## 0.1.3

### Patch Changes

- [#24](https://github.com/kinesisjs/kinesis.js/pull/24) [`c982ab1`](https://github.com/kinesisjs/kinesis.js/commit/c982ab16cbf9efc7bc5915aa4d238891d0cc463a) Thanks [@Mu-As](https://github.com/Mu-As)! - fix: harden against untrusted input
  - **leaflet**: the marker `divIcon` HTML now coerces numeric options (`heading`/`speed`/`iconSize`/…) to finite numbers and escapes interpolated `icon`/`color` values, so a malformed feed or crafted style option can no longer break out of an HTML attribute (DOM-XSS hardening).
  - **core**: non-finite `heading`/`speed` are dropped on ingest, so malformed feed values never reach a render adapter.
  - **route-aware**: the OSRM `baseUrl` must now be an `http(s)` URL and the routing profile is `encodeURIComponent`-escaped before being placed in the request URL.

- Updated dependencies [[`c982ab1`](https://github.com/kinesisjs/kinesis.js/commit/c982ab16cbf9efc7bc5915aa4d238891d0cc463a)]:
  - @kinesisjs/core@0.5.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`cbf8a56`](https://github.com/kinesisjs/kinesis.js/commit/cbf8a562caaf557e98882b11be6b94b7e447572f)]:
  - @kinesisjs/core@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`95099fe`](https://github.com/kinesisjs/kinesis.js/commit/95099fe082d5a1bf715a4ad3bc88a76f98f7951a)]:
  - @kinesisjs/core@0.4.0

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
