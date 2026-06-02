/**
 * Stable cache key for a `(from, to)` segment.
 *
 * Coordinates are rounded to `precision` decimal places before being
 * stringified — so two near-identical segments (within ~11 m at precision 4)
 * share a single cache entry. This is what gives the route-aware cache its
 * high hit rate: a 500-bus fleet typically rides ~tens of unique segments,
 * not thousands.
 */
export function segmentHash(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  precision = 4,
): string {
  const r = (n: number): string => n.toFixed(precision);
  return `${r(from.lng)},${r(from.lat)}|${r(to.lng)},${r(to.lat)}`;
}
