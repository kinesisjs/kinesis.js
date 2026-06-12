import { describe, expect, it } from 'vitest';
import { catmullRomLerp, haversineDistance, linearLerp, shortestArcDiff } from './math-utils';
import type { TrailPoint } from './types';

const point = (lng: number, lat: number, extra: Partial<TrailPoint> = {}): TrailPoint => ({
  lng,
  lat,
  ts: 0,
  receivedAt: 0,
  ...extra,
});

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(point(29.0, 41.0), point(29.0, 41.0))).toBe(0);
  });

  it('approximates 1° latitude as ~111 km at equator', () => {
    const d = haversineDistance(point(0, 0), point(0, 1));
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(112_000);
  });

  it('approximates Istanbul to Ankara as ~350 km', () => {
    const ist = point(28.97, 41.01);
    const ank = point(32.86, 39.93);
    const d = haversineDistance(ist, ank);
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(360_000);
  });
});

describe('shortestArcDiff', () => {
  it('returns +20 for 350° → 10°', () => {
    expect(shortestArcDiff(350, 10)).toBe(20);
  });

  it('returns -20 for 10° → 350°', () => {
    expect(shortestArcDiff(10, 350)).toBe(-20);
  });

  it('returns 0 for identical headings', () => {
    expect(shortestArcDiff(180, 180)).toBe(0);
  });

  it('handles 180° crossover as -180', () => {
    expect(shortestArcDiff(0, 180)).toBe(-180);
  });
});

describe('linearLerp', () => {
  const from = point(0, 0, { ts: 0, receivedAt: 0, speed: 0, heading: 0 });
  const to = point(10, 10, { ts: 1000, receivedAt: 1000, speed: 100, heading: 90 });

  it('returns from at ratio=0', () => {
    const r = linearLerp(from, to, 0);
    expect(r.lng).toBe(0);
    expect(r.lat).toBe(0);
    expect(r.speed).toBe(0);
  });

  it('returns midpoint at ratio=0.5', () => {
    const r = linearLerp(from, to, 0.5);
    expect(r.lng).toBe(5);
    expect(r.lat).toBe(5);
    expect(r.ts).toBe(500);
    expect(r.heading).toBe(45);
    expect(r.speed).toBe(50);
  });

  it('returns to at ratio=1', () => {
    const r = linearLerp(from, to, 1);
    expect(r.lng).toBe(10);
    expect(r.heading).toBe(90);
  });

  it('uses shortest arc for heading 350° → 10° at 0.5', () => {
    const a = point(0, 0, { heading: 350 });
    const b = point(0, 0, { ts: 1000, receivedAt: 1000, heading: 10 });
    const r = linearLerp(a, b, 0.5, true);
    expect(r.heading).toBe(0); // 350 + 10 * 0.5 = 355, then mod → 360 → 0
  });

  it('takes long path when shortestArc=false', () => {
    const a = point(0, 0, { heading: 350 });
    const b = point(0, 0, { ts: 1000, receivedAt: 1000, heading: 10 });
    const r = linearLerp(a, b, 0.5, false);
    expect(r.heading).toBe(180); // (350 + 10) / 2 = 180
  });

  it('handles undefined heading and speed', () => {
    const a = point(0, 0);
    const b = point(10, 0, { ts: 1000, receivedAt: 1000 });
    const r = linearLerp(a, b, 0.5);
    expect(r.heading).toBeUndefined();
    expect(r.speed).toBeUndefined();
  });
});

describe('catmullRomLerp', () => {
  // For four equally-spaced collinear control points, the Catmull-Rom
  // spline reduces to the straight line between p1 and p2 — handy
  // sanity check that the polynomial weights are right.
  it('on collinear evenly-spaced points reduces to the p1↔p2 line', () => {
    const p0 = point(0, 0);
    const p1 = point(1, 0);
    const p2 = point(2, 0);
    const p3 = point(3, 0);
    const r = catmullRomLerp(p0, p1, p2, p3, 0.5);
    expect(r.lng).toBeCloseTo(1.5, 6);
    expect(r.lat).toBeCloseTo(0, 6);
  });

  it('returns p1 at ratio=0 and p2 at ratio=1', () => {
    const p0 = point(0, 0);
    const p1 = point(1, 1);
    const p2 = point(3, 2);
    const p3 = point(4, 2);
    const start = catmullRomLerp(p0, p1, p2, p3, 0);
    const end = catmullRomLerp(p0, p1, p2, p3, 1);
    expect(start.lng).toBeCloseTo(p1.lng, 6);
    expect(start.lat).toBeCloseTo(p1.lat, 6);
    expect(end.lng).toBeCloseTo(p2.lng, 6);
    expect(end.lat).toBeCloseTo(p2.lat, 6);
  });

  // When p3 is the mirror phantom (2·p2 − p1), Tracker uses this curve
  // for the last segment. Verify the spline still passes through p1/p2.
  it('with a mirror phantom for p3 still passes through both endpoints', () => {
    const p0 = point(0, 0);
    const p1 = point(1, 1);
    const p2 = point(2, 3);
    const phantom = point(2 * p2.lng - p1.lng, 2 * p2.lat - p1.lat);
    const start = catmullRomLerp(p0, p1, p2, phantom, 0);
    const end = catmullRomLerp(p0, p1, p2, phantom, 1);
    expect(start.lng).toBeCloseTo(1, 6);
    expect(start.lat).toBeCloseTo(1, 6);
    expect(end.lng).toBeCloseTo(2, 6);
    expect(end.lat).toBeCloseTo(3, 6);
  });

  // Geometry/heading split: the spline shapes (lng, lat) only; heading
  // and speed take the straight linear path across the segment.
  it('interpolates heading and speed linearly along the segment', () => {
    const p0 = point(0, 0, { heading: 0, speed: 0 });
    const p1 = point(1, 0, { heading: 90, speed: 10 });
    const p2 = point(2, 0, { heading: 100, speed: 20 });
    const p3 = point(3, 0, { heading: 180, speed: 40 });
    const r = catmullRomLerp(p0, p1, p2, p3, 0.5);
    expect(r.heading).toBeCloseTo(95, 6);
    expect(r.speed).toBeCloseTo(15, 6);
  });

  it('takes a measurably different path from a straight lerp when control points bend', () => {
    // Off-axis control points force the spline to curve; its midpoint
    // diverges from the linear-lerp midpoint between p1 and p2. The
    // exact direction of the divergence depends on the polygon shape —
    // what matters here is that catmullRomLerp is not silently
    // collapsing into linear math.
    const p0 = point(0, 0);
    const p1 = point(1, 1);
    const p2 = point(2, 3);
    const p3 = point(4, 2);
    const spline = catmullRomLerp(p0, p1, p2, p3, 0.5);
    const lerp = linearLerp(p1, p2, 0.5);
    const drift = Math.abs(spline.lng - lerp.lng) + Math.abs(spline.lat - lerp.lat);
    expect(drift).toBeGreaterThan(0.001);
  });
});
