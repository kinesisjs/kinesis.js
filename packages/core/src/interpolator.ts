import { linearLerp, shortestArcDiff } from './math-utils';
import type { InterpolationMode, TrailPoint } from './types';

/**
 * Math engine that implements the built-in interpolation modes.
 *
 * Called by `Tracker.tick()` every frame — allocation is kept minimal.
 */
export class Interpolator {
  constructor(private readonly mode: InterpolationMode) {}

  /**
   * `forceCubic`: passed as `true` by the Tracker when its heading sanity
   * check detects a sharp turn. That single tick uses cubic easing even if
   * the mode is otherwise `'linear'`.
   */
  compute(
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    shortestArcHeading = true,
    forceCubic = false,
  ): TrailPoint {
    if (forceCubic && this.mode === 'linear') {
      return this.cubic(from, to, ratio, shortestArcHeading);
    }
    switch (this.mode) {
      case 'linear':
        return linearLerp(from, to, ratio, shortestArcHeading);
      case 'cubic':
        return this.cubic(from, to, ratio, shortestArcHeading);
      case 'geodesic':
        return this.geodesic(from, to, ratio, shortestArcHeading);
      case 'none':
        return to;
      case 'smooth':
        // 'smooth' is 3-point Catmull-Rom and needs the slot's
        // `previous2` field; the Tracker invokes catmullRomLerp directly
        // when that history exists. This branch is the documented
        // fallback for the first two ingests of a vehicle (or any case
        // where the caller routes a 2-point query through here): degrade
        // to linear so motion stays smooth even before the spline can
        // engage.
        return linearLerp(from, to, ratio, shortestArcHeading);
    }
  }

  private cubic(from: TrailPoint, to: TrailPoint, ratio: number, shortestArc: boolean): TrailPoint {
    // Smoothstep easing — gentler start/stop.
    const t = ratio * ratio * (3 - 2 * ratio);
    return linearLerp(from, to, t, shortestArc);
  }

  private geodesic(
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    shortestArc: boolean,
  ): TrailPoint {
    const φ1 = (from.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const λ1 = (from.lng * Math.PI) / 180;
    const λ2 = (to.lng * Math.PI) / 180;

    const Δσ = Math.acos(
      Math.min(1, Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)),
    );

    if (Δσ === 0) return to;

    const a = Math.sin((1 - ratio) * Δσ) / Math.sin(Δσ);
    const b = Math.sin(ratio * Δσ) / Math.sin(Δσ);

    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);

    const headingResult = interpolateHeading(from.heading, to.heading, ratio, shortestArc);
    const speedResult =
      from.speed !== undefined && to.speed !== undefined
        ? from.speed + (to.speed - from.speed) * ratio
        : (to.speed ?? from.speed);

    const result: TrailPoint = {
      lng: (Math.atan2(y, x) * 180) / Math.PI,
      lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
      ts: from.ts + (to.ts - from.ts) * ratio,
      receivedAt: from.receivedAt + (to.receivedAt - from.receivedAt) * ratio,
    };
    if (headingResult !== undefined) result.heading = headingResult;
    if (speedResult !== undefined) result.speed = speedResult;
    if (to.meta !== undefined) result.meta = to.meta;
    return result;
  }
}

function interpolateHeading(
  a: number | undefined,
  b: number | undefined,
  t: number,
  shortestArc: boolean,
): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (!shortestArc) return a + (b - a) * t;
  const diff = shortestArcDiff(a, b);
  return (a + diff * t + 360) % 360;
}
