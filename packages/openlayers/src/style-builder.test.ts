import { describe, expect, it } from 'vitest';
import Circle from 'ol/style/Circle';
import Icon from 'ol/style/Icon';
import { colorForSpeed, createVehicleStyle } from './style-builder';
import type { TrailPoint } from '@kinesisjs/core';

const pt = (extra: Partial<TrailPoint> = {}): TrailPoint => ({
  lng: 29,
  lat: 41,
  ts: 0,
  receivedAt: 0,
  ...extra,
});

describe('createVehicleStyle — default (Circle)', () => {
  it('returns a Style with a Circle image when no icon given', () => {
    const styleFn = createVehicleStyle();
    const style = styleFn(pt());
    expect(style.getImage()).toBeInstanceOf(Circle);
  });

  it('uses defaultColor when no speed bands', () => {
    const styleFn = createVehicleStyle({ defaultColor: '#ff0000' });
    const style = styleFn(pt({ speed: 50 }));
    const image = style.getImage() as Circle;
    const fillColor = image.getFill()?.getColor();
    expect(fillColor).toBe('#ff0000');
  });

  it('respects circleRadius option', () => {
    const styleFn = createVehicleStyle({ circleRadius: 12 });
    const style = styleFn(pt());
    expect((style.getImage() as Circle).getRadius()).toBe(12);
  });
});

describe('createVehicleStyle — Icon mode', () => {
  it('returns Icon style when icon URL provided', () => {
    const styleFn = createVehicleStyle({ icon: '/car.png' });
    const style = styleFn(pt());
    expect(style.getImage()).toBeInstanceOf(Icon);
  });

  it('converts heading degrees to radians for icon rotation', () => {
    const styleFn = createVehicleStyle({ icon: '/car.png' });
    const style = styleFn(pt({ heading: 90 })); // 90° → π/2 rad
    const rotation = (style.getImage() as Icon).getRotation();
    expect(rotation).toBeCloseTo(Math.PI / 2, 5);
  });

  it('applies rotationOffset on top of heading', () => {
    const styleFn = createVehicleStyle({ icon: '/car.png', rotationOffset: 90 });
    const style = styleFn(pt({ heading: 0 }));
    const rotation = (style.getImage() as Icon).getRotation();
    expect(rotation).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('colorForSpeed', () => {
  const bands = [
    { max: 30, color: '#22c55e' }, // green
    { max: 80, color: '#eab308' }, // yellow
    { max: 130, color: '#ef4444' }, // red
  ];

  it('picks the first matching band', () => {
    expect(colorForSpeed(20, bands)).toBe('#22c55e');
    expect(colorForSpeed(60, bands)).toBe('#eab308');
    expect(colorForSpeed(100, bands)).toBe('#ef4444');
  });

  it('boundary equal-to-max falls in that band', () => {
    expect(colorForSpeed(30, bands)).toBe('#22c55e');
    expect(colorForSpeed(80, bands)).toBe('#eab308');
  });

  it('over-max returns last band color', () => {
    expect(colorForSpeed(200, bands)).toBe('#ef4444');
  });

  it('returns fallback when bands empty and fallback given', () => {
    expect(colorForSpeed(50, [], '#000')).toBe('#000');
  });
});
