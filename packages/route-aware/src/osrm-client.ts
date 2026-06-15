import type { OSRMRouteResponse, Polyline } from './types';

export interface FetchRouteArgs {
  baseUrl: string;
  profile: string;
  from: { lng: number; lat: number };
  to: { lng: number; lat: number };
  timeoutMs: number;
  fetchImpl: typeof fetch;
}

/**
 * Issue one OSRM `/route/v1/<profile>/<lng,lat>;<lng,lat>?overview=full&geometries=geojson`
 * call and return the result as a `[lng, lat]` polyline. Throws on HTTP
 * error, OSRM non-`Ok` response, or timeout (the caller's `prepare()` path
 * is responsible for swallowing these — the live tick keeps using linear
 * fallback so a flaky OSRM never blocks the UI).
 */
export async function fetchRoute({
  baseUrl,
  profile,
  from,
  to,
  timeoutMs,
  fetchImpl,
}: FetchRouteArgs): Promise<Polyline> {
  // `baseUrl`/`profile` are trusted config, but validate defensively so a
  // misconfigured (or attacker-influenced) value can't redirect the request
  // to an arbitrary scheme or inject extra path/query segments.
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error(`OSRM baseUrl must be an http(s) URL, got: ${baseUrl}`);
  }
  const url =
    `${baseUrl.replace(/\/$/, '')}/route/v1/${encodeURIComponent(profile)}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`OSRM HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as OSRMRouteResponse;
  const route = json.routes[0];
  if (json.code !== 'Ok' || !route) {
    throw new Error(`OSRM response code: ${json.code}`);
  }
  return route.geometry.coordinates;
}
