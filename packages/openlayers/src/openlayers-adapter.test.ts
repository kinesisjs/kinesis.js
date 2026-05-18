import { beforeEach, describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
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
