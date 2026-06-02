import { describe, expect, it } from 'vitest';
import * as ra from './index';

describe('@kinesisjs/route-aware public API', () => {
  it('exports the main classes and helpers', () => {
    expect(typeof ra.OSRMInterpolator).toBe('function');
    expect(typeof ra.LRU).toBe('function');
    expect(typeof ra.segmentHash).toBe('function');
    expect(typeof ra.cumulativeArcLengths).toBe('function');
    expect(typeof ra.walkPolyline).toBe('function');
  });

  it('exposes a VERSION constant', () => {
    expect(ra.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
