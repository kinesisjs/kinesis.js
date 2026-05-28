---
'@kinesisjs/core': minor
'@kinesisjs/angular': minor
---

Add opt-in Web Worker mode (`worker: true` or `worker: { url }`).

The tick loop — interpolation, sanity checks, and the sweeper — can now run
off the main thread inside a Web Worker, keeping the UI thread free for the
actual map/DOM writes. The adapter stays on the main thread and is driven by
messages the worker streams back, so existing adapters work unchanged.

- `worker: true` spins the worker up from an inlined Blob (zero setup; adds
  ~2.4 KB gzip to the core bundle).
- `worker: { url }` loads the bundled worker script from a URL you control,
  avoiding the inline payload.

The public API is unchanged — `new Tracker({ worker: true })` transparently
returns a worker-backed tracker with the same surface. `@kinesisjs/angular`'s
`[kinesisMap]` directive exposes it via a new `[worker]` input.

Caveats: a `CustomInterpolator` isn't supported in worker mode (functions
can't cross the worker boundary; construction throws), `updateOpacity`-based
fade animations degrade to snapping, and `getStats()` returns a snapshot
refreshed every ~30 ticks.
