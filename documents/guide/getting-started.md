# Getting started

Kinesis.js renders smooth movement on the map at the display's refresh rate, between periodic position updates. This guide takes you from zero to a working setup in five minutes.

## In 30 seconds

- **The problem:** Between two WebSocket or HTTP polling updates, vehicles jump on the map.
- **The solution:** Interpolate mathematically between the two points and render the result at the display's refresh rate.
- **What Kinesis.js adds on top:** period-aware adaptive interpolation, multi-state lifecycle, sanity checks, custom interpolator extensibility, and a framework-agnostic core.

## Packages and layers

| Package                  | Layer   | Responsibility                                                                  |
| ------------------------ | ------- | ------------------------------------------------------------------------------- |
| `@kinesisjs/core`        | Engine  | Math, time, memory, events. Knows nothing about maps or frameworks.             |
| `@kinesisjs/openlayers`  | Adapter | OpenLayers feature lifecycle and styling. Implements the core's `TrackAdapter`. |
| `@kinesisjs/leaflet`     | Adapter | The same contract on Leaflet.                                                   |
| `@kinesisjs/maplibre`    | Adapter | The same contract on MapLibre GL — GPU-rendered, one draw call for the fleet.   |
| `@kinesisjs/angular`     | Wrapper | Angular Signals and RxJS bindings. Either a one-line directive or a factory.    |
| `@kinesisjs/route-aware` | Add-on  | Snaps movement to roads through OSRM, via the custom interpolator interface.    |

Which packages you install depends on your stack:

- **Angular + OpenLayers** → `core` + `openlayers` + `angular`. Start with the [Angular guide](/guide/first-map-angular).
- **OpenLayers, no framework wrapper** (Vue, Svelte, React, or vanilla) → `core` + `openlayers`. See the [vanilla TypeScript guide](/guide/first-map-vanilla).
- **Leaflet** → `core` + `leaflet`. See the [Leaflet guide](/guide/first-map-leaflet).
- **MapLibre GL** (or any vector basemap) → `core` + `maplibre`. See the [MapLibre guide](/guide/first-map-maplibre).
- **Another map library** (Mapbox GL, Google Maps) → install only `core` and write a small adapter implementing `TrackAdapter`. Adapter packages for these are on the roadmap.

## Next steps

- **New to the library:** [First map (Angular)](/guide/first-map-angular), [First map (vanilla TypeScript)](/guide/first-map-vanilla), [First map (Leaflet)](/guide/first-map-leaflet), or [First map (MapLibre)](/guide/first-map-maplibre)
- **Want to understand the design:** [Architecture](/concepts/architecture)
- **Curious where linear interpolation breaks:** [Limitations](/concepts/limitations)
