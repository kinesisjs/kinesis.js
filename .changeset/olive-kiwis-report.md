---
'@kinesisjs/core': patch
'@kinesisjs/openlayers': patch
'@kinesisjs/leaflet': patch
'@kinesisjs/maplibre': patch
'@kinesisjs/route-aware': patch
'@kinesisjs/angular': patch
---

Fix the `VERSION` export, which reported the wrong version in every package.

It was hand-written as `'0.1.0'` and never synced to `package.json`, so every
release since has shipped a constant that lies — `@kinesisjs/core@0.5.1`
reported `'0.1.0'`, and so did `@kinesisjs/leaflet@0.1.3`. The published type
was wrong too: `declare const VERSION: "0.1.0"`. Three packages even asserted
the stale value in their tests, pinning the bug in place.

`VERSION` is now generated from `package.json` into `src/version.ts` by
`scripts/sync-package-versions.mjs`, which `changeset:version` runs right after
the bump, so the release PR carries the synced constants. Each package's export
test now compares `VERSION` against its own `package.json`, so the two cannot
drift apart again without failing CI.
