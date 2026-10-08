import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TrailPoint } from '@kinesisjs/core';
import { MapLibreAdapter } from './maplibre-adapter';
import { DEFAULT_ICON_ID, createVehicleStyle } from './style-builder';

/**
 * MapLibre's `Map` needs a WebGL context, which jsdom does not provide, so a
 * real map cannot be constructed the way the Leaflet suite builds `L.map()`.
 * This mirrors the OpenLayers suite instead: a stub implementing only the
 * surface the adapter touches.
 */
class FakeSource {
  setData = vi.fn();
  constructor(public data: unknown) {}
}

class FakeMap {
  sources = new Map<string, FakeSource>();
  layers = new Map<string, { id: string; type: string; source: string }>();
  layerOrder: Array<{ id: string; beforeId?: string }> = [];
  images = new Map<string, { sdf?: boolean }>();
  styleLoaded = true;
  private handlers = new Map<string, Set<() => void>>();

  isStyleLoaded(): boolean {
    return this.styleLoaded;
  }
  hasImage(id: string): boolean {
    return this.images.has(id);
  }
  addImage(id: string, _img: unknown, opts?: { sdf?: boolean }): void {
    this.images.set(id, opts ?? {});
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
  getLayer(id: string): { id: string } | undefined {
    return this.layers.get(id);
  }
  addLayer(layer: { id: string; type: string; source: string }, beforeId?: string): void {
    this.layers.set(layer.id, layer);
    this.layerOrder.push(beforeId === undefined ? { id: layer.id } : { id: layer.id, beforeId });
  }
  removeLayer(id: string): void {
    this.layers.delete(id);
  }
  once(event: string, cb: () => void): void {
    this.on(event, cb);
  }
  on(event: string, cb: () => void): void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(cb);
    this.handlers.set(event, set);
  }
  off(event: string, cb: () => void): void {
    this.handlers.get(event)?.delete(cb);
  }
  fire(event: string): void {
    for (const cb of this.handlers.get(event) ?? []) cb();
  }
  handlerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

function makeMap(): { fake: FakeMap; map: MapLibreMap } {
  const fake = new FakeMap();
  return { fake, map: fake as unknown as MapLibreMap };
}

function point(overrides: Partial<TrailPoint> = {}): TrailPoint {
  return { lng: 29, lat: 41, ts: 0, receivedAt: 0, ...overrides };
}

/** Let the coalescing microtask run. */
const settle = (): Promise<void> => Promise.resolve();

describe('MapLibreAdapter — setup', () => {
  it('registers the built-in arrow as an SDF sprite', () => {
    const { fake, map } = makeMap();
    new MapLibreAdapter(map);
    expect(fake.images.get(DEFAULT_ICON_ID)).toEqual({ sdf: true });
  });

  it('creates one source and one symbol layer', () => {
    const { fake, map } = makeMap();
    new MapLibreAdapter(map);
    expect(fake.sources.has('kinesis-vehicles')).toBe(true);
    expect(fake.layers.get('kinesis-vehicles')?.type).toBe('symbol');
  });

  it('honours custom source and layer ids', () => {
    const { fake, map } = makeMap();
    new MapLibreAdapter(map, { sourceId: 'fleet-src', layerId: 'fleet-lyr' });
    expect(fake.sources.has('fleet-src')).toBe(true);
    expect(fake.layers.get('fleet-lyr')?.source).toBe('fleet-src');
  });

  it('passes beforeId through so layers can sit under existing ones', () => {
    const { fake, map } = makeMap();
    new MapLibreAdapter(map, { beforeId: 'labels' });
    expect(fake.layerOrder.at(-1)).toEqual({ id: 'kinesis-vehicles', beforeId: 'labels' });
  });

  it('defers setup until the style loads, then writes what was buffered', async () => {
    const { fake, map } = makeMap();
    fake.styleLoaded = false;
    const adapter = new MapLibreAdapter(map);

    expect(fake.sources.size).toBe(0);
    adapter.addVehicle('v1', point());
    await settle();
    expect(fake.sources.size).toBe(0);

    fake.styleLoaded = true;
    fake.fire('load');

    const source = fake.getSource('kinesis-vehicles');
    expect(source).toBeDefined();
    expect(source?.setData).toHaveBeenCalledTimes(1);
    expect(adapter.getFeature('v1')).toBeDefined();
  });
});

describe('MapLibreAdapter — lifecycle', () => {
  it('adds a feature at the initial position', async () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point({ lng: 29, lat: 41 }));
    await settle();

    expect(adapter.getFeature('v1')?.geometry.coordinates).toEqual([29, 41]);
    expect(fake.getSource('kinesis-vehicles')?.setData).toHaveBeenCalledTimes(1);
  });

