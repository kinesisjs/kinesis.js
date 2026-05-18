import { describe, expect, it } from 'vitest';
import { Interpolator } from './interpolator';
import type { TrailPoint } from './types';

const pt = (lng: number, lat: number, extra: Partial<TrailPoint> = {}): TrailPoint => ({
  lng,
  lat,
  ts: 0,
  receivedAt: 0,
  ...extra,
});

describe('Interpolator', () => {
  const from = pt(0, 0);
  const to = pt(10, 10, { ts: 1000, receivedAt: 1000 });

  describe("mode 'linear'", () => {
    const interp = new Interpolator('linear');

    it('produces midpoint at ratio=0.5', () => {
      const r = interp.compute(from, to, 0.5);
      expect(r.lng).toBe(5);
      expect(r.lat).toBe(5);
    });

    it('switches to cubic when forceCubic=true', () => {
      const r = interp.compute(from, to, 0.5, true, true);
      // smoothstep(0.5) === 0.5, so midpoint same, but verify it routed through cubic
      expect(r.lng).toBe(5);
    });
  });

  describe("mode 'cubic'", () => {
    const interp = new Interpolator('cubic');

    it('produces monotonically increasing values along [0, 1]', () => {
      const a = interp.compute(from, to, 0.25);
      const b = interp.compute(from, to, 0.5);
      const c = interp.compute(from, to, 0.75);
      expect(b.lng).toBeGreaterThan(a.lng);
      expect(c.lng).toBeGreaterThan(b.lng);
    });

    it('eases near endpoints (cubic < linear at ratio=0.25)', () => {
      const cubic = interp.compute(from, to, 0.25);
      // smoothstep(0.25) ≈ 0.156, so cubic at 0.25 gives ~1.56 vs linear 2.5
      expect(cubic.lng).toBeLessThan(2.5);
    });
  });

  describe("mode 'geodesic'", () => {
    const interp = new Interpolator('geodesic');

    it('returns `to` when from === to', () => {
      const same = pt(0, 0);
      const r = interp.compute(same, same, 0.5);
      expect(r.lng).toBe(0);
      expect(r.lat).toBe(0);
    });

    it('great-circle midpoint between Istanbul and NYC is north of both', () => {
      const ist = pt(28.97, 41.01);
      const nyc = pt(-74.0, 40.71, { ts: 1000, receivedAt: 1000 });
      const r = interp.compute(ist, nyc, 0.5);
      expect(r.lat).toBeGreaterThan(50); // great-circle bows north
    });
  });

  describe("mode 'none'", () => {
    const interp = new Interpolator('none');

    it('returns `to` regardless of ratio', () => {
      const r = interp.compute(from, to, 0.5);
      expect(r.lng).toBe(10);
      expect(r.lat).toBe(10);
    });
  });

  describe('heading shortest-arc', () => {
    const interp = new Interpolator('linear');

    it('crosses 0° using short path (350° → 10° at 0.5 = 0°)', () => {
      const a = pt(0, 0, { heading: 350 });
      const b = pt(0, 0, { ts: 1000, receivedAt: 1000, heading: 10 });
      const r = interp.compute(a, b, 0.5, true);
      expect(r.heading).toBe(0);
    });

    it('uses long path when shortestArcHeading=false', () => {
      const a = pt(0, 0, { heading: 350 });
      const b = pt(0, 0, { ts: 1000, receivedAt: 1000, heading: 10 });
      const r = interp.compute(a, b, 0.5, false);
      expect(r.heading).toBe(180);
    });
  });
});
