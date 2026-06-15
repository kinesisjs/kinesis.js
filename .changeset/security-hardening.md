---
'@kinesisjs/leaflet': patch
'@kinesisjs/core': patch
'@kinesisjs/route-aware': patch
---

fix: harden against untrusted input

- **leaflet**: the marker `divIcon` HTML now coerces numeric options (`heading`/`speed`/`iconSize`/…) to finite numbers and escapes interpolated `icon`/`color` values, so a malformed feed or crafted style option can no longer break out of an HTML attribute (DOM-XSS hardening).
- **core**: non-finite `heading`/`speed` are dropped on ingest, so malformed feed values never reach a render adapter.
- **route-aware**: the OSRM `baseUrl` must now be an `http(s)` URL and the routing profile is `encodeURIComponent`-escaped before being placed in the request URL.
