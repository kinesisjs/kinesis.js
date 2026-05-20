---
'@kinesisjs/core': minor
---

`TrackAdapter` gains an optional `setVehicleState(id, state)` hook. Tracker calls it whenever a vehicle transitions between lifecycle states (`active ↔ warning`), so adapters can render gap-visualization treatment — fading, badging, dashed trails — without having to subscribe to the event bus externally.

The hook fires:

- On warning (sweeper detects idle > warningThreshold)
- On recovery to active (fresh ingest, or sweeper after slot revives)

It does NOT fire for `stale` or `completed` — those are followed immediately by `removeVehicle(id)`, and rendering a transient terminal state isn't useful.

Backward compatible: the method is optional in the interface, and adapters that don't implement it (or instances on the existing v0.1.x API) keep working unchanged.
