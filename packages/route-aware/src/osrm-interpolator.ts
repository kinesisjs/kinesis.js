import { haversineDistance, linearLerp } from '@kinesisjs/core';
import type { CustomInterpolator, InterpolationOptions, TrailPoint } from '@kinesisjs/core';
import { cumulativeArcLengths, walkPolyline } from './arc-length';
import { LRU } from './lru-cache';
import { fetchRoute } from './osrm-client';
import { segmentHash } from './segment-hash';
import type { OSRMInterpolatorOptions, Polyline } from './types';

interface CacheEntry {
  poly: Polyline;
  cum: number[];
}

/**
 * `CustomInterpolator` that snaps interpolation to the road network served
 * by an OSRM endpoint.
 *
 * Plug into a `Tracker` just like any other interpolation:
 *
 * ```ts
 * import { Tracker } from '@kinesisjs/core';
 * import { OSRMInterpolator } from '@kinesisjs/route-aware';
 *
 * const ri = new OSRMInterpolator({
 *   baseUrl: 'https://your-osrm.example.com',
 *   maxDetourFactor: 2.5,
 * });
 * new Tracker({ adapter, interpolation: ri });
 * ```
 *
 * Behaviour:
 * - **`prepare(from, to)`** — fire-and-forget prefetch. The Tracker calls this
 *   when a new segment is observed; we fetch once per unique segment hash,
 *   coalesce concurrent calls for the same hash, and cache the polyline.
 * - **`compute(from, to, ratio)`** — **always synchronous**. If the polyline
 *   is in cache the marker is placed at `ratio` along the route (constant
 *   arc-length speed). Otherwise we return a `linearLerp` fallback this tick
 *   and silently kick off the fetch so the next tick can snap.
 * - **Detour guard** — if the OSRM-returned route is more than
 *   `maxDetourFactor ×` the straight-line distance, the result is discarded
 *   (implausible — GPS noise snapping to the wrong road). The segment keeps
 *   using linear fallback rather than misleading the operator.
 * - **`dispose()`** — clears the cache. Called automatically by
 *   `Tracker.destroy()`.
 *
 * The tick is **never blocked**: every code path on the hot loop is sync.
 * Errors during prefetch surface to the Tracker as `'error'` events with
 * `code: 'INTERPOLATION_ERROR'` (the core wraps `prepare()` rejections).
 */
export class OSRMInterpolator implements CustomInterpolator {
  private readonly cache: LRU<string, CacheEntry>;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly baseUrl: string;
  private readonly profile: string;
  private readonly hashPrecision: number;
  private readonly maxDetourFactor: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OSRMInterpolatorOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://router.project-osrm.org';
    this.profile = options.profile ?? 'driving';
    this.cache = new LRU(options.cacheSize ?? 500);
    this.hashPrecision = options.hashPrecision ?? 4;
    this.maxDetourFactor = options.maxDetourFactor ?? 2.5;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  prepare(from: TrailPoint, to: TrailPoint): Promise<void> | void {
    const hash = this.key(from, to);
    if (this.cache.has(hash)) return;
    const existing = this.inFlight.get(hash);
    if (existing) return existing;
    const p = this.fetchAndStore(from, to, hash);
    this.inFlight.set(hash, p);
    return p;
  }

  compute(
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    opts?: InterpolationOptions,
  ): TrailPoint {
    const hash = this.key(from, to);
    const entry = this.cache.get(hash);
    if (entry) {
      const walked = walkPolyline(entry.poly, entry.cum, ratio);
      const result: TrailPoint = {
        lng: walked.lng,
        lat: walked.lat,
        ts: from.ts + (to.ts - from.ts) * ratio,
        receivedAt: from.receivedAt + (to.receivedAt - from.receivedAt) * ratio,
        heading: walked.heading,
      };
      const speed = lerpOptional(from.speed, to.speed, ratio);
      if (speed !== undefined) result.speed = speed;
      if (to.meta !== undefined) result.meta = to.meta;
      return result;
    }
    // Not cached — quietly kick off a fetch (in case `prepare` wasn't called)
    // and fall back to a straight-line lerp this tick. The next tick has the
    // polyline ready and snaps to the road.
    if (!this.inFlight.has(hash)) {
      const p = this.fetchAndStore(from, to, hash);
      this.inFlight.set(hash, p);
    }
    return linearLerp(from, to, ratio, opts?.shortestArcHeading ?? true);
  }

  dispose(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  /** Number of cached segments — useful for monitoring or tests. */
  get cacheSize(): number {
    return this.cache.size;
  }

  /** Number of fetches currently in flight. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  private key(from: TrailPoint, to: TrailPoint): string {
    return segmentHash(from, to, this.hashPrecision);
  }

  private async fetchAndStore(from: TrailPoint, to: TrailPoint, hash: string): Promise<void> {
    try {
      const poly = await fetchRoute({
        baseUrl: this.baseUrl,
        profile: this.profile,
        from: { lng: from.lng, lat: from.lat },
        to: { lng: to.lng, lat: to.lat },
        timeoutMs: this.timeoutMs,
        fetchImpl: this.fetchImpl,
      });
      const cum = cumulativeArcLengths(poly);
      const euclid = haversineDistance(
        { lng: from.lng, lat: from.lat },
        { lng: to.lng, lat: to.lat },
      );
      const routeLen = cum[cum.length - 1] ?? 0;
      // Detour guard — reject implausibly long routes (caller keeps linear fallback).
      if (euclid > 0 && routeLen / euclid > this.maxDetourFactor) return;
      this.cache.set(hash, { poly, cum });
    } finally {
      this.inFlight.delete(hash);
    }
  }
}

function lerpOptional(a: number | undefined, b: number | undefined, t: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * t;
}
