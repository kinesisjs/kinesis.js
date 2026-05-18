# Performance

> **TL;DR:** 1000 vehicles per tick is ≈0.15 ms — about 1% of the 60fps frame budget.

Numbers below were collected on **Node 22, Windows 11, Intel**. Absolute values vary with hardware; the **ratios** are portable.

Reproduce locally:

```bash
pnpm install
pnpm test:bench
```

The first run takes 30–40 seconds.

## Headline numbers

| Metric                                                         | 1000 vehicles |
| -------------------------------------------------------------- | ------------- |
| `Tracker.tick` linear, with sanity checks and adapter dispatch | ~0.15 ms      |
| `Tracker.tick` share of the 60fps frame budget                 | **~1%**       |
| `Tracker.ingest` first append                                  | ~0.08 ms      |
| `Tracker.ingest` slot shift (allocation-free)                  | ~0.15 ms      |
| `Interpolator.compute` linear (single point)                   | ~50 ns        |

The 60fps tick budget is 16.67 ms. Processing 1000 vehicles in a single tick typically uses **under 1%** of that, so 10× more vehicles (≈10K) is still theoretically smooth. In practice the bottleneck shifts to the adapter and renderer well before the core engine.

## `Tracker.tick` — interpolation + sanity checks + adapter dispatch

|        Vehicles | Ops/sec | Mean (ms) | p95 (ms) | p99 (ms) |
| --------------: | ------: | --------: | -------: | -------: |
|    100 (linear) |    ~74K |    0.0136 |  ~0.0156 |   0.0253 |
|    500 (linear) |    ~14K |    0.0713 |  ~0.1280 |   0.2166 |
|   1000 (linear) |   ~6.6K |    0.1516 |  ~0.2700 |   0.4509 |
|    1000 (cubic) |   ~6.5K |    0.1532 |  ~0.2700 |   0.4599 |
| 1000 (adaptive) |   ~6.1K |    0.1647 |  ~0.3000 |   0.5353 |

Adaptive is roughly 8% slower because every vehicle's period is classified before the appropriate branch is taken. The linear / cubic difference is invisible in practice — smoothstep is two multiplications more.

## `Tracker.ingest`

First position (per vehicle: create slot, call `adapter.addVehicle`):

| Vehicles | Ops/sec | Mean (ms) |
| -------: | ------: | --------: |
|      100 |   ~131K |    0.0076 |
|      500 |    ~27K |    0.0368 |
|     1000 |    ~13K |    0.0782 |

Second position (ring slot shift, no `addVehicle`, allocation-free):

| Vehicles | Ops/sec | Mean (ms) |
| -------: | ------: | --------: |
|      100 |    ~82K |    0.0122 |
|      500 |    ~15K |    0.0654 |
|     1000 |   ~6.9K |    0.1449 |

First-position ingest looks faster than second-position because the second variant additionally runs the sanity-check path and the `CustomInterpolator.prepare` hook. The allocation profile guarantees the second ingest **does not allocate** — that is one of the core's foundational guarantees.

## Interpolator standalone (single-point compute)

| Mode                            | Ops/sec |    Mean |
| ------------------------------- | ------: | ------: |
| `linear`                        |   20.6M |  ~48 ns |
| `cubic` (smoothstep)            |   15.2M |  ~66 ns |
| `geodesic` (great-circle)       |    7.8M | ~129 ns |
| `adaptive` (linear zone)        |   14.0M |  ~71 ns |
| `linear` with `forceCubic=true` |   14.4M |  ~69 ns |

Linear is 2.65× faster than geodesic. For urban routes, linear is the right default; for ships, planes, and other long-distance assets, the geodesic cost is acceptable.

## math-utils

All over 20M ops/sec — effectively free. These helpers are also used by `@kinesisjs/route-aware` (v0.4) and the planned `@kinesisjs/predict` (v1.0+).

| Helper              | Ops/sec |
| ------------------- | ------: |
| `haversineDistance` |   20.9M |
| `shortestArcDiff`   |   20.7M |
| `linearLerp`        |   20.5M |

## Methodology

- Vehicle counts: 100 / 500 / 1000
- 1 s warm-up, then samples collected for roughly 1 second per benchmark
- All benchmarks use a `NoopAdapter` (zero-cost mock) — the goal is to measure the **core engine**, not the renderer
- `ingestThrottle: 0` so throttling does not bias the numbers

Run `pnpm test:bench --reporter=verbose` for per-iteration output suitable for regression diffing.
