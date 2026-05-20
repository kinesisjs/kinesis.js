import { beforeEach, describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import type LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Circle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Style from 'ol/style/Style';
import { OpenLayersAdapter } from './openlayers-adapter';
import { createVehicleStyle } from './style-builder';
import type OLMap from 'ol/Map';
import type { TrailPoint } from '@kinesisjs/core';

/**
 * Minimal Map mock — adapter sadece `addLayer` ve `removeLayer` çağırır.
 * jsdom + tam Map kurulumu (canvas, ResizeObserver, vb.) yerine pragmatik fake.
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

const makeMap = (): OLMap => new FakeMap() as unknown as OLMap;

const pt = (lng: number, lat: number, extra: Partial<TrailPoint> = {}): TrailPoint => ({
  lng,
  lat,
  ts: 0,
  receivedAt: 0,
  ...extra,
});

describe('OpenLayersAdapter — lifecycle', () => {
  let map: OLMap;
  let adapter: OpenLayersAdapter;

  beforeEach(() => {
    map = makeMap();
    adapter = new OpenLayersAdapter(map);
  });

  it('addVehicle creates a feature with id and adds it to source', () => {
    adapter.addVehicle('v1', pt(29, 41));
    const feature = adapter.getFeature('v1');
    expect(feature).toBeInstanceOf(Feature);
    expect(feature?.getId()).toBe('v1');
    expect(feature?.get('opacity')).toBe(1);
  });

  it('updatePosition changes feature geometry coordinates', () => {
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updatePosition('v1', pt(30, 42));
    const geom = adapter.getFeature('v1')?.getGeometry();
    const coords = geom?.getCoordinates();
    // EPSG:3857 projection — lng=30 → ~3.34M, lat=42 → ~5.16M
    expect(coords).toBeDefined();
    expect(coords![0]).toBeGreaterThan(3_000_000);
    expect(coords![1]).toBeGreaterThan(5_000_000);
  });

  it('updatePosition is a no-op for unknown vehicle', () => {
    expect(() => adapter.updatePosition('unknown', pt(0, 0))).not.toThrow();
  });

  it('removeVehicle removes feature from source and internal map', () => {
    adapter.addVehicle('v1', pt(29, 41));
    adapter.removeVehicle('v1');
    expect(adapter.getFeature('v1')).toBeUndefined();
  });

  it('destroy removes the owned layer from the map and clears features', () => {
    const fake = map as unknown as FakeMap;
    adapter.addVehicle('v1', pt(29, 41));
    expect(fake.layers).toHaveLength(1);
    adapter.destroy();
    expect(fake.layers).toHaveLength(0);
    expect(adapter.getAllFeatures().size).toBe(0);
  });

  it('writes heading, speed, and meta as feature properties on add', () => {
    adapter.addVehicle('v1', pt(29, 41, { heading: 90, speed: 50, meta: { plate: '34X' } }));
    const f = adapter.getFeature('v1');
    expect(f?.get('heading')).toBe(90);
    expect(f?.get('speed')).toBe(50);
    expect(f?.get('meta')).toEqual({ plate: '34X' });
  });
});

describe('OpenLayersAdapter — managedFeatureIds', () => {
  it('addVehicle is a no-op for ids not in managed set', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.addVehicle('v2', pt(0, 0));
    expect(adapter.getFeature('v2')).toBeUndefined();
    adapter.addVehicle('v1', pt(0, 0));
    expect(adapter.getFeature('v1')).toBeDefined();
  });

  it('destroy on existingLayer only removes managed features', () => {
    const map = makeMap();
    const sharedSource = new VectorSource();
    const sharedLayer = new VectorLayer({ source: sharedSource });

    // Unmanaged feature (e.g. geofence polygon) added by user code
    const geofence = new Feature<Point>({ geometry: new Point([0, 0]) });
    geofence.setId('geofence-1');
    sharedSource.addFeature(geofence);

    const adapter = new OpenLayersAdapter(map, {
      existingLayer: sharedLayer,
      managedFeatureIds: ['v1'],
    });
    adapter.addVehicle('v1', pt(29, 41));
    expect(sharedSource.getFeatures()).toHaveLength(2);

    adapter.destroy();

    const remaining = sharedSource.getFeatures();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.getId()).toBe('geofence-1');
  });

  it('setManagedIds updates the managed set at runtime', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { managedFeatureIds: [] });
    adapter.addVehicle('v1', pt(0, 0));
    expect(adapter.getFeature('v1')).toBeUndefined(); // not in managed set

    adapter.setManagedIds(['v1']);
    adapter.addVehicle('v1', pt(0, 0));
    expect(adapter.getFeature('v1')).toBeDefined();
  });

  it('setManagedIds(null) re-enables manage-all mode', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { managedFeatureIds: ['v1'] });
    adapter.setManagedIds(null);
    adapter.addVehicle('v2', pt(0, 0));
    expect(adapter.getFeature('v2')).toBeDefined();
  });
});

describe('OpenLayersAdapter — updateOpacity', () => {
  it('sets feature opacity property', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map);
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updateOpacity('v1', 0.4);
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(0.4);
  });

  it('propagates opacity to style image when present', () => {
    const map = makeMap();
    const styleFn = createVehicleStyle();
    const adapter = new OpenLayersAdapter(map, { style: styleFn });
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updateOpacity('v1', 0.5);

    const style = adapter.getFeature('v1')?.getStyle() as Style;
    const img = style.getImage() as Circle;
    expect(img.getOpacity()).toBe(0.5);
  });

  it('is a no-op for unknown vehicle', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map);
    expect(() => adapter.updateOpacity('unknown', 0.5)).not.toThrow();
  });
});

describe('OpenLayersAdapter — style application', () => {
  it('applies a static Style to all features', () => {
    const map = makeMap();
    const staticStyle = new Style({
      image: new Circle({ radius: 10, fill: new Fill({ color: '#000' }) }),
    });
    const adapter = new OpenLayersAdapter(map, { style: staticStyle });
    adapter.addVehicle('v1', pt(29, 41));
    expect(adapter.getFeature('v1')?.getStyle()).toBe(staticStyle);
  });

  it('regenerates a dynamic style on each updatePosition', () => {
    const map = makeMap();
    let callCount = 0;
    const styleFn = (vehicle: TrailPoint): Style => {
      callCount++;
      return new Style({
        image: new Circle({
          radius: 6,
          fill: new Fill({ color: (vehicle.speed ?? 0) > 50 ? '#f00' : '#0f0' }),
        }),
      });
    };
    const adapter = new OpenLayersAdapter(map, { style: styleFn });
    adapter.addVehicle('v1', pt(0, 0, { speed: 10 }));
    expect(callCount).toBe(1);
    adapter.updatePosition('v1', pt(0, 0, { speed: 80 }));
    expect(callCount).toBe(2);
  });

  it('preserves current opacity when dynamic style is regenerated', () => {
    const map = makeMap();
    const styleFn = createVehicleStyle();
    const adapter = new OpenLayersAdapter(map, { style: styleFn });
    adapter.addVehicle('v1', pt(0, 0));
    adapter.updateOpacity('v1', 0.3);
    adapter.updatePosition('v1', pt(1, 1, { speed: 50 }));

    const style = adapter.getFeature('v1')?.getStyle() as Style;
    expect(style.getImage()?.getOpacity()).toBe(0.3);
  });
});

describe('OpenLayersAdapter — getMemoryEstimate', () => {
  it('returns 256 bytes per managed feature', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map);
    expect(adapter.getMemoryEstimate()).toBe(0);
    adapter.addVehicle('v1', pt(0, 0));
    adapter.addVehicle('v2', pt(0, 0));
    expect(adapter.getMemoryEstimate()).toBe(512);
  });
});

describe('OpenLayersAdapter — trail rendering', () => {
  // Helper: extract a layer by `name` property from the fake map's layer list.
  const trailLayerOf = (m: OLMap): VectorLayer<VectorSource> | undefined => {
    const layers = (m as unknown as FakeMap).layers;
    return layers.find((l) => l.get('name') === 'kinesis-trails');
  };
  const trailFeatureOf = (m: OLMap, vehicleId: string): Feature | undefined => {
    return trailLayerOf(m)?.getSource()?.getFeatureById(`trail:${vehicleId}`) ?? undefined;
  };

  it('does not create a trail layer when trail.enabled is false (backward compat)', () => {
    const map = makeMap();
    new OpenLayersAdapter(map);
    expect(trailLayerOf(map)).toBeUndefined();
    new OpenLayersAdapter(map, { trail: { enabled: false } });
    expect(trailLayerOf(map)).toBeUndefined();
  });

  it('creates a separate trail layer when trail.enabled is true', () => {
    const map = makeMap();
    new OpenLayersAdapter(map, { trail: { enabled: true } });
    const layer = trailLayerOf(map);
    expect(layer).toBeDefined();
    // Default zIndex is undefined — natural OL ordering handles trail-vs-vehicle.
    expect(layer?.getZIndex()).toBeUndefined();
  });

  it('adds the trail layer BEFORE the vehicle layer (trail renders below)', () => {
    const map = makeMap();
    new OpenLayersAdapter(map, { trail: { enabled: true } });
    const layers = (map as unknown as FakeMap).layers;
    const trailIdx = layers.findIndex((l) => l.get('name') === 'kinesis-trails');
    const vehicleIdx = layers.findIndex((l) => l.get('name') === 'kinesis-vehicles');
    expect(trailIdx).toBeGreaterThanOrEqual(0);
    expect(vehicleIdx).toBeGreaterThan(trailIdx);
  });

  it('honors explicit trail.zIndex when provided (existingLayer override)', () => {
    const map = makeMap();
    new OpenLayersAdapter(map, { trail: { enabled: true, zIndex: 5 } });
    expect(trailLayerOf(map)?.getZIndex()).toBe(5);
  });

  it('addVehicle seeds the trail with a single coordinate', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true, intervalMs: 0 } });
    adapter.addVehicle('v1', pt(29, 41));
    const trail = trailFeatureOf(map, 'v1');
    const geom = trail?.getGeometry() as LineString | undefined;
    expect(geom?.getCoordinates()?.length).toBe(1);
  });

  it('updatePosition appends to the trail (intervalMs: 0 disables throttling)', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true, intervalMs: 0 } });
    adapter.addVehicle('v1', pt(29, 41));
    adapter.updatePosition('v1', pt(29.001, 41));
    adapter.updatePosition('v1', pt(29.002, 41));
    const geom = trailFeatureOf(map, 'v1')?.getGeometry() as LineString | undefined;
    expect(geom?.getCoordinates()?.length).toBe(3);
  });

  it('caps the trail at maxPoints (ring buffer)', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, {
      trail: { enabled: true, intervalMs: 0, maxPoints: 4 },
    });
    adapter.addVehicle('v1', pt(0, 0));
    for (let i = 1; i <= 10; i++) {
      adapter.updatePosition('v1', pt(i * 0.001, 0));
    }
    const geom = trailFeatureOf(map, 'v1')?.getGeometry() as LineString | undefined;
    expect(geom?.getCoordinates()?.length).toBe(4);
  });

  it('removeVehicle removes the trail feature too', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true, intervalMs: 0 } });
    adapter.addVehicle('v1', pt(0, 0));
    expect(trailFeatureOf(map, 'v1')).toBeDefined();
    adapter.removeVehicle('v1');
    expect(trailFeatureOf(map, 'v1')).toBeUndefined();
  });

  it('destroy removes the trail layer from the map', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true } });
    expect(trailLayerOf(map)).toBeDefined();
    adapter.destroy();
    expect(trailLayerOf(map)).toBeUndefined();
  });

  it('resolves trail color from TrailPoint.meta.color when no explicit color given', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true, intervalMs: 0 } });
    adapter.addVehicle('v1', pt(0, 0, { meta: { color: '#dc2626' } }));
    const trail = trailFeatureOf(map, 'v1');
    const style = trail?.getStyle() as Style | undefined;
    const stroke = style?.getStroke?.();
    expect(stroke?.getColor()).toBe('rgba(220, 38, 38, 0.5)');
  });

  it('explicit trail.color overrides meta.color', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, {
      trail: { enabled: true, intervalMs: 0, color: '#22c55e', opacity: 0.7 },
    });
    adapter.addVehicle('v1', pt(0, 0, { meta: { color: '#dc2626' } }));
    const trail = trailFeatureOf(map, 'v1');
    const style = trail?.getStyle() as Style | undefined;
    expect(style?.getStroke?.()?.getColor()).toBe('rgba(34, 197, 94, 0.7)');
  });

  it('throttles trail samples by intervalMs (default 100 ms)', async () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true /* default 100ms */ } });
    adapter.addVehicle('v1', pt(0, 0));
    // Three rapid-fire updates within 10ms — only the very first one might land
    // depending on timing; throttling should drop the second and third.
    adapter.updatePosition('v1', pt(0.001, 0));
    adapter.updatePosition('v1', pt(0.002, 0));
    adapter.updatePosition('v1', pt(0.003, 0));
    const geom = trailFeatureOf(map, 'v1')?.getGeometry() as LineString | undefined;
    // Initial seed = 1 point. With aggressive throttling, at most 1 additional
    // (and likely 0) lands. We assert <= 2 to allow for timing wiggle.
    expect(geom?.getCoordinates()?.length).toBeLessThanOrEqual(2);
  });

  it('getMemoryEstimate accounts for trail points', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { trail: { enabled: true, intervalMs: 0 } });
    adapter.addVehicle('v1', pt(0, 0)); // 256 (vehicle) + 64 + 1*16 (trail) = 336
    expect(adapter.getMemoryEstimate()).toBe(336);
    adapter.updatePosition('v1', pt(0.001, 0)); // trail now 2 points → +16
    expect(adapter.getMemoryEstimate()).toBe(352);
  });
});

