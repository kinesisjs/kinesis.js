---
'@kinesisjs/angular': minor
---

feat(angular): support Leaflet via `[adapter]="'leaflet'"`

`KinesisMapDirective` and `kinesisTracker(...)` are now adapter-agnostic — pass
`adapter: 'leaflet'` (default still `'openlayers'`) and the directive wires up
an `L.Map` with `@kinesisjs/leaflet`'s `LeafletAdapter` instead. `vehicleStyle`
and `trail` accept either adapter's option shape; `getMap()` returns
`OLMap | L.Map`.

`ol` and `leaflet` are now both **optional** peer dependencies — install only
the one(s) you use. Existing OpenLayers code paths are unchanged (default
adapter, identical option surface).
