import { describe, expect, it } from 'vitest';
import { cumulativeArcLengths, walkPolyline } from './arc-length';
import type { Polyline } from './types';

describe('cumulativeArcLengths', () => {
  it('returns [0] for a single-point polyline', () => {
    const poly: Polyline = [[29, 41]];
    expect(cumulativeArcLengths(poly)).toEqual([0]);
  });

  it('returns monotonically increasing distances', () => {
    const poly: Polyline = [
      [29, 41],
      [29.001, 41],
      [29.001, 41.001],
    ];
    const cum = cumulativeArcLengths(poly);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(0);
    expect(cum[2]).toBeGreaterThan(cum[1]!);
  });

  it('total is the sum of segment lengths', () => {
    const poly: Polyline = [
      [29, 41],
      [29.001, 41],
      [29.002, 41],
    ];
    const cum = cumulativeArcLengths(poly);
    // Two equal-ish steps along the same parallel — total ~= 2× first step.
    expect(cum[2]! / cum[1]!).toBeCloseTo(2, 1);
  });
});

describe('walkPolyline', () => {
  // Equal-length east-going legs — keeps geodesic math out of the way so
  // ratio 0.5 lands exactly on the middle vertex.
  const straight: Polyline = [
    [29, 41],
    [29.001, 41],
    [29.002, 41],
  ];

  it('ratio 0 returns the first vertex', () => {
    const cum = cumulativeArcLengths(straight);
    const p = walkPolyline(straight, cum, 0);
    expect(p.lng).toBeCloseTo(29, 6);
    expect(p.lat).toBeCloseTo(41, 6);
  });

  it('ratio 1 returns the last vertex', () => {
    const cum = cumulativeArcLengths(straight);
    const p = walkPolyline(straight, cum, 1);
    expect(p.lng).toBeCloseTo(29.002, 6);
    expect(p.lat).toBeCloseTo(41, 6);
  });

  it('ratio 0.5 lands on the middle vertex (half the total arc length)', () => {
    const cum = cumulativeArcLengths(straight);
    const p = walkPolyline(straight, cum, 0.5);
    expect(p.lng).toBeCloseTo(29.001, 6);
    expect(p.lat).toBeCloseTo(41, 6);
  });

  it('reports the heading of the segment we landed on', () => {
    // An L-shape: east leg then north leg. We sample well inside each leg —
    // the two legs are not equal arc-length because 0.001° lng @ lat 41 isn't
    // the same as 0.001° lat, so we don't try to assert the exact crossover.
    const L: Polyline = [
      [29, 41],
      [29.001, 41],
      [29.001, 41.001],
    ];
    const cum = cumulativeArcLengths(L);
    const east = walkPolyline(L, cum, 0.2);
    expect(east.heading).toBeCloseTo(90, 0);
    const north = walkPolyline(L, cum, 0.95);
    expect(north.heading).toBeCloseTo(0, 0);
  });

  it('clamps out-of-range ratios', () => {
    const cum = cumulativeArcLengths(straight);
    expect(walkPolyline(straight, cum, -1).lng).toBeCloseTo(29, 6);
    expect(walkPolyline(straight, cum, 2).lng).toBeCloseTo(29.002, 6);
  });

  it('handles a degenerate zero-length polyline', () => {
    const single: Polyline = [[29, 41]];
    const cum = cumulativeArcLengths(single);
    const p = walkPolyline(single, cum, 0.5);
    expect(p.lng).toBe(29);
    expect(p.lat).toBe(41);
  });
});
