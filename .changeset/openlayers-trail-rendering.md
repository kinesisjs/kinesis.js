---
'@kinesisjs/openlayers': minor
---

Per-vehicle trail rendering — fading polyline behind each marker showing recent positions.

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
