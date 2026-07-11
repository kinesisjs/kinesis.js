---
'@kinesisjs/route-aware': patch
---

Harden the OSRM client: a malformed routing `profile` is now rejected before the request is issued (defense-in-depth on top of the existing `encodeURIComponent` escaping). The guard is syntactic (`[A-Za-z0-9_-]+`), so custom self-host profile names still work — only obviously-invalid values are rejected, surfacing as an `INTERPOLATION_ERROR` event instead of a doomed network call.
