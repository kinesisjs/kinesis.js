# Web Worker mode

Move the interpolation tick loop off the main thread so the UI stays responsive under heavy load.

## Why

The tick loop (interpolation, sanity checks, sweeper) runs ~60 times a second across every vehicle. At a few hundred vehicles this is cheap (see [Performance](/benchmarks)); at thousands — or alongside a busy main thread (charts, heavy DOM, other apps) — it can start competing for frame budget with the map's own pan/zoom rendering.

Worker mode runs the engine in a `Worker` thread. The **map adapter stays on the main thread** (DOM/WebGL writes can't leave it), so the only main-thread work left is applying the position updates the worker streams back.

## Enabling it

```ts
import { Tracker } from '@kinesisjs/core';

// Inline worker — zero setup, spun up from a Blob bundled into the package:
const tracker = new Tracker({ adapter, worker: true });
```

`new Tracker({ worker: true })` transparently returns a `WorkerTracker` that mirrors `Tracker`'s public surface (`ingest`, `start`, `stop`, `destroy`, `on`, `markCompleted`, `removeVehicle`, `getStats`) — your calling code doesn't change.

To avoid inlining the worker payload in your main bundle, host the bundled worker script yourself and point at it:

```ts
const tracker = new Tracker({
  adapter,
  worker: { url: new URL('./kinesis.worker.js', import.meta.url) },
});
```

In Angular, the directive exposes the same option:

```html
<div kinesisMap [positions]="positions" [worker]="true"></div>
<!-- or: [worker]="{ url: workerUrl }" -->
```

## How it works

```
 main thread                          worker thread
 ───────────                          ─────────────
 ingest(positions) ──postMessage──►   Tracker (real engine)
                                       tick loop, sweeper, sanity checks
 adapter.updatePosition()  ◄──────    streams adapter calls back
 (your map writes here)               (addVehicle / updatePosition /
 events re-emitted locally  ◄──────    removeVehicle / setVehicleState)
```

The worker owns the real `Tracker`; the main thread owns the real adapter. Tracker events are re-emitted on a local bus, so `tracker.on('vehiclestale', …)` works exactly as in single-thread mode.

## Caveats

Worker mode trades a few capabilities for the off-thread win:

| Limitation                                       | Detail                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| No `CustomInterpolator`                          | Functions can't cross the worker boundary — the constructor **throws** if `interpolation` is an object. Use a built-in mode.   |
| Fade degrades to snap                            | `updateOpacity` fade animation is driven by main-thread `requestAnimationFrame`; in worker mode the `fade` zone snaps.         |
| `getStats()` lags                                | Stats are a snapshot the worker pushes every ~30 ticks, so they trail real time slightly.                                      |
| `markCompleted` / `removeVehicle` are optimistic | The slot lives in the worker, so these return `true` immediately and forward the command rather than confirming synchronously. |
| Needs the Web Worker API                         | Throws in environments without `Worker` (e.g. server-side rendering). Run without `worker: true` there.                        |

## When to use it

- **Use it** for very large fleets, or when the main thread is already busy and map interaction stutters.
- **Skip it** for typical fleet sizes — the single-thread tick is ~0.15 ms at 1000 vehicles, well inside the frame budget, and you keep `CustomInterpolator` + crisp fades.

## Next

- [Architecture](/concepts/architecture) — three-layer responsibility model
- [Interpolation](/concepts/interpolation) — how each tick is computed
- [Performance](/benchmarks) — single-thread tick budget
