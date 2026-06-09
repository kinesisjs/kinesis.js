---
'@kinesisjs/core': minor
---

Add `interpolation: 'smooth'` — a 3-point centripetal Catmull-Rom mode for
jitter and variable-period feeds.

The Tracker now keeps a third historical point per vehicle (`previous2`)
and routes smooth-mode ticks through a cubic spline over `previous2 →
previous → current`, with a mirror phantom for the trailing tangent. The
marker glides through each waypoint instead of kinking, which is
especially visible on irregular feeds (random arrival times, dead
reckoning, replay scrubbing).

Opt-in and conservative:

- Default stays `'linear'`. Existing apps see no behavioural change.
- Until the third ingest lands the spline falls back to linear — no
  spurious motion from incomplete history.
- If the `previous2 → previous` gap exceeds `maxInterpolationGap`, that
  control point is dropped (stale data shouldn't warp the curve).
- All sanity checks (anomalous jump, sharp turn, render-lag warm-up) and
  the existing custom-interpolator path are untouched.

Also exposes `catmullRomLerp` as a public math helper, alongside
`linearLerp` / `haversineDistance` / `shortestArcDiff`, for authors of
custom interpolators who want the same smoothing primitive.
