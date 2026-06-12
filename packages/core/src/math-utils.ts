import type { TrailPoint } from './types';

const EARTH_RADIUS_M = 6_371_000;

/**
 * Approximate distance between two points (Haversine formula).
 * Called frequently inside the tick loop — kept to the minimum trig needed.
 *
 * @returns meters
 */
export function haversineDistance(
  a: Pick<TrailPoint, 'lat' | 'lng'>,
  b: Pick<TrailPoint, 'lat' | 'lng'>,
): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * **Signed** shortest angular distance between two heading values (degrees).
 * For example, 350° → 10° returns `+20°` (not `-340°`).
 *
 * @returns -180..+180 degrees, signed in the direction `b - a`.
 */
export function shortestArcDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/**
 * Low-allocation linear interpolation. Used as the async CustomInterpolator
 * fallback and as the body of the AdaptiveInterpolator's `linear` zone.
 */
export function linearLerp(
  from: TrailPoint,
  to: TrailPoint,
  ratio: number,
  shortestArcHeading = true,
): TrailPoint {
  const heading = interpolateHeading(from.heading, to.heading, ratio, shortestArcHeading);
  const speed = interpolateOptional(from.speed, to.speed, ratio);

  const result: TrailPoint = {
    lng: from.lng + (to.lng - from.lng) * ratio,
    lat: from.lat + (to.lat - from.lat) * ratio,
    ts: from.ts + (to.ts - from.ts) * ratio,
    receivedAt: from.receivedAt + (to.receivedAt - from.receivedAt) * ratio,
  };
  if (heading !== undefined) result.heading = heading;
  if (speed !== undefined) result.speed = speed;
  if (to.meta !== undefined) result.meta = to.meta;
  return result;
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

function interpolateOptional(
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * t;
}

/**
 * Uniform Catmull-Rom cubic spline over four control points, evaluated on
 * the `p1 → p2` segment. The outer points `p0` (before) and `p3` (after)
 * shape the tangent at the segment endpoints so that consecutive segments
 * join with C¹ continuity — i.e. no visible kink at p1 or p2.
 *
 * This is the math behind the `interpolation: 'smooth'` mode: with three
 * real positions in hand (previous2, previous, current), the caller
 * synthesises a phantom `p3 = 2·p2 − p1` so the trailing tangent mirrors
 * the leading one, and the marker glides through `previous` instead of
 * making a sharp turn.
 *
 * Uniform parameterisation is the cheapest variant; centripetal /
 * chordal versions would re-weight `t` by distance to avoid loops on
 * pathological spacing. Map-feed spacing is well-behaved enough in
 * practice that we don't pay that cost.
 *
 * Heading and speed are linearly interpolated along the segment — the
 * spline shapes geometry only.
 */
export function catmullRomLerp(
  p0: TrailPoint,
  p1: TrailPoint,
  p2: TrailPoint,
  p3: TrailPoint,
  ratio: number,
  shortestArcHeading = true,
): TrailPoint {
  const t = ratio;
  const t2 = t * t;
  const t3 = t2 * t;

  const evalAxis = (a0: number, a1: number, a2: number, a3: number): number =>
    0.5 *
    (2 * a1 +
      (-a0 + a2) * t +
      (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 +
      (-a0 + 3 * a1 - 3 * a2 + a3) * t3);

  const heading = interpolateHeading(p1.heading, p2.heading, ratio, shortestArcHeading);
  const speed = interpolateOptional(p1.speed, p2.speed, ratio);

  const result: TrailPoint = {
    lng: evalAxis(p0.lng, p1.lng, p2.lng, p3.lng),
    lat: evalAxis(p0.lat, p1.lat, p2.lat, p3.lat),
    ts: p1.ts + (p2.ts - p1.ts) * ratio,
    receivedAt: p1.receivedAt + (p2.receivedAt - p1.receivedAt) * ratio,
  };
  if (heading !== undefined) result.heading = heading;
  if (speed !== undefined) result.speed = speed;
  if (p2.meta !== undefined) result.meta = p2.meta;
  return result;
}