  it("uses [lng, lat] order, not Leaflet's [lat, lng]", async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point({ lng: 29, lat: 41 }));
    await settle();
    const [lng, lat] = adapter.getFeature('v1')!.geometry.coordinates;
    expect(lng).toBe(29);
    expect(lat).toBe(41);
  });

  it('moves the existing feature rather than creating another', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point());
    adapter.updatePosition('v1', point({ lng: 30, lat: 42 }));
    await settle();

    expect(adapter.getAllFeatures().size).toBe(1);
    expect(adapter.getFeature('v1')?.geometry.coordinates).toEqual([30, 42]);
  });

  it('ignores a duplicate addVehicle for the same id', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point({ lng: 29 }));
    adapter.addVehicle('v1', point({ lng: 99 }));
    await settle();

    expect(adapter.getAllFeatures().size).toBe(1);
    expect(adapter.getFeature('v1')?.geometry.coordinates[0]).toBe(29);
  });

  it('removes a vehicle', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point());
    adapter.removeVehicle('v1');
    await settle();

    expect(adapter.getFeature('v1')).toBeUndefined();
    expect(adapter.getAllFeatures().size).toBe(0);
  });

  it('is a silent no-op for unknown ids', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    expect(() => adapter.updatePosition('ghost', point())).not.toThrow();
    expect(() => adapter.removeVehicle('ghost')).not.toThrow();
    expect(() => adapter.updateOpacity('ghost', 0.5)).not.toThrow();
  });

  it('getAllFeatures returns a copy, not the internal map', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point());
    const copy = adapter.getAllFeatures();
    copy.delete('v1');
    expect(adapter.getFeature('v1')).toBeDefined();
  });

  it("destroy removes the adapter's own layers and sources", () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map, { trail: { enabled: true } });
    adapter.addVehicle('v1', point());
    adapter.destroy();

    expect(fake.layers.size).toBe(0);
    expect(fake.sources.size).toBe(0);
    expect(adapter.getAllFeatures().size).toBe(0);
  });

  it('destroy detaches the pending style-load listener', () => {
    const { fake, map } = makeMap();
    fake.styleLoaded = false;
    const adapter = new MapLibreAdapter(map);
    expect(fake.handlerCount('load')).toBe(1);
    adapter.destroy();
    expect(fake.handlerCount('load')).toBe(0);
  });
});

describe('MapLibreAdapter — flush coalescing', () => {
  it('writes the source once per tick regardless of fleet size', async () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    const source = fake.getSource('kinesis-vehicles')!;
    source.setData.mockClear();

    for (let i = 0; i < 50; i++) adapter.addVehicle(`v${i}`, point());
    await settle();
    expect(source.setData).toHaveBeenCalledTimes(1);

    source.setData.mockClear();
    for (let i = 0; i < 50; i++) adapter.updatePosition(`v${i}`, point({ lng: 30 }));
    await settle();
    expect(source.setData).toHaveBeenCalledTimes(1);
  });

  it('uploads one FeatureCollection holding every vehicle', async () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    const source = fake.getSource('kinesis-vehicles')!;

    adapter.addVehicle('a', point());
    adapter.addVehicle('b', point());
    await settle();

    const payload = source.setData.mock.calls.at(-1)?.[0] as {
      type: string;
      features: unknown[];
    };
    expect(payload.type).toBe('FeatureCollection');
    expect(payload.features).toHaveLength(2);
  });

  it('does not write when nothing changed', async () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    const source = fake.getSource('kinesis-vehicles')!;
    adapter.addVehicle('v1', point());
    await settle();
    source.setData.mockClear();

    await settle();
    adapter.flush();
    expect(source.setData).not.toHaveBeenCalled();
  });
});

describe('MapLibreAdapter — managedFeatureIds', () => {
  it('ignores vehicles outside the allow-list', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.addVehicle('v1', point());
    adapter.addVehicle('v2', point());
    await settle();

    expect(adapter.getFeature('v1')).toBeDefined();
    expect(adapter.getFeature('v2')).toBeUndefined();
  });

  it('setManagedIds updates the allow-list at runtime', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.addVehicle('v2', point());
    expect(adapter.getFeature('v2')).toBeUndefined();

    adapter.setManagedIds(['v1', 'v2']);
    adapter.addVehicle('v2', point());
    await settle();
    expect(adapter.getFeature('v2')).toBeDefined();
  });

  it('a null allow-list manages everything again', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.setManagedIds(null);
    adapter.addVehicle('v9', point());
    expect(adapter.getFeature('v9')).toBeDefined();
  });
});

