---
'@kinesisjs/angular': minor
---

`KinesisMapDirective` now exposes the new `trail` adapter option as an optional `@Input`.

```html
<div
  kinesisMap
  [positions]="positions"
  [trail]="{ enabled: true, maxPoints: 60, intervalMs: 100, color: '#3b82f6' }"
></div>
```

Omit the input and the directive behaves identically to v0.1.2 (no trail layer created). See `@kinesisjs/openlayers` `TrailRenderOptions` for the full option surface.
