import { describe, expect, it } from 'vitest';
import { Interpolator } from './interpolator';
import type { TrailPoint } from './types';

const pt = (over: Partial<TrailPoint>): TrailPoint => ({
  lng: 0,
  lat: 0,
  ts: 0,
  receivedAt: 0,
  ...over,
});

describe('Interpolator geodesic — heading and speed branches', () => {
  const geo = new Interpolator('geodesic');

  it('returns the destination verbatim when the two points coincide (Δσ = 0)', () => {
    const p = pt({ lng: 29, lat: 41 });
    const result = geo.compute(p, { ...p }, 0.5);
    expect(result.lng).toBeCloseTo(29, 10);
    expect(result.lat).toBeCloseTo(41, 10);
  });

  it('interpolates heading via shortest arc when both endpoints have one', () => {
    const from = pt({ lng: 0, lat: 0, heading: 350 });
    const to = pt({ lng: 10, lat: 0, heading: 10 });
    const result = geo.compute(from, to, 0.5, true);
    expect(result.heading).toBeCloseTo(0, 6); // 350 → 10 shortest arc midpoint
  });

  it('interpolates heading linearly when shortestArc is disabled', () => {
    const from = pt({ lng: 0, lat: 0, heading: 10 });
    const to = pt({ lng: 10, lat: 0, heading: 50 });
    const result = geo.compute(from, to, 0.5, false);
    expect(result.heading).toBeCloseTo(30, 6);
  });

  it('carries the only defined heading (from-only, to-only)', () => {
    const fromOnly = geo.compute(pt({ lng: 0, lat: 0, heading: 90 }), pt({ lng: 10, lat: 0 }), 0.5);
    expect(fromOnly.heading).toBe(90);
    const toOnly = geo.compute(pt({ lng: 0, lat: 0 }), pt({ lng: 10, lat: 0, heading: 90 }), 0.5);
    expect(toOnly.heading).toBe(90);
  });

  it('interpolates speed when both endpoints have one, else carries the defined value', () => {
    const both = geo.compute(
      pt({ lng: 0, lat: 0, speed: 10 }),
      pt({ lng: 10, lat: 0, speed: 30 }),
      0.5,
    );
    expect(both.speed).toBeCloseTo(20, 6);

    const toOnly = geo.compute(pt({ lng: 0, lat: 0 }), pt({ lng: 10, lat: 0, speed: 42 }), 0.5);
    expect(toOnly.speed).toBe(42);
  });

  it('carries meta from the destination', () => {
    const result = geo.compute(
      pt({ lng: 0, lat: 0 }),
      pt({ lng: 10, lat: 0, meta: { plate: '34ABC' } }),
      0.5,
    );
    expect(result.meta).toEqual({ plate: '34ABC' });
  });
});

describe('Interpolator forceCubic and none', () => {
  it("forceCubic switches a 'linear' tracker tick to cubic easing", () => {
    const linear = new Interpolator('linear');
    const from = pt({ lng: 0, lat: 0 });
    const to = pt({ lng: 10, lat: 0 });
    const plain = linear.compute(from, to, 0.25, true, false);
    const forced = linear.compute(from, to, 0.25, true, true);
    // smoothstep(0.25) < 0.25, so the eased x is behind the linear x
    expect(forced.lng).toBeLessThan(plain.lng);
  });

  it("'none' mode returns the destination unchanged", () => {
    const none = new Interpolator('none');
    const to = pt({ lng: 10, lat: 5 });
    expect(none.compute(pt({ lng: 0, lat: 0 }), to, 0.5)).toBe(to);
  });
});
