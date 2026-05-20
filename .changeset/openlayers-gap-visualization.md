---
'@kinesisjs/openlayers': minor
---

Gap visualization: `OpenLayersAdapter` now implements the new `setVehicleState` hook.

Every state change always writes a `vehicleState` feature property (useful for external readers / popup labels). When `OpenLayersAdapterOptions.warningOpacity` is configured, the adapter additionally dims the marker on `warning` and restores opacity 1 on `active`:

```ts
new OpenLayersAdapter(map, {
  style: vehicleStyle,
  warningOpacity: 0.5, // marker fades to 50% when warning threshold passes
});
```

`stale` and `completed` are handled by `removeVehicle` and produce no opacity work here. Without `warningOpacity`, only the property is set — no visual change (backward compatible default).

Pairs naturally with the v0.2.0 `trail` rendering: the dimmed marker plus the still-rendered trail tell the user "we know the last position but haven't heard back" without removing the vehicle from the map.
