---
'@kinesisjs/angular': minor
---

Expose `[playout]` `@Input` on `KinesisMapDirective`, mirroring the
`TrackerOptions.playout` field that landed in `@kinesisjs/core@0.5.0`.

```html
<div kinesisMap [positions]="positions" [interpolation]="'smooth'" [playout]="'auto'"></div>
```

Forwarded to the underlying `Tracker` only when set, so omitting the
input keeps the classical real-time path. Use `'auto'` for unknown
feeds (Tracker self-calibrates from the gap history) or
`{ pace, bufferMs, maxQueue }` when you know your worst-case gap.
