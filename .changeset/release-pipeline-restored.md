---
'@kinesisjs/core': patch
'@kinesisjs/openlayers': patch
'@kinesisjs/angular': patch
---

Release pipeline restored — npm Trusted Publishing now verified end-to-end.

No runtime changes. This patch only re-establishes the OIDC publish flow
after the v0.1.2 / v0.2.0 / v0.2.1 release failures, by ensuring all three
packages have valid Trusted Publisher rules on npmjs.com that match the
release workflow.
