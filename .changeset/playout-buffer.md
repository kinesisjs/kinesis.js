---
'@kinesisjs/core': minor
---

Add `TrackerOptions.playout` — a per-vehicle queue that decouples display
rate from arrival rate, so feeds with variable-period ingest (jitter,
replay scrubbing, retry storms) render at a steady pace instead of
speeding up and slowing down with each segment.

Opt-in and non-breaking: without `playout`, Tracker uses the existing
classical real-time path; behaviour is byte-for-byte identical to v0.4.

Two forms:

- **Manual** — `playout: { pace, bufferMs, maxQueue? }` when you know
  your feed's worst-case gap. Pick `bufferMs ≥ worstCaseGap` to avoid
  the queue underrunning (which would freeze the marker).
- **Auto** — `playout: 'auto'`. Tracker measures the last ~10 ingest
  gaps per vehicle and sets `pace = avg`, `bufferMs = max × 1.5`.
  Behaves classically while gathering its first 5 samples, then
  engages playout. Each vehicle calibrates independently, so mixed
  fleets (1 Hz dispatch + jittery IoT) coexist cleanly.

Trade-off: `bufferMs` of additional perceived latency for smooth motion.
For most fleet/dispatch use cases (where "the marker is 2 s behind"
beats "the marker stutters") this is the right exchange. Stable 1 Hz
feeds shouldn't enable it.

Composition: works on top of every `interpolation` mode. Pairing with
`'smooth'` (3-point Catmull-Rom) yields the maximum-pleasant render
path for jittery feeds — smooth shapes the geometry, playout flattens
the rhythm.

Also adds `PlayoutOptions` and `PlayoutQueueEntry` to the public type
surface.
