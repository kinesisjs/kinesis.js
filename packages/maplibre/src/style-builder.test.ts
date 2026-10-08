import { describe, expect, it } from 'vitest';
import type { TrailPoint } from '@kinesisjs/core';
import {
  ARROW_SPRITE_SIZE,
  colorForSpeed,
  createArrowImage,
  createVehicleStyle,
} from './style-builder';

function point(overrides: Partial<TrailPoint> = {}): TrailPoint {
  return { lng: 29, lat: 41, ts: 0, receivedAt: 0, ...overrides };
}

const BANDS = [
  { max: 30, color: '#22c55e' },
  { max: 80, color: '#eab308' },
  { max: 130, color: '#ef4444' },
];

describe('colorForSpeed', () => {
  it('picks the first band covering the speed', () => {
    expect(colorForSpeed(0, BANDS, '#000')).toBe('#22c55e');
    expect(colorForSpeed(30, BANDS, '#000')).toBe('#22c55e');
    expect(colorForSpeed(31, BANDS, '#000')).toBe('#eab308');
    expect(colorForSpeed(129, BANDS, '#000')).toBe('#ef4444');
  });

  it('clamps to the last band above the top threshold', () => {
    expect(colorForSpeed(999, BANDS, '#000')).toBe('#ef4444');
  });

  it('falls back when no bands are configured', () => {
    expect(colorForSpeed(50, [], '#abcdef')).toBe('#abcdef');
  });
});

describe('createVehicleStyle', () => {
  it('produces the default colour and no rotation when heading is absent', () => {
    const style = createVehicleStyle()(point());
    expect(style.color).toBe('#3b82f6');
    expect(style.rotation).toBe(0);
    expect(style.icon).toBeUndefined();
  });

  it('rotates to the heading plus the configured offset', () => {
    const factory = createVehicleStyle({ rotationOffset: 90 });
    expect(factory(point({ heading: 45 })).rotation).toBe(135);
  });

  it('applies speed-band colouring', () => {
    const factory = createVehicleStyle({ speedColorBands: BANDS });
    expect(factory(point({ speed: 10 })).color).toBe('#22c55e');
    expect(factory(point({ speed: 100 })).color).toBe('#ef4444');
  });

  it('converts a pixel size to an icon-size multiplier for the built-in arrow', () => {
    const style = createVehicleStyle({ iconSize: 32 })(point());
    expect(style.size).toBeCloseTo(32 / ARROW_SPRITE_SIZE);
  });

  it('passes iconScale through untouched for a custom sprite', () => {
    const style = createVehicleStyle({ icon: 'bus', iconScale: 2 })(point());
    expect(style.icon).toBe('bus');
    expect(style.size).toBe(2);
  });

  it('coerces a non-numeric heading rather than emitting NaN', () => {
    // `heading` arrives unvalidated from the position feed; NaN in a paint
    // expression blanks the layer instead of failing loudly.
    const style = createVehicleStyle()(point({ heading: 'north' as unknown as number }));
    expect(style.rotation).toBe(0);
    expect(Number.isFinite(style.rotation)).toBe(true);
  });

  it('coerces a non-numeric speed before band resolution', () => {
    const factory = createVehicleStyle({ speedColorBands: BANDS });
    const style = factory(point({ speed: undefined }));
    expect(style.color).toBe('#22c55e');
  });
});

describe('createArrowImage', () => {
  it('returns a square RGBA buffer of the requested size', () => {
    const img = createArrowImage(16);
    expect(img.width).toBe(16);
    expect(img.height).toBe(16);
    expect(img.data.length).toBe(16 * 16 * 4);
  });

  it('defaults to the sprite size the adapter registers', () => {
    const img = createArrowImage();
    expect(img.width).toBe(ARROW_SPRITE_SIZE);
  });

  it('encodes a distance field: inside the arrow is above the 128 midpoint', () => {
    const size = 32;
    const img = createArrowImage(size);
    const alphaAt = (x: number, y: number): number => img.data[(y * size + x) * 4 + 3] as number;

    // A point well inside the arrow body, below the tip and above the notch.
    expect(alphaAt(16, 18)).toBeGreaterThan(128);
    // The top corners sit outside the triangle entirely.
    expect(alphaAt(0, 0)).toBeLessThan(128);
    expect(alphaAt(size - 1, 0)).toBeLessThan(128);
  });

  it('writes opaque white RGB so icon-color drives the tint', () => {
    const img = createArrowImage(8);
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(255);
    expect(img.data[2]).toBe(255);
  });
});
