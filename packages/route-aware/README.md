# @kinesisjs/route-aware

> Road-snapping interpolation for Kinesis.js — markers follow the actual street network instead of cutting straight lines.

[![npm](https://img.shields.io/npm/v/@kinesisjs/route-aware.svg)](https://www.npmjs.com/package/@kinesisjs/route-aware)
[![Downloads](https://img.shields.io/npm/dm/@kinesisjs/route-aware.svg)](https://www.npmjs.com/package/@kinesisjs/route-aware)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@kinesisjs/route-aware?label=min%2Bgzip)](https://bundlephobia.com/package/@kinesisjs/route-aware)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A `CustomInterpolator` for `@kinesisjs/core` that asks an OSRM server "what's the real road between these two points?", caches the answer, and interpolates along that polyline instead of a straight line. The tick is **never blocked**: lookups happen in the background; the live loop falls back to linear lerp until the cache is warm.

## Why

Linear interpolation between two GPS pings cuts across buildings, parks, and water. For a fleet dashboard that looks unprofessional and breaks operator trust. With route-aware enabled:

- **Markers follow real streets** — the bus slides along Divanyolu Caddesi, not through Topkapı Sarayı.
- **ETAs improve** — distance is road-based, not as-the-crow-flies.
- **Self-host friendly** — point at your own OSRM ([self-host guide](https://github.com/Project-OSRM/osrm-backend#using-docker)), no per-request cost, no third-party data sharing.

## Install

```bash
pnpm add @kinesisjs/core @kinesisjs/route-aware
```

No peer dependencies — `route-aware` only needs `@kinesisjs/core` and uses the global `fetch`. Works in browsers and Node ≥ 18.

## Usage

```ts
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter } from '@kinesisjs/openlayers';
import { OSRMInterpolator } from '@kinesisjs/route-aware';

const ri = new OSRMInterpolator({
  baseUrl: 'https://your-osrm.example.com', // your self-host
  profile: 'driving',
  cacheSize: 500,
  maxDetourFactor: 2.5,
});

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map),
  interpolation: ri, // 👈 drop-in replacement for 'linear' | 'adaptive' | ...
});

tracker.start();
tracker.ingest(positions); // your existing feed; no other changes
```

That's the whole integration — the Tracker calls `prepare()` on every new segment (cache warm-up) and `compute()` every tick.

## How it works

1. **`prepare(from, to)`** — fired by the Tracker as soon as a new segment is observed. We compute a stable cache key (rounded coords ≈ 11 m grid), hit OSRM `/route/v1/<profile>/<coords>?overview=full&geometries=geojson`, store the returned polyline + cumulative arc-lengths. Concurrent calls for the same key **coalesce to one fetch**.
2. **`compute(from, to, ratio)`** — always **synchronous**. If the polyline is in cache, walk it at fractional arc-length `ratio` (so 0.5 means "halfway along the route", not "halfway between endpoints"). Heading is the bearing of the polyline segment we land on.
3. **Cache miss** — return a `linearLerp` for this tick and quietly kick off the fetch. The next tick has the polyline ready and snaps to the road.
4. **Detour guard** — if the OSRM-returned route is more than `maxDetourFactor ×` the straight-line distance (default 2.5×), the route is discarded as implausible and the segment keeps falling back to linear.

## Options

| Option            | Default                           | Notes                                                                                |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| `baseUrl`         | `https://router.project-osrm.org` | Public **demo** endpoint — rate-limited; swap for your self-host in production.      |
| `profile`         | `'driving'`                       | `'driving'`, `'walking'`, `'cycling'`, or any custom profile your OSRM serves.       |
| `cacheSize`       | `500`                             | LRU cap on cached segments.                                                          |
| `hashPrecision`   | `4`                               | Decimal places for coord rounding (≈ 11 m grid). Lower → more aggressive coalescing. |
| `maxDetourFactor` | `2.5`                             | Reject routes longer than `factor ×` straight-line distance (GPS-noise safety net).  |
| `timeoutMs`       | `5000`                            | Per-fetch HTTP timeout. On timeout the segment keeps using linear fallback.          |
| `fetch`           | global `fetch`                    | Inject for tests (mock) or custom transport (auth headers, retries).                 |

## Cost / privacy

| Backend             | Cost                                   | Data flow                               |
| ------------------- | -------------------------------------- | --------------------------------------- |
| Self-hosted OSRM    | €0 / month after VPS + OSM data import | Coordinates stay on your infrastructure |
| Public OSRM demo    | Free (rate-limited, eval only)         | Coordinates leave to project-osrm.org   |
| Mapbox Map Matching | ~$0.50 / 1k requests                   | Coordinates leave to Mapbox             |

With ~90 % LRU hit rate (typical for a fleet on regular routes), a 500-vehicle fleet at 5-second ingest period generates ~600 actual OSRM calls per hour — well within self-host capacity and ~$0.30/hr on Mapbox.

## Public API

```ts
export { OSRMInterpolator };
export { LRU, segmentHash, cumulativeArcLengths, walkPolyline }; // building blocks
export type { OSRMInterpolatorOptions, OSRMRouteResponse, Polyline };
```

## License

[MIT](./LICENSE)
