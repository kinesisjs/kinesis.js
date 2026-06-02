import { describe, expect, it } from 'vitest';
import { segmentHash } from './segment-hash';

describe('segmentHash', () => {
  const a = { lng: 29.0001, lat: 41.0001 };
  const b = { lng: 29.5, lat: 41.5 };

  it('is stable for identical input', () => {
    expect(segmentHash(a, b)).toBe(segmentHash(a, b));
  });

  it('differs for swapped from/to (segments are directional)', () => {
    expect(segmentHash(a, b)).not.toBe(segmentHash(b, a));
  });

  it('coalesces near-identical coordinates at default precision (~11 m)', () => {
    const a1 = { lng: 29.00011, lat: 41.00011 };
    const a2 = { lng: 29.00012, lat: 41.00012 };
    // Both round to (29.0001, 41.0001) at precision 4.
    expect(segmentHash(a1, b)).toBe(segmentHash(a2, b));
  });

  it('lower precision coalesces more aggressively', () => {
    const a1 = { lng: 29.01, lat: 41.0 };
    const a2 = { lng: 29.49, lat: 41.0 };
    // At precision 2 both still differ; at precision 0 both round to 29 → same key.
    expect(segmentHash(a1, b, 2)).not.toBe(segmentHash(a2, b, 2));
    expect(segmentHash(a1, b, 0)).toBe(segmentHash(a2, b, 0));
  });
});
