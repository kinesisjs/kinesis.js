# Architecture

Kinesis.js follows a three-layer responsibility model. Each layer consumes the layer below it; no layer ever knows about the one above.

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3: Framework wrapper                              │
│  (@kinesisjs/angular, react*, vue*, svelte*)             │
│  ─ Reactive bindings (Signal, Observable, Hook)          │
│  ─ Lifecycle management (DestroyRef, useEffect)          │
│  ─ Framework-idiomatic API                               │
└──────────────────┬───────────────────────────────────────┘
                   │ uses
┌──────────────────▼───────────────────────────────────────┐
│  Layer 2: Map adapter                                    │
│  (@kinesisjs/openlayers, @kinesisjs/leaflet,             │
│   maplibre*, mapbox*, google-maps*)                      │
│  ─ Feature lifecycle (create, update, delete)            │
│  ─ Style application                                     │
│  ─ Camera and viewport integration                       │
└──────────────────┬───────────────────────────────────────┘
                   │ uses
┌──────────────────▼───────────────────────────────────────┐
│  Layer 1: Core engine                                    │
│  (@kinesisjs/core)                                       │
│  ─ Clock (rAF-based 60fps tick)                          │
│  ─ Interpolator (linear, cubic, geodesic, adaptive)      │
│  ─ Sweeper (multi-state lifecycle)                       │
│  ─ EventBus (typed)                                      │
│  ─ math-utils (haversine, shortest-arc, lerp)            │
└──────────────────────────────────────────────────────────┘
```

`*` planned. Shipped today: `@kinesisjs/core`, `@kinesisjs/openlayers`, `@kinesisjs/leaflet`, `@kinesisjs/angular`.

## Data flow

```
[Your backend]                          [Kinesis.js]
                                              │
WebSocket ────► Worker ────► RxJS / Signal    │
                                    │         │
                                    ▼         ▼
                          ┌────────────────────────────┐
                          │   tracker.ingest(positions)│
                          └────────────┬───────────────┘
                                       │
                          ┌────────────▼───────────────┐
                          │   SlotBuffer (per vehicle: │
                          │   previous + current)      │
                          └────────────┬───────────────┘
                                       │
                          ┌────────────▼───────────────┐
                          │   Clock (60fps tick)       │
                          │   on every tick:           │
                          │     interpolate(prev,curr) │
                          └────────────┬───────────────┘
                                       │
                          ┌────────────▼───────────────┐
                          │   Adapter (OL / Leaflet):  │
                          │   feature.setCoords(p)     │
                          │   marker.setLatLng(p)      │
                          └────────────────────────────┘
                                       │
                                       ▼
                              User sees vehicles
                              flowing on the map
```

## Responsibility matrix

| Component | Is responsible for                       | Is **not** responsible for               |
| --------- | ---------------------------------------- | ---------------------------------------- |
| Core      | Math, time, memory, events               | Map rendering, frameworks, data fetching |
| Adapter   | Map feature lifecycle, styling, viewport | Interpolation, data flow                 |
| Wrapper   | Framework lifecycle, reactive bindings   | Math, feature management                 |
| You       | Data source, map setup, UI               | Interpolation, feature updates           |

## Design principles

### Narrow scope, deep quality

Solve one problem extremely well. Resist feature creep. Adjacent capabilities ship as separate packages (`@kinesisjs/route-aware`, `@kinesisjs/predict`, etc.).

### Framework-agnostic core

The core has zero dependencies on any map library or UI framework. It extends through the adapter pattern.

### Bounded memory

Bounded buffers, ring slot pattern, automatic stale cleanup. No growth across multi-hour sessions.

### Zero-cost abstractions

Wrappers add no measurable overhead over the core. They are convenience layers, not performance layers.

### Production-grade defaults

Out-of-the-box settings run in production. A quick-start example works when copy-pasted.

### TypeScript-first, JavaScript-friendly

Written in TypeScript; usable from JavaScript. Dual ESM + CJS build, automatic `.d.ts` emission.

### Open to new adapters

Writing an adapter for a new map library is roughly 100 lines. The interface is small enough for the community to ship Vue, Svelte, Mapbox, and MapLibre adapters independently.

### Testable

The core is pure TypeScript and runs in Node.js. Adapters are tested standalone. Wrappers are tested with the framework's own test bed (Angular TestBed, React Testing Library, etc.).

## Next

- [Limitations](/concepts/limitations)