describe('OpenLayersAdapter — setVehicleState (gap visualization)', () => {
  it("always sets 'vehicleState' feature property regardless of opacity config", () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map);
    adapter.addVehicle('v1', pt(0, 0));
    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')?.get('vehicleState')).toBe('warning');
    adapter.setVehicleState('v1', 'active');
    expect(adapter.getFeature('v1')?.get('vehicleState')).toBe('active');
  });

  it('without warningOpacity, setVehicleState does NOT change opacity', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map);
    adapter.addVehicle('v1', pt(0, 0));
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(1);
    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(1);
  });

  it('with warningOpacity, warning dims marker and active restores it', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { warningOpacity: 0.5 });
    adapter.addVehicle('v1', pt(0, 0));
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(1);

    adapter.setVehicleState('v1', 'warning');
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(0.5);

    adapter.setVehicleState('v1', 'active');
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(1);
  });

  it('does not touch opacity for stale / completed (those are followed by removeVehicle)', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map, { warningOpacity: 0.5 });
    adapter.addVehicle('v1', pt(0, 0));
    adapter.setVehicleState('v1', 'stale');
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(1);
    adapter.setVehicleState('v1', 'completed');
    expect(adapter.getFeature('v1')?.get('opacity')).toBe(1);
  });

  it('is a no-op for unknown vehicle ids', () => {
    const map = makeMap();
    const adapter = new OpenLayersAdapter(map);
    expect(() => adapter.setVehicleState('ghost', 'warning')).not.toThrow();
  });
});
