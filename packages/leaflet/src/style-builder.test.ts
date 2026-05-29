// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { colorForSpeed, createVehicleStyle } from './style-builder';
import type { DivIcon } from 'leaflet';
import type { TrailPoint } from '@kinesisjs/core';

const pt = (over: Partial<TrailPoint>): TrailPoint => ({
  lng: 0,
  lat: 0,
  ts: 0,
  receivedAt: 0,
  ...over,
});

const html = (icon: DivIcon): string => icon.options.html as string;

describe('colorForSpeed', () => {
  const bands = [
    { max: 30, color: '#22c55e' },
    { max: 80, color: '#eab308' },
    { max: 130, color: '#ef4444' },
  ];

  it('picks the first band whose max covers the speed', () => {
    expect(colorForSpeed(10, bands, '#000')).toBe('#22c55e');
    expect(colorForSpeed(50, bands, '#000')).toBe('#eab308');
    expect(colorForSpeed(100, bands, '#000')).toBe('#ef4444');
  });

  it('clamps above the top band to the last colour', () => {
    expect(colorForSpeed(999, bands, '#000')).toBe('#ef4444');
  });

  it('returns the fallback for an empty band list', () => {
    expect(colorForSpeed(50, [], '#abc')).toBe('#abc');
  });
});

describe('createVehicleStyle', () => {
  it('bakes the heading rotation into the icon HTML', () => {
    const factory = createVehicleStyle();
    expect(html(factory(pt({ heading: 90 })))).toContain('rotate(90deg)');
  });

  it('applies the rotationOffset', () => {
    const factory = createVehicleStyle({ rotationOffset: 45 });
    expect(html(factory(pt({ heading: 90 })))).toContain('rotate(135deg)');
  });

  it('colours the SVG dot by speed band', () => {
    const factory = createVehicleStyle({
      speedColorBands: [
        { max: 30, color: '#22c55e' },
        { max: 200, color: '#ef4444' },
      ],
    });
    expect(html(factory(pt({ speed: 10 })))).toContain('#22c55e');
    expect(html(factory(pt({ speed: 120 })))).toContain('#ef4444');
  });

  it('produces an image marker when an icon URL is given', () => {
    const factory = createVehicleStyle({ icon: '/car.png' });
    const out = html(factory(pt({ heading: 30 })));
    expect(out).toContain('<img');
    expect(out).toContain('/car.png');
    expect(out).toContain('rotate(30deg)');
  });

  it('falls back to the default colour without bands', () => {
    const factory = createVehicleStyle({ defaultColor: '#123456' });
    expect(html(factory(pt({ speed: 99 })))).toContain('#123456');
  });
});
