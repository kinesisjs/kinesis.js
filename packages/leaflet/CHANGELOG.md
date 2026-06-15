# @kinesisjs/leaflet

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

- [`01444b9`](https://github.com/kinesisjs/kinesis.js/commit/01444b90d543c641652ac74c1d27d408bbff4fc0) Thanks [@Mu-As](https://github.com/Mu-As)! - feat(leaflet): add the Leaflet map adapter

  New `@kinesisjs/leaflet` package — a `TrackAdapter` for Leaflet, on par with
  `@kinesisjs/openlayers`: per-vehicle `L.Marker` lifecycle, a built-in
  heading-aware rotatable marker (plus static/dynamic icon factories and the
  `createVehicleStyle` helper with speed-band colouring), `managedFeatureIds`,
  `updateOpacity`, `setVehicleState` + `warningOpacity` gap visualisation, and
  optional per-vehicle trail rendering. `leaflet` is a peer dependency (>=1.7).
