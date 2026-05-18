import { describe, expect, it } from 'vitest';
import { haversineDistance, linearLerp, shortestArcDiff } from './math-utils';
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
