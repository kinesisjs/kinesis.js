---
layout: home

hero:
  name: Kinesis.js
  text: Smooth vehicle interpolation, any map library
  tagline: TypeScript-first, framework-agnostic interpolation engine for fleet tracking, telematics, and real-time location applications.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/kinesisjs/kinesis.js

features:
  - icon: 🎯
    title: Framework-agnostic core
    details: No dependency on any map library or UI framework. Plug in through the adapter pattern.
  - icon: ⚡
    title: 1000 vehicles at 60fps
    details: ≈0.15 ms per tick, roughly 1% of the 60fps frame budget. Bounded memory via a ring slot pattern.
  - icon: 🧭
    title: Adaptive interpolation
    details: Period-aware classifier picks between linear, fade, and snap behaviour per vehicle.
  - icon: 🛡️
    title: Production-grade safety
    details: Anomalous-jump and sharp-turn sanity checks, multi-state lifecycle, error-as-event reporting.
  - icon: 🎨
    title: TypeScript-first
    details: Strict typings, dual ESM + CJS build, typed event bus, custom interpolator extensibility.
  - icon: 🌍
    title: Route-aware roadmap
    details: A self-hostable OSRM-backed map-matching package is planned for v0.4.
---

## Quick start

**Angular:**

```ts
import { Component, inject } from '@angular/core';
import { KinesisMapDirective } from '@kinesisjs/angular';

@Component({
  imports: [KinesisMapDirective],
  template: `<div kinesisMap [positions]="positions" class="map"></div>`,
})
export class LiveMapComponent {
  positions = inject(PositionsService).positions; // Signal<Position[]>
}
```

**Vanilla TypeScript (OpenLayers):**

```ts
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle } from '@kinesisjs/openlayers';

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map, {
    style: createVehicleStyle({ icon: '/car.png' }),
  }),
  interpolation: 'adaptive',
});

tracker.start();
tracker.ingest(positions); // call from your WebSocket handler
```

**Vanilla TypeScript (Leaflet):**

```ts
import { Tracker } from '@kinesisjs/core';
import { LeafletAdapter, createVehicleStyle } from '@kinesisjs/leaflet';

const tracker = new Tracker({
  adapter: new LeafletAdapter(map, {
    style: createVehicleStyle({
      speedColorBands: [
        { max: 30, color: '#22c55e' },
        { max: 80, color: '#eab308' },
        { max: 130, color: '#ef4444' },
      ],
    }),
  }),
  interpolation: 'adaptive',
});

tracker.start();
tracker.ingest(positions);
```

## Why?

In fleet tracking and real-time location applications, vehicles **jump** on the map between periodic server updates. Existing solutions are either unmaintained, locked to a single map library, or address a different problem (animation along a known polyline).

Kinesis.js fills that gap narrowly and deeply. The library is honest about [where linear interpolation succeeds and where it falls short](/concepts/limitations).

## Status

**v0.1.2** — current. Real-time interpolation (`renderLagMs`), `ng-packagr` Angular build, lowered adaptive `minPeriodMs` default, and four new directive `@Input`s. See the [migration notes](/guide/migration) if you're coming from 0.1.0.

Roadmap detail on [GitHub](https://github.com/kinesisjs/kinesis.js).
