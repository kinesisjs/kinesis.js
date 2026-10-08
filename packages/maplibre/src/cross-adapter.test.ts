import { describe, expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CROSS_ADAPTER_SCENARIOS, checkParity, runScenario } from '@kinesisjs/test-utils';
import { MapLibreAdapter } from './maplibre-adapter';

/**
 * Cross-adapter parity bar for @kinesisjs/maplibre.
 *
 * Drives every canonical scenario from the shared harness against a fresh
 * `MapLibreAdapter` and asserts the recorded adapter call sequence matches the
 * expected baseline — the same suite @kinesisjs/openlayers and
 * @kinesisjs/leaflet run. Passing it means the three are observationally
 * interchangeable from the Tracker's point of view, despite rendering through
 * completely different primitives (GL source vs. vector feature vs. DOM marker).
 *
 * jsdom has no WebGL context, so a real `maplibregl.Map` cannot be built here;
 * this uses the same stub approach as the OpenLayers suite.
 */
class FakeSource {
  constructor(public data: unknown) {}
  setData(data: unknown): void {
    this.data = data;
  }
}

class FakeMap {
  private sources = new Map<string, FakeSource>();
  private layers = new Map<string, unknown>();
  private images = new Set<string>();

  isStyleLoaded(): boolean {
    return true;
  }
  hasImage(id: string): boolean {
    return this.images.has(id);
  }
  addImage(id: string): void {
    this.images.add(id);
  }
  getSource(id: string): FakeSource | undefined {
    return this.sources.get(id);
  }
  addSource(id: string, spec: { data: unknown }): void {
    this.sources.set(id, new FakeSource(spec.data));
  }
  removeSource(id: string): void {
    this.sources.delete(id);
  }
  getLayer(id: string): unknown {
    return this.layers.get(id);
  }
  addLayer(layer: { id: string }): void {
    this.layers.set(layer.id, layer);
  }
  removeLayer(id: string): void {
    this.layers.delete(id);
  }
  once(): void {}
  on(): void {}
  off(): void {}
}

const buildAdapter = (): MapLibreAdapter =>
  new MapLibreAdapter(new FakeMap() as unknown as MapLibreMap);

describe('MapLibreAdapter — cross-adapter parity', () => {
  for (const scenario of CROSS_ADAPTER_SCENARIOS) {
    it(scenario.name, () => {
      const calls = runScenario(buildAdapter, scenario);
      const result = checkParity(calls, scenario.expected);
      if (!result.ok) throw new Error(result.message);
      expect(result.ok).toBe(true);
    });
  }
});
