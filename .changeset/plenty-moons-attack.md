---
'@kinesisjs/maplibre': minor
---

Add `@kinesisjs/maplibre` — a MapLibre GL map adapter.

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
