import { describe, expect, it } from 'vitest';
import { linearLerp } from './math-utils';
import type { TrailPoint } from './types';

const pt = (over: Partial<TrailPoint>): TrailPoint => ({
  lng: 0,
  lat: 0,
  ts: 0,
  receivedAt: 0,
  ...over,
});

describe('linearLerp — optional heading / speed / meta branches', () => {
  it('returns no heading when neither endpoint has one', () => {
    expect(linearLerp(pt({}), pt({ lng: 10 }), 0.5).heading).toBeUndefined();
  });

  it('carries the only defined heading (from-only, to-only)', () => {
    expect(linearLerp(pt({ heading: 90 }), pt({ lng: 10 }), 0.5).heading).toBe(90);
    expect(linearLerp(pt({}), pt({ lng: 10, heading: 90 }), 0.5).heading).toBe(90);
  });

  it('blends headings shortest-arc by default and linearly when disabled', () => {
    expect(linearLerp(pt({ heading: 350 }), pt({ heading: 10 }), 0.5, true).heading).toBeCloseTo(
      0,
      6,
    );
    expect(linearLerp(pt({ heading: 10 }), pt({ heading: 50 }), 0.5, false).heading).toBeCloseTo(
      30,
      6,
    );
  });

  it('returns no speed when neither endpoint has one; carries the only defined value', () => {
    expect(linearLerp(pt({}), pt({ lng: 10 }), 0.5).speed).toBeUndefined();
    expect(linearLerp(pt({ speed: 12 }), pt({ lng: 10 }), 0.5).speed).toBe(12);
    expect(linearLerp(pt({}), pt({ lng: 10, speed: 12 }), 0.5).speed).toBe(12);
  });

  it('interpolates speed when both endpoints have one', () => {
    expect(linearLerp(pt({ speed: 10 }), pt({ speed: 30 }), 0.5).speed).toBeCloseTo(20, 6);
  });

  it('carries meta from the destination only when present', () => {
    expect(linearLerp(pt({}), pt({ lng: 10 }), 0.5).meta).toBeUndefined();
    expect(linearLerp(pt({}), pt({ lng: 10, meta: { k: 1 } }), 0.5).meta).toEqual({ k: 1 });
  });
});
