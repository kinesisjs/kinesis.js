import { afterEach, describe, expect, it, vi } from 'vitest';
import { OSRMInterpolator } from './osrm-interpolator';
import type { OSRMRouteResponse, Polyline } from './types';
import type { TrailPoint } from '@kinesisjs/core';

const tp = (lng: number, lat: number, extra: Partial<TrailPoint> = {}): TrailPoint => ({
  lng,
  lat,
  ts: 0,
  receivedAt: 0,
  ...extra,
});

/** Build a fake `fetch` that returns the given polyline as an OSRM response. */
function mockFetchOk(poly: Polyline): { fetch: typeof fetch; calls: () => number } {
  const calls: string[] = [];
  const f = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    const body: OSRMRouteResponse = {
      code: 'Ok',
      routes: [
        {
          geometry: { type: 'LineString', coordinates: poly as Array<[number, number]> },
          distance: 0,
          duration: 0,
        },
      ],
    };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    } as unknown as Response;
  });
  return { fetch: f as unknown as typeof fetch, calls: () => calls.length };
}

function mockFetchError(status: number): typeof fetch {
  return vi.fn(
    async () =>
      ({ ok: false, status, statusText: 'fail', json: async () => ({}) }) as unknown as Response,
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OSRMInterpolator — basic flow', () => {
  it('compute returns linearLerp before the polyline is cached', () => {
    const ri = new OSRMInterpolator({
      fetch: mockFetchOk([
        [29, 41],
        [29.5, 41],
      ]).fetch,
    });
    const from = tp(29, 41);
    const to = tp(29.001, 41);
    const out = ri.compute(from, to, 0.5);
    // Linear midpoint, not the OSRM polyline midpoint.
    expect(out.lng).toBeCloseTo(29.0005, 6);
    expect(out.lat).toBeCloseTo(41, 6);
  });

  it('prepare populates the cache and compute then walks the polyline', async () => {
    // Simple east-going polyline; midpoint is (29.5, 41).
    const { fetch, calls } = mockFetchOk([
      [29, 41],
      [29.5, 41],
      [30, 41],
    ]);
    const ri = new OSRMInterpolator({ fetch });
    const from = tp(29, 41);
    const to = tp(30, 41);
    await ri.prepare(from, to);

    expect(calls()).toBe(1);
    expect(ri.cacheSize).toBe(1);
    const out = ri.compute(from, to, 0.5);
    // Walks to the middle vertex of the polyline (29.5, 41).
    expect(out.lng).toBeCloseTo(29.5, 6);
    expect(out.lat).toBeCloseTo(41, 6);
  });

  it('coalesces concurrent prepare calls for the same segment', async () => {
    const { fetch, calls } = mockFetchOk([
      [29, 41],
      [30, 41],
    ]);
    const ri = new OSRMInterpolator({ fetch });
    const from = tp(29, 41);
    const to = tp(30, 41);
    // Three parallel prepares for the same segment.
    await Promise.all([ri.prepare(from, to), ri.prepare(from, to), ri.prepare(from, to)]);
    expect(calls()).toBe(1);
  });

  it('compute on a cache miss queues a single background fetch', async () => {
    const { fetch, calls } = mockFetchOk([
      [29, 41],
      [30, 41],
    ]);
    const ri = new OSRMInterpolator({ fetch });
    const from = tp(29, 41);
    const to = tp(30, 41);
    // No prepare. compute should return fallback AND queue exactly one fetch.
    ri.compute(from, to, 0.5);
    ri.compute(from, to, 0.6);
    ri.compute(from, to, 0.7);
    // The fetch hasn't resolved yet — count comes from inFlight.
    expect(ri.inFlightCount).toBe(1);
    // Flush the queued fetch and verify it lands in cache.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(calls()).toBe(1);
    expect(ri.cacheSize).toBe(1);
  });
});

describe('OSRMInterpolator — guardrails', () => {
  it('rejects an implausibly long route (detour guard)', async () => {
    // Straight-line ~111 km between (29, 41) and (30, 41); a route that's 5×
    // that length is implausible — discard it.
    const long: Polyline = [
      [29, 41],
      [29.5, 42], // big detour northward
      [30, 41],
    ];
    // Construct a polyline whose total length is way bigger than the euclidean.
    const detoured: Polyline = [];
    detoured.push([29, 41]);
    for (let i = 0; i < 50; i++) {
      detoured.push([29 + i * 0.02, 42]); // zig high north
    }
    detoured.push([30, 41]);
    void long;

    const ri = new OSRMInterpolator({
      fetch: mockFetchOk(detoured).fetch,
      maxDetourFactor: 2.5,
    });
    await ri.prepare(tp(29, 41), tp(30, 41));
    expect(ri.cacheSize).toBe(0); // rejected
  });

  it('does not cache when OSRM returns an HTTP error', async () => {
    const ri = new OSRMInterpolator({ fetch: mockFetchError(503) });
    await expect(ri.prepare(tp(29, 41), tp(30, 41))).rejects.toThrow(/HTTP 503/);
    expect(ri.cacheSize).toBe(0);
  });

  it('does not cache when OSRM returns a non-Ok response code', async () => {
    const badResp: typeof fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async (): Promise<OSRMRouteResponse> => ({ code: 'NoRoute', routes: [] }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const ri = new OSRMInterpolator({ fetch: badResp });
    await expect(ri.prepare(tp(29, 41), tp(30, 41))).rejects.toThrow(/NoRoute/);
    expect(ri.cacheSize).toBe(0);
  });
});

describe('OSRMInterpolator — lifecycle', () => {
  it('dispose clears cache and in-flight set', async () => {
    const { fetch } = mockFetchOk([
      [29, 41],
      [30, 41],
    ]);
    const ri = new OSRMInterpolator({ fetch });
    await ri.prepare(tp(29, 41), tp(30, 41));
    expect(ri.cacheSize).toBe(1);
    ri.dispose();
    expect(ri.cacheSize).toBe(0);
    expect(ri.inFlightCount).toBe(0);
  });
});
