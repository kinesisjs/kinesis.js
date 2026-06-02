/**
 * Options for {@link OSRMInterpolator}. Every field has a production-safe
 * default — `new OSRMInterpolator()` with no args works against the public
 * OSRM demo (rate-limited; switch `baseUrl` to your self-host for real use).
 */
export interface OSRMInterpolatorOptions {
  /**
   * OSRM HTTP base URL, without a trailing slash.
   *
   * The default points at the **public demo endpoint** (`router.project-osrm.org`)
   * which is rate-limited and intended for evaluation only. Self-host an OSRM
   * instance for production fleets — see PRD §22.6 for the Turkish OSM setup.
   *
   * Default: `https://router.project-osrm.org`.
   */
  baseUrl?: string;

  /** OSRM routing profile. Default: `'driving'`. */
  profile?: 'driving' | 'walking' | 'cycling' | (string & {});

  /**
   * Max number of cached `(from, to)` segments (LRU eviction). One entry
   * per unique segment hash; a fleet of N buses on M unique routes typically
   * generates ~M+ε entries, far less than N×ticks/period.
   *
   * Default: `500`.
   */
  cacheSize?: number;

  /**
   * Decimal places used when rounding coordinates to build the cache key.
   * Precision `4` is ~11 m (1° ≈ 111 km, 0.0001° ≈ 11 m); segments closer than
   * that share a cache entry. Lower the value to coalesce more aggressively.
   *
   * Default: `4`.
   */
  hashPrecision?: number;

  /**
   * Safety net: if the OSRM-returned route is more than `maxDetourFactor ×`
   * the straight-line distance, the route is treated as implausible (GPS
   * noise snapping to a wrong road) and **discarded** — the segment keeps
   * falling back to linear interpolation rather than misleading the operator.
   *
   * Default: `2.5`.
   */
  maxDetourFactor?: number;

  /**
   * HTTP timeout per route fetch (ms). On timeout the fetch is aborted and
   * the segment keeps using the linear fallback.
   *
   * Default: `5000`.
   */
  timeoutMs?: number;

  /**
   * Inject a custom `fetch` implementation — used by tests (mock) and by
   * environments that need to wrap fetch (auth headers, retries). Defaults
   * to the global `fetch`.
   */
  fetch?: typeof fetch;
}

/** OSRM `/route/v1/<profile>/<coords>` response (GeoJSON geometry). */
export interface OSRMRouteResponse {
  code: string; // 'Ok' on success, error code otherwise
  routes: ReadonlyArray<{
    geometry: {
      type: 'LineString';
      coordinates: ReadonlyArray<[number, number]>; // [lng, lat]
    };
    distance: number; // meters
    duration: number; // seconds
  }>;
}

/** `[lng, lat]` tuples — the geometry the OSRM `geojson` overview returns. */
export type Polyline = ReadonlyArray<readonly [number, number]>;
