// @vitest-environment jsdom
// Leaflet references `window` at import time, so even this export-surface
// check needs a DOM environment.
import { describe, expect, it } from 'vitest';
import * as leaflet from './index';

describe('@kinesisjs/leaflet public API', () => {
  it('exports the adapter and style helpers', () => {
    expect(typeof leaflet.LeafletAdapter).toBe('function');
    expect(typeof leaflet.createVehicleStyle).toBe('function');
    expect(typeof leaflet.colorForSpeed).toBe('function');
  });

  it('exposes a VERSION constant', () => {
    expect(leaflet.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
