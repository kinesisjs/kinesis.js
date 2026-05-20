---
'@kinesisjs/angular': minor
---

`KinesisMapDirective` now exposes the `warningOpacity` adapter option as an
optional `@Input`, completing the v0.2.0 gap-visualization story for directive
users (previously reachable only via the `kinesisTracker` factory).

```html
<div kinesisMap [positions]="positions" [warningThreshold]="60000" [warningOpacity]="0.5"></div>
```

Marker dims to 50% when a vehicle's idle exceeds `warningThreshold`; restores to
1.0 on the next ingest or sweeper-detected recovery. Omit the input to keep the
v0.2.0 behavior (no opacity change on warning).
