import { describe, expect, it } from 'vitest';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type OLMap from 'ol/Map';
import { CROSS_ADAPTER_SCENARIOS, checkParity, runScenario } from '@kinesisjs/test-utils';
import { OpenLayersAdapter } from './openlayers-adapter';

/**
 * Cross-adapter parity bar for @kinesisjs/openlayers.
 *
 * Drives every canonical scenario from the shared harness against a
 * fresh `OpenLayersAdapter` and asserts the recorded adapter call
 * sequence matches the expected baseline. The same suite runs against
 * @kinesisjs/leaflet; any new adapter added to the project picks up
 * the same bar by importing the same harness.
 */

class FakeMap {
  layers: VectorLayer<VectorSource>[] = [];
  addLayer(layer: VectorLayer<VectorSource>): void {
    this.layers.push(layer);
  }
  removeLayer(layer: VectorLayer<VectorSource>): void {
    this.layers = this.layers.filter((l) => l !== layer);
  }
}

const buildAdapter = (): OpenLayersAdapter =>
  new OpenLayersAdapter(new FakeMap() as unknown as OLMap);

describe('OpenLayersAdapter — cross-adapter parity', () => {
  for (const scenario of CROSS_ADAPTER_SCENARIOS) {
    it(scenario.name, () => {
      const calls = runScenario(buildAdapter, scenario);
      const result = checkParity(calls, scenario.expected);
      if (!result.ok) throw new Error(result.message);
      expect(result.ok).toBe(true);
    });
  }
});
