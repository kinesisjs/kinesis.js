# @kinesisjs/maplibre

## 0.1.1

### Patch Changes

- [#54](https://github.com/kinesisjs/kinesis.js/pull/54) [`8e0bda7`](https://github.com/kinesisjs/kinesis.js/commit/8e0bda7dc3b32a102ae003abac510be109dc5955) Thanks [@Mu-As](https://github.com/Mu-As)! - Fix the custom-sprite example in the docs.

  It used `await map.loadImage(url)`, which only returns a promise from
  maplibre-gl v4 onward — in v3 the method is callback-based, and this package's
  peer range allows `>=3.0.0`, so the example did not hold for every supported
  version. It now loads the image with `new Image()` + `decode()`, which behaves
  the same on all of them.

  Documentation only; no change to the adapter.

## 0.1.0

### Minor Changes

- [#45](https://github.com/kinesisjs/kinesis.js/pull/45) [`b1f5a78`](https://github.com/kinesisjs/kinesis.js/commit/b1f5a7877ca4ee064aac7af9afd4e7246bf4b182) Thanks [@Mu-As](https://github.com/Mu-As)! - Add `@kinesisjs/maplibre` — a MapLibre GL map adapter.

  Renders the whole fleet from a single GeoJSON source through one symbol layer,
  so colour, heading rotation and opacity are data-driven expressions the GPU
  applies rather than per-marker DOM work. Position updates mutate features in
  place and are uploaded once per tick via a `queueMicrotask`-coalesced
  `setData`, so a thousand vehicles cost one upload and zero DOM nodes.

  The default arrow is generated at runtime as an SDF sprite, so there is no
  sprite sheet to host and no image request. Supports `managedFeatureIds`,
  `updateOpacity`, `setVehicleState` + `warningOpacity`, trail rendering,
  `getMemoryEstimate`, and MapLibre's `beforeId` layer ordering. The adapter
  installs itself once the map style is ready, so it can be constructed and fed
  before `load` fires.

  Passes the same cross-adapter parity suite as `@kinesisjs/openlayers` and
  `@kinesisjs/leaflet`.
