# Interpolation

How Kinesis.js turns sparse position updates into smooth 60fps movement.

## The pipeline

```
ingest()  ───►  per-vehicle slot: { previous, current }
                                       │
                                       ▼
                       Clock (rAF, ~60fps) on every tick:
                       compute renderTime  =  now − renderLagMs
                       compute ratio       =  (renderTime − prev.receivedAt) / period
                       compute point       =  interpolate(prev, curr, ratio)
                                       │
                                       ▼
                          adapter.updatePosition(point)
```

Two pieces deserve attention: **render lag** (why interpolation runs in real time at all) and **interpolation mode** (how each tick is computed).

## Render lag

By default, `Tracker` delays rendering by **1 000 ms** behind `Date.now()`. This is the standard real-time-networking interpolation-buffer pattern: render N milliseconds in the past so that when a new position arrives, the renderer is still at the previous one and has a known endpoint to interpolate toward.

Without this lag, `elapsed = now − previous.receivedAt` is always greater than or equal to the period the instant `current` is ingested, and the tick degenerates to snapping. With a 1 000 ms lag at 1 Hz, the renderer is always exactly one period behind the network — interpolation runs continuously over each second.

```ts
new Tracker({
  adapter,
  renderLagMs: 1000, // default; tune to your feed period
});
```

Set `renderLagMs: 0` to restore pre-v0.1.1 behavior (instant snap on each ingest — no real-time interpolation).

> **Trade-off:** the marker is always shown ~1 second behind the freshest data. For a fleet view this is invisible; for safety-critical real-time tracking it matters. Pick a lag at most equal to one period.

## Modes

```ts
new Tracker({
  adapter,
  interpolation: 'linear', // default
});
```

| Mode                        | Behavior                                        | Best for                                |
| --------------------------- | ----------------------------------------------- | --------------------------------------- |
| `linear` (default)          | Straight-line lerp between previous and current | Most cases — recommended starting point |
| `cubic`                     | Smoothstep easing (ease-in-out)                 | Sharper visual on sub-segment curves    |
| `geodesic`                  | Great-circle arc between two points             | Ships, aircraft, long distances         |
| `none`                      | No interpolation, render snaps to current       | Sub-second feeds; debugging             |
| `adaptive`                  | Period-aware switcher (see below)               | Mixed-period feeds                      |
| `CustomInterpolator` object | Your own `compute(from, to, ratio)`             | Route-aware, predict                    |

## Adaptive zones

`adaptive` mode picks a behavior per tick based on the **period** between previous and current ingests:

| Period (ms)      | Zone     | Default range    | Behavior                                                                  |
| ---------------- | -------- | ---------------- | ------------------------------------------------------------------------- |
| `< minPeriodMs`  | `none`   | `< 500`          | Snap to current — period is short enough that interpolation is wasted CPU |
| `min ≤ p ≤ max`  | `linear` | `500 – 8 000`    | Standard linear lerp                                                      |
| `max < p ≤ fade` | `fade`   | `8 000 – 15 000` | Animated fade-out, snap, fade-in (needs `adapter.updateOpacity`)          |
| `p > snap`       | `snap`   | `> 15 000`       | Direct jump, no animation                                                 |

Tune for your feed:

```ts
new Tracker({
  adapter,
  interpolation: 'adaptive',
  adaptive: {
    minPeriodMs: 200, // for 5+ Hz feeds
    fadeThresholdMs: 30_000, // for satellite/intermittent feeds
  },
});
```

> **v0.1.2 default change:** `minPeriodMs` was 1 000 in v0.1.0/0.1.1, which put typical 1 Hz GPS feeds at the boundary — `setInterval` jitter often clipped a tick under 1 000 ms and dropped it into the `none` zone, producing visible micro-teleports. The new 500 ms default keeps typical 1 Hz feeds inside `linear` regardless of jitter.

## Custom interpolator

For domain-specific logic (route-aware snapping, dead reckoning, Kalman filters), supply a `CustomInterpolator` object directly:

```ts
import type { CustomInterpolator } from '@kinesisjs/core';

const myInterpolator: CustomInterpolator = {
  compute(from, to, ratio) {
    // ... your math ...
    return { lng, lat, ts: from.ts, receivedAt: from.receivedAt, heading };
  },
};

new Tracker({ adapter, interpolation: myInterpolator });
```

`compute` may return a `Promise<TrailPoint>`. The tracker falls back to a linear lerp for that tick and caches the async result for the next tick.

## When does each tick run? — visual

```
data arrival:   P₀────────────────P₁────────────────P₂
                t=0               t=1000            t=2000

displayed:                 P₀────────────────P₁────────────────P₂
                           t=1000            t=2000            t=3000
                           ↑ shown 1000ms after each datum
```

With `renderLagMs = 1000`, the on-screen marker is always one period behind the freshest data — and during that one period, the tick loop interpolates 60 frames between the two endpoints.

## Next

- [Architecture](/concepts/architecture) — three-layer responsibility model
- [Limitations](/concepts/limitations) — where linear interpolation breaks
