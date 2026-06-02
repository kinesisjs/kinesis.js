import { haversineDistance } from '@kinesisjs/core';
import type { Polyline } from './types';

/**
 * Cumulative arc-length array for `poly`. Element `i` is the distance (m)
 * from the first vertex to the `i`-th vertex along the polyline.
 * `out[0] === 0`, `out[length-1]` is the total route length.
 */
export function cumulativeArcLengths(poly: Polyline): number[] {
  const out: number[] = new Array(poly.length);
  if (poly.length === 0) return out;
  out[0] = 0;
  let prev = poly[0];
  if (!prev) return out;
  let accum = 0;
  for (let i = 1; i < poly.length; i++) {
    const cur = poly[i];
    if (!cur) break;
    accum += haversineDistance({ lng: prev[0], lat: prev[1] }, { lng: cur[0], lat: cur[1] });
    out[i] = accum;
    prev = cur;
  }
  return out;
}

/**
 * Find the point on `poly` at fractional arc-length `ratio` (0..1). Returns
 * the coordinate plus the heading of the polyline segment we landed on (deg,
 * north = 0, east = 90).
 *
 * The "constant arc-length" parametrization is what makes road-snapping look
 * right: at ratio 0.5 the marker is halfway along the **route** (not halfway
 * between endpoints). On a curvy road that's the difference between "tracks
 * the street" and "cuts the corners".
 */
export function walkPolyline(
  poly: Polyline,
  cum: number[],
  ratio: number,
): { lng: number; lat: number; heading: number } {
  const first = poly[0] ?? [0, 0];
  if (poly.length < 2) {
    return { lng: first[0], lat: first[1], heading: 0 };
  }
  const total = cum[cum.length - 1] ?? 0;
  if (total === 0) {
    return { lng: first[0], lat: first[1], heading: 0 };
  }
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const target = clamped * total;

  // Binary search for the smallest i with cum[i] >= target.
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midVal = cum[mid] ?? 0;
    if (midVal < target) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const a = poly[i - 1];
  const b = poly[i];
  if (!a || !b) return { lng: first[0], lat: first[1], heading: 0 };
  const cumStart = cum[i - 1] ?? 0;
  const cumEnd = cum[i] ?? cumStart;
  const segLen = cumEnd - cumStart;
  const t = segLen === 0 ? 0 : (target - cumStart) / segLen;
  const lng = a[0] + (b[0] - a[0]) * t;
  const lat = a[1] + (b[1] - a[1]) * t;
  const heading = initialBearing(a[1], a[0], b[1], b[0]);
  return { lng, lat, heading };
}

/** Initial bearing from (lat1, lng1) to (lat2, lng2), degrees, 0..360. */
function initialBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
