---
'@kinesisjs/openlayers': patch
---

Trail layer was invisible by default in v0.2.0 — the layer's `zIndex: -1` default
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
