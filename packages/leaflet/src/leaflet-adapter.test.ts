// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as L from 'leaflet';
import { Tracker } from '@kinesisjs/core';
import { LeafletAdapter } from './leaflet-adapter';
import { createVehicleStyle } from './style-builder';
import type { Map as LeafletMap, DivIcon } from 'leaflet';
import type { TrailPoint } from '@kinesisjs/core';

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

const pt = (lng: number, lat: number, extra: Partial<TrailPoint> = {}): TrailPoint => ({
  lng,
  lat,
  ts: 0,
  receivedAt: 0,
  ...extra,
});

let map: LeafletMap;

beforeEach(() => {
  map = makeMap();
});

afterEach(() => {
  map.remove();
  document.body.innerHTML = '';
});

describe('LeafletAdapter — lifecycle', () => {
  it('addVehicle creates a marker at [lat, lng]', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    const m = adapter.getFeature('v1');
    expect(m).toBeDefined();
    const ll = m!.getLatLng();
    expect(ll.lat).toBeCloseTo(41, 10);
    expect(ll.lng).toBeCloseTo(29, 10);
  });

  it('updatePosition moves the marker', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updatePosition('v1', pt(30, 42));
    const ll = adapter.getFeature('v1')!.getLatLng();
    expect(ll.lat).toBeCloseTo(42, 10);
    expect(ll.lng).toBeCloseTo(30, 10);
  });

  it('updatePosition is a no-op for an unknown vehicle', () => {
    const adapter = new LeafletAdapter(map);
    expect(() => adapter.updatePosition('ghost', pt(0, 0))).not.toThrow();
  });

  it('removeVehicle drops the marker', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    adapter.removeVehicle('v1');
    expect(adapter.getFeature('v1')).toBeUndefined();
  });

  it('getAllFeatures returns a copy', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    const all = adapter.getAllFeatures();
    expect(all.size).toBe(1);
    all.delete('v1');
    expect(adapter.getFeature('v1')).toBeDefined(); // internal map untouched
  });

  it('destroy removes the owned layer group from the map', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    adapter.destroy();
    expect(adapter.getFeature('v1')).toBeUndefined();
  });
});

describe('LeafletAdapter — managedFeatureIds', () => {
  it('ignores ids outside the managed set', () => {
    const adapter = new LeafletAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.addVehicle('v1', pt(29, 41));
    adapter.addVehicle('v2', pt(29, 41));
    expect(adapter.getFeature('v1')).toBeDefined();
    expect(adapter.getFeature('v2')).toBeUndefined();
  });

  it('setManagedIds updates the allow-list at runtime', () => {
    const adapter = new LeafletAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.setManagedIds(['v1', 'v2']);
    adapter.addVehicle('v2', pt(29, 41));
    expect(adapter.getFeature('v2')).toBeDefined();
  });

  it('attaches to an existing layer without owning it', () => {
    const shared = L.layerGroup().addTo(map);
    const adapter = new LeafletAdapter(map, { existingLayer: shared });
    adapter.addVehicle('v1', pt(29, 41));
    expect(adapter.getFeature('v1')).toBeDefined();
    adapter.destroy();
    // shared group remains on the map (not owned by the adapter)
    expect(map.hasLayer(shared)).toBe(true);
  });
});

describe('LeafletAdapter — opacity and state', () => {
  it('updateOpacity sets marker opacity', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updateOpacity('v1', 0.4);
    expect(adapter.getFeature('v1')!.options.opacity).toBeCloseTo(0.4, 6);
  });

  it('dims to warningOpacity on warning and restores on active', () => {
    const adapter = new LeafletAdapter(map, { warningOpacity: 0.5 });
    adapter.addVehicle('v1', pt(29, 41));
    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')!.options.opacity).toBeCloseTo(0.5, 6);
    adapter.setVehicleState('v1', 'active');
    expect(adapter.getFeature('v1')!.options.opacity).toBeCloseTo(1, 6);
  });

  it('leaves opacity untouched on state changes when warningOpacity is unset', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')!.options.opacity).toBeCloseTo(1, 6);
  });
});

describe('LeafletAdapter — icons and rotation', () => {
  it('default marker rotates its rendered element to the heading', () => {
    const adapter = new LeafletAdapter(map);
    adapter.addVehicle('v1', pt(29, 41, { heading: 0 }));
    adapter.updatePosition('v1', pt(29.0001, 41, { heading: 90 }));
    const inner = adapter.getFeature('v1')!.getElement()?.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('rotate(90deg)');
  });

  it('a dynamic style factory is re-evaluated on each update', () => {
    const adapter = new LeafletAdapter(map, {
      style: createVehicleStyle({
        speedColorBands: [
          { max: 30, color: '#22c55e' },
          { max: 200, color: '#ef4444' },
        ],
      }),
    });
    adapter.addVehicle('v1', pt(29, 41, { speed: 10 }));
    const slow = (adapter.getFeature('v1')!.options.icon as DivIcon).options.html as string;
    adapter.updatePosition('v1', pt(29.0001, 41, { speed: 120 }));
    const fast = (adapter.getFeature('v1')!.options.icon as DivIcon).options.html as string;
    expect(slow).toContain('#22c55e');
    expect(fast).toContain('#ef4444');
  });

  it('a static icon is applied once and not re-evaluated', () => {
    const icon = L.divIcon({ html: '<b>static</b>' });
    const adapter = new LeafletAdapter(map, { style: icon });
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updatePosition('v1', pt(30, 42, { heading: 180 }));
    expect(adapter.getFeature('v1')!.options.icon).toBe(icon);
  });
});

describe('LeafletAdapter — trail', () => {
  it('accumulates a bounded trail buffer (reflected in the memory estimate)', () => {
    const adapter = new LeafletAdapter(map, {
      trail: { enabled: true, maxPoints: 3, intervalMs: 0 },
    });
    adapter.addVehicle('v1', pt(29, 41));
    const base = adapter.getMemoryEstimate();
    for (let i = 1; i <= 10; i++) adapter.updatePosition('v1', pt(29 + i * 0.001, 41));
    const grown = adapter.getMemoryEstimate();
    expect(grown).toBeGreaterThan(base);
    // Buffer is capped at maxPoints (3): 256 (marker) + 64 + 3*16 = 368
    expect(grown).toBe(256 + 64 + 3 * 16);
  });
});

describe('LeafletAdapter — integration with Tracker (cross-adapter parity)', () => {
  it('renders the interpolated midpoint at renderTime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new LeafletAdapter(map);
    const tracker = new Tracker({ adapter, ingestThrottle: 0 });
    tracker.ingest([{ id: 'v1', lng: 29.0, lat: 41, speed: 50 }]);
    vi.setSystemTime(2000);
    tracker.ingest([{ id: 'v1', lng: 29.0002, lat: 41, speed: 50 }]);
    vi.setSystemTime(2500); // renderTime = 1500 → ratio 0.5
    tracker.tickOnce();
    const ll = adapter.getFeature('v1')!.getLatLng();
    expect(ll.lng).toBeCloseTo(29.0001, 6); // midway between 29.0 and 29.0002
    tracker.destroy();
    vi.useRealTimers();
  });
});
