import { describe, expect, it } from 'vitest';
import { AdaptiveInterpolator } from './adaptive-interpolator';
import type { TrailPoint } from './types';

const pt = (lng: number, lat: number, receivedAt: number): TrailPoint => ({
  lng,
  lat,
  ts: receivedAt,
  receivedAt,
});

describe('AdaptiveInterpolator.classify', () => {
  const ai = new AdaptiveInterpolator();

  it("returns 'none' for very short periods (<1s default)", () => {
    expect(ai.classify(500)).toBe('none');
  });

  it("returns 'linear' for sweet spot (1-8s default)", () => {
    expect(ai.classify(1000)).toBe('linear');
    expect(ai.classify(5000)).toBe('linear');
    expect(ai.classify(8000)).toBe('linear');
  });

  it("returns 'fade' for long gaps (8-15s default)", () => {
    expect(ai.classify(10000)).toBe('fade');
    expect(ai.classify(15000)).toBe('fade');
  });

  it("returns 'snap' for very long gaps (>15s default)", () => {
    expect(ai.classify(20000)).toBe('snap');
  });

  it('respects custom thresholds', () => {
    const custom = new AdaptiveInterpolator({
      minPeriodMs: 500,
      maxPeriodMs: 3000,
      fadeThresholdMs: 10000,
      snapThresholdMs: 10000,
    });
    expect(custom.classify(400)).toBe('none');
    expect(custom.classify(2000)).toBe('linear');
    expect(custom.classify(7000)).toBe('fade');
    expect(custom.classify(15000)).toBe('snap');
  });
});

describe('AdaptiveInterpolator.compute', () => {
  const ai = new AdaptiveInterpolator();

  it("'none' zone returns `to` directly", () => {
    const from = pt(0, 0, 0);
    const to = pt(10, 10, 500); // 500ms period < 1s minPeriod
    const r = ai.compute(from, to, 0.5);
    expect(r.lng).toBe(10);
    expect(r.lat).toBe(10);
  });

  it("'linear' zone returns midpoint at ratio=0.5", () => {
    const from = pt(0, 0, 0);
    const to = pt(10, 10, 5000);
    const r = ai.compute(from, to, 0.5);
    expect(r.lng).toBe(5);
    expect(r.lat).toBe(5);
  });

  it("'snap' zone returns `to` regardless of ratio", () => {
    const from = pt(0, 0, 0);
    const to = pt(10, 10, 20000);
    const r = ai.compute(from, to, 0.5);
    expect(r.lng).toBe(10);
  });

  it('forceCubic flag uses cubic easing in linear/fade zones', () => {
    const from = pt(0, 0, 0);
    const to = pt(10, 10, 5000);
    const cubicResult = ai.compute(from, to, 0.25, true, true);
    // smoothstep(0.25) ≈ 0.156 → lng ≈ 1.56, less than linear's 2.5
    expect(cubicResult.lng).toBeLessThan(2.5);
  });
});

describe('AdaptiveInterpolator.shouldFade', () => {
  const ai = new AdaptiveInterpolator();

  it('returns true only for fade zone', () => {
    expect(ai.shouldFade(500)).toBe(false);
    expect(ai.shouldFade(5000)).toBe(false);
    expect(ai.shouldFade(10000)).toBe(true);
    expect(ai.shouldFade(20000)).toBe(false); // 'snap', not 'fade'
  });
});
