# @kinesisjs/leaflet

## 0.1.0

### Minor Changes

- [`01444b9`](https://github.com/kinesisjs/kinesis.js/commit/01444b90d543c641652ac74c1d27d408bbff4fc0) Thanks [@Mu-As](https://github.com/Mu-As)! - feat(leaflet): add the Leaflet map adapter

  New `@kinesisjs/leaflet` package — a `TrackAdapter` for Leaflet, on par with
  `@kinesisjs/openlayers`: per-vehicle `L.Marker` lifecycle, a built-in
  heading-aware rotatable marker (plus static/dynamic icon factories and the
  `createVehicleStyle` helper with speed-band colouring), `managedFeatureIds`,
  `updateOpacity`, `setVehicleState` + `warningOpacity` gap visualisation, and
  optional per-vehicle trail rendering. `leaflet` is a peer dependency (>=1.7).