describe('MapLibreAdapter — opacity and state', () => {
  it('updateOpacity writes the feature property the layer reads', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point());
    adapter.updateOpacity('v1', 0.25);
    await settle();
    expect(adapter.getFeature('v1')?.properties.opacity).toBe(0.25);
  });

  it('dims to warningOpacity on warning and restores on active', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map, { warningOpacity: 0.4 });
    adapter.addVehicle('v1', point());

    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')?.properties.opacity).toBe(0.4);
    adapter.setVehicleState('v1', 'active');
    expect(adapter.getFeature('v1')?.properties.opacity).toBe(1);
  });

  it('leaves opacity untouched on state changes when warningOpacity is unset', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point());
    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')?.properties.opacity).toBe(1);
  });
});

describe('MapLibreAdapter — styling', () => {
  it('rotates the built-in arrow to the heading on every update', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point({ heading: 90 }));
    expect(adapter.getFeature('v1')?.properties.rotation).toBe(90);

    adapter.updatePosition('v1', point({ heading: 180 }));
    expect(adapter.getFeature('v1')?.properties.rotation).toBe(180);
    expect(adapter.getFeature('v1')?.properties.icon).toBe(DEFAULT_ICON_ID);
  });

  it('re-evaluates a dynamic style factory on each update', () => {
    const { map } = makeMap();
    const style = createVehicleStyle({
      speedColorBands: [
        { max: 30, color: '#22c55e' },
        { max: 200, color: '#ef4444' },
      ],
    });
    const adapter = new MapLibreAdapter(map, { style });

    adapter.addVehicle('v1', point({ speed: 10 }));
    expect(adapter.getFeature('v1')?.properties.color).toBe('#22c55e');

    adapter.updatePosition('v1', point({ speed: 120 }));
    expect(adapter.getFeature('v1')?.properties.color).toBe('#ef4444');
  });

  it('applies a static style once and does not re-evaluate it', () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map, {
      style: { color: '#123456', rotation: 10, size: 1 },
    });
    adapter.addVehicle('v1', point({ heading: 90 }));
    adapter.updatePosition('v1', point({ heading: 270 }));

    expect(adapter.getFeature('v1')?.properties.color).toBe('#123456');
    expect(adapter.getFeature('v1')?.properties.rotation).toBe(10);
  });
});

describe('MapLibreAdapter — trail', () => {
  it('accumulates a bounded buffer reflected in the memory estimate', async () => {
    const { map } = makeMap();
    const adapter = new MapLibreAdapter(map, {
      trail: { enabled: true, maxPoints: 5, intervalMs: 0 },
    });
    adapter.addVehicle('v1', point());
    for (let i = 0; i < 20; i++) {
      adapter.updatePosition('v1', point({ lng: 29 + i * 0.001 }));
    }
    await settle();

    const before = adapter.getMemoryEstimate();
    expect(before).toBeGreaterThan(0);
    adapter.removeVehicle('v1');
    expect(adapter.getMemoryEstimate()).toBe(0);
  });

  it('adds the trail layer beneath the vehicle layer', () => {
    const { fake, map } = makeMap();
    new MapLibreAdapter(map, { trail: { enabled: true } });
    const ids = fake.layerOrder.map((l) => l.id);
    expect(ids).toEqual(['kinesis-trails', 'kinesis-vehicles']);
  });

  it('writes the trail source on the same coalesced flush', async () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map, { trail: { enabled: true, intervalMs: 0 } });
    const trailSource = fake.getSource('kinesis-trails')!;
    trailSource.setData.mockClear();

    adapter.addVehicle('v1', point());
    adapter.updatePosition('v1', point({ lng: 30 }));
    await settle();
    expect(trailSource.setData).toHaveBeenCalledTimes(1);
  });

  it('keeps no trail state when trails are disabled', async () => {
    const { fake, map } = makeMap();
    const adapter = new MapLibreAdapter(map);
    adapter.addVehicle('v1', point());
    await settle();
    expect(fake.sources.has('kinesis-trails')).toBe(false);
    expect(adapter.getMemoryEstimate()).toBe(192);
  });
});
