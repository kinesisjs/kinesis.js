---
'@kinesisjs/angular': patch
---

`KinesisMapDirective` now exposes four advanced `TrackerOptions` as optional `@Input`s. Previously these were only reachable via the lower-level `kinesisTracker(...)` factory.

- `[renderLagMs]` — real-time interpolation buffer size (default `1000`)
- `[adaptive]` — adaptive zone thresholds object
- `[fadeAnimation]` — duration / easing for the adaptive `fade` zone
- `[initialPositionBehavior]` — `'show-immediately' | 'wait-for-second' | 'fade-in'`

Example:

```html
<div
  kinesisMap
  [positions]="positions"
  [interpolation]="'adaptive'"
  [renderLagMs]="800"
  [adaptive]="{ minPeriodMs: 200, fadeThresholdMs: 30000 }"
  [fadeAnimation]="{ duration: 400, easing: 'linear' }"
  [initialPositionBehavior]="'fade-in'"
></div>
```

All four inputs are optional — omitting them keeps the tracker defaults.
