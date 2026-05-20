---
'@kinesisjs/core': patch
---

Lower `AdaptiveInterpolator` default `minPeriodMs` from 1000 to 500.

At 1000 ms the default placed a typical 1 Hz GPS feed exactly on the boundary between the `none` and `linear` adaptive zones, and `setInterval`/`interval(1000)` jitter routinely produced sub-1000 ms periods. Each clipped tick fell into the `none` zone and teleported the marker — visible micro-skipping with the otherwise smooth `renderLagMs` buffer.

The new 500 ms default keeps 1 Hz feeds firmly inside `linear` regardless of jitter. Sub-second feeds that explicitly want the `none` behavior can opt in:

```ts
new Tracker({ adapter, interpolation: 'adaptive', adaptive: { minPeriodMs: 1000 } });
```

No API change, only the default value.
