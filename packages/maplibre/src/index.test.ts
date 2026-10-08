import { describe, expect, it } from 'vitest';
import {
  ARROW_SPRITE_SIZE,
  DEFAULT_ICON_ID,
  MapLibreAdapter,
  VERSION,
  colorForSpeed,
  createArrowImage,
  createVehicleStyle,
} from './index';

describe('@kinesisjs/maplibre public API', () => {
  it('exports the adapter and style helpers', () => {
    expect(MapLibreAdapter).toBeTypeOf('function');
    expect(createVehicleStyle).toBeTypeOf('function');
    expect(colorForSpeed).toBeTypeOf('function');
    expect(createArrowImage).toBeTypeOf('function');
  });

  it('exposes the sprite constants the layer expressions depend on', () => {
    expect(DEFAULT_ICON_ID).toBe('kinesis-arrow');
    expect(ARROW_SPRITE_SIZE).toBeGreaterThan(0);
  });

  it('exposes a VERSION constant', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
