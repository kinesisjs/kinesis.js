# @kinesisjs/core

## 0.1.0

Initial public release.

- `Tracker` orchestrator with validation, throttling, and configurable initial-position behaviour (`show-immediately` / `wait-for-second` / `fade-in`)
- `Interpolator` modes: `linear`, `cubic`, `geodesic`, `none`
- `AdaptiveInterpolator` — period-aware four-zone classifier
- `Sweeper` — multi-state vehicle lifecycle (`active` / `warning` / `stale` / `completed`)
- `CustomInterpolator` interface with sync/async support
- Tick-loop sanity checks: anomalous-jump (haversine + speed) and sharp-turn (heading)
- Event-based error handling — public methods never throw
- Performance telemetry — tick history percentiles, dropped ticks, ingest rate, memory breakdown
- Public utilities: `haversineDistance`, `shortestArcDiff`, `linearLerp`
- Benchmarked: 1000 vehicles ≈ 0.15 ms per tick
