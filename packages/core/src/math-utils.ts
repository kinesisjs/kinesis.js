import type { TrailPoint } from './types';

const EARTH_RADIUS_M = 6_371_000;

/**
 * İki nokta arası yaklaşık mesafe (Haversine formülü).
 * Tick döngüsünde sıkça çağrıldığı için minimum trigonometri kullanılır.
 *
 * @returns metre
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
 * İki heading değeri (derece) arasındaki **signed** en kısa açısal mesafe.
 * 350° ile 10° arası `+20`° döner (`-340`° değil).
 *
 * @returns -180..+180 derece (b - a yönünde)
 */
export function shortestArcDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/**
 * Allocation-az linear interpolation. Async CustomInterpolator fallback'inde ve
 * AdaptiveInterpolator 'linear' zone'unda kullanılır.
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
