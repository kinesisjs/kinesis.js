// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { CROSS_ADAPTER_SCENARIOS, checkParity, runScenario } from '@kinesisjs/test-utils';
import { LeafletAdapter } from './leaflet-adapter';

/**
 * Cross-adapter parity bar for @kinesisjs/leaflet.
 *
 * Mirrors @kinesisjs/openlayers' parity suite — every canonical
 * scenario from the shared harness runs against a real `L.Map` (jsdom
 * environment) and must produce the same recorded adapter call
 * sequence as the baseline.
 */

function makeMap(): LeafletMap {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);
  return L.map(container, {
    center: [41, 29],
    zoom: 12,
    fadeAnimation: false,
    zoomAnimation: false,
    markerZoomAnimation: false,
  });
}

let map: LeafletMap;

beforeEach(() => {
  map = makeMap();
});

afterEach(() => {
  map.remove();
  document.body.innerHTML = '';
});

const buildAdapter = (): LeafletAdapter => new LeafletAdapter(map);

describe('LeafletAdapter — cross-adapter parity', () => {
  for (const scenario of CROSS_ADAPTER_SCENARIOS) {
    it(scenario.name, () => {
      const calls = runScenario(buildAdapter, scenario);
      const result = checkParity(calls, scenario.expected);
      if (!result.ok) throw new Error(result.message);
      expect(result.ok).toBe(true);
    });
  }
});
