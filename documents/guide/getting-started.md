# Getting started

Kinesis.js renders smooth, 60fps movement on the map between periodic position updates. This guide takes you from zero to a working setup in five minutes.

## In 30 seconds

- **The problem:** Between two WebSocket or HTTP polling updates, vehicles jump on the map.
- **The solution:** Interpolate mathematically between the two points and stream the result at 60fps.
- **What Kinesis.js adds on top:** period-aware adaptive interpolation, multi-state lifecycle, sanity checks, custom interpolator extensibility, and a framework-agnostic core.

## Three packages, three layers

| Package                 | Responsibility                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| `@kinesisjs/core`       | Math, time, memory, events. Knows nothing about maps or frameworks.             |
| `@kinesisjs/openlayers` | OpenLayers feature lifecycle and styling. Implements the core's `TrackAdapter`. |
| `@kinesisjs/angular`    | Angular Signals and RxJS bindings. Either a one-line directive or a factory.    |

Which packages you install depends on your stack:

- **Angular + OpenLayers** → install all three packages and start with the [Angular guide](/guide/first-map-angular).
- **OpenLayers only** (Vue, Svelte, React, or vanilla) → `core` + `openlayers`. See the [vanilla TypeScript guide](/guide/first-map-vanilla).
- **A different map library** (Leaflet, MapLibre, Mapbox) → install only `core` and write a small adapter that implements `TrackAdapter`. A Leaflet adapter package is planned for v0.3.

## Next steps

- **New to the library:** [First map (Angular)](/guide/first-map-angular) or [First map (vanilla TypeScript)](/guide/first-map-vanilla)
- **Want to understand the design:** [Architecture](/concepts/architecture)
- **Curious where linear interpolation breaks:** [Limitations](/concepts/limitations)
