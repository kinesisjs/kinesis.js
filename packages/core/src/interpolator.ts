import { linearLerp, shortestArcDiff } from './math-utils';
import type { InterpolationMode, TrailPoint } from './types';

/**
 * Built-in interpolation modlarını uygulayan matematik motoru.
 *
 * Tracker'ın `tick()` döngüsü her frame'de bu sınıfı çağırır; allocation minimum.
 */
export class Interpolator {
  constructor(private readonly mode: InterpolationMode) {}

  /**
   * `forceCubic`: Tracker'ın heading sanity check'i keskin dönüş tespit ettiğinde
   * `true` iletir; bu tek tick için cubic kullanılır (mode = 'linear' olsa bile).
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
    }
  }

  private cubic(from: TrailPoint, to: TrailPoint, ratio: number, shortestArc: boolean): TrailPoint {
    // Smoothstep easing — daha pürüzsüz başla/dur
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
