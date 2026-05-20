# Limitations

A library's reputation comes from being honest about its limits. This page documents where Kinesis.js works well, where it falls short, and what is planned to address the gaps.

## The math behind linear interpolation

For two positions `P₁` and `P₂` and a ratio `t ∈ [0, 1]`:

```
P(t) = P₁ + (P₂ − P₁) · t
```

The formula assumes constant velocity and constant heading. When that assumption holds, the rendered movement matches reality. The more the assumption is violated, the more the vehicle takes a physically impossible path.

## ✅ Where linear interpolation is enough

- **Highway driving, open terrain** — the vehicle really is going straight, and linear lerp matches reality
- **Short periods (≤ 3 s)** — the distance between two updates is small enough that any error is invisible
- **Low speeds** (pedestrians, bicycles) — wide tolerance
- **Fixed-route vehicles** (trams, light rail) — the path is already linear

## ❌ Where linear interpolation falls short

- **Urban driving with 10 s+ periods** — at a turn, the straight line cuts through buildings
- **Stops in traffic** — between two updates the vehicle was stationary, but linear lerp animates smooth movement (and skews speed metrics)
- **Sharp turns** — linear lerp travels in the wrong direction for the first half of the segment, then snaps
- **GPS noise** — jittery positions produce visible "shake" under linear interpolation
- **Long gaps (15 s+)** — the vehicle appears to fly across half the city

## Three of those addressed by adaptive mode

The [`AdaptiveInterpolator`](https://github.com/kinesisjs/kinesis.js/blob/main/packages/core/src/adaptive-interpolator.ts) handles three of the gaps:

| Gap                       | Adaptive response                                         |
| ------------------------- | --------------------------------------------------------- |
| Very short period (<500ms)| `'none'` zone → interpolation is skipped, snap to current |
| Long gap (8–15 s)         | `'fade'` zone → animated fade-out, snap, fade-in          |
| Very long gap (> 15 s)    | `'snap'` zone → jump directly to the new position         |

The default `none` threshold (`adaptive.minPeriodMs`) was 1 000 ms in v0.1.0/0.1.1 and was lowered to 500 ms in v0.1.2 — see [Interpolation → Adaptive zones](/concepts/interpolation#adaptive-zones).

**Not addressed by adaptive:** urban sharp turns, traffic stops, GPS noise. These require:

- **Sharp turn** → `Tracker.tick` heading sanity check switches to cubic for that single tick (partial mitigation; route-aware is the full fix).
- **Traffic stop** → planned for v1.0+; the predict package will recognise zero-speed updates and freeze the vehicle.
- **GPS noise** → planned for v1.0+; a Kalman filter package will smooth incoming positions.

## Urban routes: route-aware (v0.4)

In urban environments, the gap is too wide for linear interpolation to be honest. The fix is to **snap positions to roads** — the map-matching problem.

### Map-matching cost comparison

Realistic working assumption: 500 vehicles × 12 updates/minute × 60 × 24 × 30 ≈ **260M calls/month**.

| Provider            |                  Unit price | Monthly cost |
| ------------------- | --------------------------: | -----------: |
| Google Roads API    |              ~$5 / 1K calls |   **~$1.3M** |
| Mapbox Map Matching |          $0.02 / 1K (large) |  **~$5–65K** |
| **OSRM self-host**  | EC2 r5.large + regional OSM |    **~$500** |
| Valhalla self-host  |   EC2 r5.large + tile build |        ~$700 |

Real-world cache hit rates of 85–95% are common (delivery fleets repeat the same routes), so the actual API call volume tends to be 5–15% of the gross number.

### v0.4 target: `@kinesisjs/route-aware`

Plug into the core through the existing `CustomInterpolator` interface — the core itself does not change:

```ts
import { Tracker } from '@kinesisjs/core';
import { OSRMRouteAware } from '@kinesisjs/route-aware';

const interpolator = new OSRMRouteAware({
  endpoint: 'http://osrm.internal.company:5000',
  cacheSize: 10_000,
  fallback: 'linear',
});

const tracker = new Tracker({ adapter, interpolation: interpolator });
```

### Self-host advantage (data residency / compliance)

Cloud map-matching providers (Google, Mapbox) send raw vehicle positions outside your infrastructure. For projects under data-protection regimes (GDPR, HIPAA, KVKK, regulated logistics), this raises questions every audit. Self-hosted OSRM keeps the data in your own infrastructure, with your own audit logs and your own rate-limiting.

This is rarely a feature in code; it is often a feature in procurement.

## Sanity checks — partial mitigation built in

`Tracker.tick` runs two checks before each interpolation step (no opt-out):

1. **Distance check** — when `haversineDistance > 100 m` AND `distance > maxRealisticFromSpeed × 1.5`, the segment is treated as an anomalous jump and rendered via fade behaviour (which requires `adapter.updateOpacity`, falls back to a snap if unsupported).
2. **Heading check** — when `|shortestArcDiff(prev.heading, curr.heading)| > 90°` and the mode is linear or adaptive, that single tick is rendered with cubic easing instead. Linear at a sharp turn first travels in the wrong direction then snaps; cubic produces a more natural start.

The checks are production-grade safety nets, not opt-in features. Their thresholds will become configurable in v1.0+.

## Summary

| Problem                      | Solution                   | Version  |
| ---------------------------- | -------------------------- | -------- |
| Jump between two updates     | Linear interpolation       | v0.1     |
| Period too short or too long | Adaptive mode              | v0.1     |
| Anomalous GPS jump           | Sanity check + fade        | v0.1     |
| Sharp turn (partial)         | Cubic fallback             | v0.1     |
| Routes through buildings     | Route-aware + map matching | **v0.4** |
| Traffic stops                | Predict + dead reckoning   | v1.0+    |
| GPS noise                    | Kalman filter              | v1.0+    |
