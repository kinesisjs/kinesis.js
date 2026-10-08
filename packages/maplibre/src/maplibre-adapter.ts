import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TrackAdapter, TrailPoint, VehicleState } from '@kinesisjs/core';
import {
  ARROW_SPRITE_SIZE,
  DEFAULT_ICON_ID,
  createArrowImage,
  createVehicleStyle,
} from './style-builder';
import type {
  MapLibreAdapterOptions,
  TrailRenderOptions,
  VehicleStyle,
  VehicleStyleProvider,
} from './types';

const DEFAULT_SOURCE_ID = 'kinesis-vehicles';
const DEFAULT_TRAIL_SOURCE_ID = 'kinesis-trails';

interface VehicleProperties {
  id: string;
  color: string;
  rotation: number;
  size: number;
  opacity: number;
  icon: string;
}

interface VehicleFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: VehicleProperties;
}

interface TrailFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: { id: string; color: string };
}

interface FeatureCollection<T> {
  type: 'FeatureCollection';
  features: T[];
}

interface ResolvedTrailOptions {
  maxPoints: number;
  intervalMs: number;
  width: number;
  opacity: number;
  color?: string;
  defaultColor: string;
  sourceId: string;
  layerId: string;
}

interface TrailEntry {
  feature: TrailFeature;
  lastSampledAt: number;
}

/** Minimal shape of the GeoJSON source methods the adapter calls. */
interface GeoJsonSourceLike {
  setData(data: unknown): void;
}

/**
 * MapLibre GL implementation of the Kinesis.js Core `TrackAdapter` interface.
 *
 * Responsibilities:
 *   - Per-vehicle GeoJSON `Point` feature lifecycle (create / update / remove).
 *   - A single symbol layer driven by data expressions: colour, heading
 *     rotation and opacity all come from feature properties.
 *   - Optional trail rendering (one `LineString` per vehicle on a line layer
 *     inserted beneath the vehicles).
 *   - Respect for `managedFeatureIds`.
 *
 * Why this differs from the Leaflet and OpenLayers adapters: those hand the map
 * library one object per vehicle. MapLibre draws the whole fleet from one
 * source in one GPU pass, so the adapter keeps plain GeoJSON features in a
 * fixed array, mutates them in place, and pushes the result with a single
 * `setData`. 1000 vehicles cost one upload per tick and zero DOM nodes.
 *
 * Because `TrackAdapter` has no end-of-tick hook, that upload is coalesced with
 * `queueMicrotask`: the Tracker's tick is synchronous, so every `addVehicle` /
 * `updatePosition` in one tick lands before the microtask runs, and the source
 * is written exactly once regardless of fleet size.
 *
 * Coordinate note: MapLibre is **`[lng, lat]`**, the same order core uses, so
 * no swap is needed (unlike Leaflet's `[lat, lng]`).
 *
 * Not its responsibility: interpolation, data source, user interaction.
 */
export class MapLibreAdapter implements TrackAdapter {
  private readonly features = new Map<string, VehicleFeature>();
  private readonly collection: FeatureCollection<VehicleFeature> = {
    type: 'FeatureCollection',
    features: [],
  };

  private readonly trail: {
    opts: ResolvedTrailOptions;
    entries: Map<string, TrailEntry>;
    collection: FeatureCollection<TrailFeature>;
  } | null;

  private managedIds: Set<string> | null = null;

  private readonly staticStyle: VehicleStyle | null;
  private readonly styleFn: ((vehicle: TrailPoint, vehicleId: string) => VehicleStyle) | null;
  private readonly defaultFactory = createVehicleStyle();

  private readonly sourceId: string;
  private readonly layerId: string;
  private readonly beforeId: string | undefined;

  private ready = false;
  private destroyed = false;
  private dirty = false;
  private flushScheduled = false;
  private readonly onStyleLoad = (): void => this.setup();

  constructor(
    private readonly map: MapLibreMap,
    private readonly options: MapLibreAdapterOptions = {},
  ) {
    const style: VehicleStyleProvider | undefined = options.style;
    if (typeof style === 'function') {
      this.styleFn = style;
      this.staticStyle = null;
    } else if (style) {
      this.staticStyle = style;
      this.styleFn = null;
    } else {
      this.staticStyle = null;
      this.styleFn = null;
    }

    if (options.managedFeatureIds) {
      this.managedIds = new Set(options.managedFeatureIds);
    }

    this.sourceId = options.sourceId ?? DEFAULT_SOURCE_ID;
    this.layerId = options.layerId ?? DEFAULT_SOURCE_ID;
    this.beforeId = options.beforeId;

    if (options.trail?.enabled) {
      this.trail = {
        opts: resolveTrailOptions(options.trail),
        entries: new Map(),
        collection: { type: 'FeatureCollection', features: [] },
      };
    } else {
      this.trail = null;
    }

    // Sources and layers cannot be added before the style exists. When it is
    // already there we wire up immediately; otherwise ingest keeps filling the
    // in-memory collection and the first flush happens on load.
    if (this.styleReady()) this.setup();
    else this.map.once('load', this.onStyleLoad);
  }

  // ─── TrackAdapter contract ────────────────────────────────────────────

  addVehicle(id: string, initialPoint: TrailPoint): void {
    if (this.managedIds && !this.managedIds.has(id)) return;
    if (this.features.has(id)) return;

    const style = this.resolveStyle(initialPoint, id);
    const feature: VehicleFeature = {
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [initialPoint.lng, initialPoint.lat] },
      properties: {
        id,
        color: style.color,
        rotation: style.rotation,
        size: style.size,
        opacity: 1,
        icon: style.icon ?? DEFAULT_ICON_ID,
      },
    };

    this.features.set(id, feature);
    this.collection.features.push(feature);

    if (this.trail) this.initTrail(id, initialPoint);
    this.scheduleFlush();
  }

  updatePosition(id: string, point: TrailPoint): void {
    const feature = this.features.get(id);
    if (!feature) return;

    // Mutated in place: the array and the Map hold the same object, so nothing
    // is allocated per vehicle per tick.
    feature.geometry.coordinates[0] = point.lng;
    feature.geometry.coordinates[1] = point.lat;

    if (this.styleFn) {
      const style = this.styleFn(point, id);
      feature.properties.color = style.color;
      feature.properties.rotation = style.rotation;
      feature.properties.size = style.size;
      feature.properties.icon = style.icon ?? DEFAULT_ICON_ID;
    } else if (!this.staticStyle) {
      // Built-in arrow: heading is the only thing that moves.
      feature.properties.rotation = this.defaultFactory(point).rotation;
    }
    // staticStyle: applied once at add, never re-evaluated — mirrors a static
    // OpenLayers Style and the Leaflet adapter's static icon.

    if (this.trail) this.appendToTrail(id, point);
    this.scheduleFlush();
  }

  removeVehicle(id: string): void {
    const feature = this.features.get(id);
    if (feature) {
      this.features.delete(id);
      const i = this.collection.features.indexOf(feature);
      if (i !== -1) this.collection.features.splice(i, 1);
    }
    if (this.trail) {
      const entry = this.trail.entries.get(id);
      if (entry) {
        this.trail.entries.delete(id);
        const i = this.trail.collection.features.indexOf(entry.feature);
        if (i !== -1) this.trail.collection.features.splice(i, 1);
      }
    }
    if (feature) this.scheduleFlush();
  }

  destroy(): void {
    this.destroyed = true;
    this.map.off('load', this.onStyleLoad);

    if (this.managedIds) {
      for (const id of this.managedIds) this.removeVehicle(id);
    } else {
      this.features.clear();
      this.collection.features.length = 0;
      if (this.trail) {
        this.trail.entries.clear();
        this.trail.collection.features.length = 0;
      }
    }

    // The adapter always owns the sources and layers it created, so teardown
    // removes them outright rather than just emptying them.
    this.removeLayerIfPresent(this.layerId);
    if (this.trail) this.removeLayerIfPresent(this.trail.opts.layerId);
    this.removeSourceIfPresent(this.sourceId);
    if (this.trail) this.removeSourceIfPresent(this.trail.opts.sourceId);

    this.ready = false;
  }

  /** Optional TrackAdapter method — used by the Tracker's fade behavior. */
  updateOpacity(id: string, opacity: number): void {
    const feature = this.features.get(id);
    if (!feature) return;
    feature.properties.opacity = opacity;
    this.scheduleFlush();
  }

  /**
   * Optional TrackAdapter method — invoked when a vehicle's lifecycle state
   * changes. When `warningOpacity` is configured, the symbol dims on entering
   * `warning` and restores to 1 on recovery to `active`. `stale` / `completed`
   * are no-ops (both are immediately followed by `removeVehicle`).
   */
  setVehicleState(id: string, state: VehicleState): void {
    const dim = this.options.warningOpacity;
    if (dim === undefined) return;
    if (state === 'warning') this.updateOpacity(id, dim);
    else if (state === 'active') this.updateOpacity(id, 1);
  }

  /**
   * Optional TrackAdapter method — per-adapter byte estimate surfaced in
   * `Tracker.getStats().memoryBreakdown`. ~192 B per feature (geometry +
   * properties), ~64 B + 16 B per trail coordinate.
   */
  getMemoryEstimate(): number {
    let bytes = this.features.size * 192;
    if (this.trail) {
      for (const entry of this.trail.entries.values()) {
        bytes += 64 + entry.feature.geometry.coordinates.length * 16;
      }
    }
    return bytes;
  }

  // ─── Public utilities ─────────────────────────────────────────────────

  /** Look up a vehicle's GeoJSON feature — handy for click handlers and popups. */
  getFeature(vehicleId: string): VehicleFeature | undefined {
    return this.features.get(vehicleId);
  }

  /** Shallow copy of every managed feature. */
  getAllFeatures(): Map<string, VehicleFeature> {
    return new Map(this.features);
  }

  /** Update the managed-id allow-list at runtime. */
  setManagedIds(ids: Set<string> | string[] | null): void {
    this.managedIds = ids === null ? null : new Set(ids);
  }

  /**
   * Push pending changes to the map immediately instead of waiting for the
   * coalescing microtask. Only needed when asserting rendered state
   * synchronously — the tick path never has to call it.
   */
  flush(): void {
    if (!this.ready || this.destroyed || !this.dirty) return;
    this.dirty = false;
    this.setSourceData(this.sourceId, this.collection);
    if (this.trail) this.setSourceData(this.trail.opts.sourceId, this.trail.collection);
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private styleReady(): boolean {
    // Guarded rather than called outright: a minimal test double need not
    // implement the whole Map surface. MapLibre returns `undefined` from
    // isStyleLoaded() when no style is set yet, which counts as "not ready".
    if (typeof this.map.isStyleLoaded !== 'function') return true;
    return this.map.isStyleLoaded() === true;
  }

  private setup(): void {
    if (this.destroyed || this.ready) return;

    if (typeof this.map.hasImage === 'function' && !this.map.hasImage(DEFAULT_ICON_ID)) {
      // `sdf: true` is what lets one sprite serve every vehicle colour through
      // the data-driven `icon-color`.
      this.map.addImage(DEFAULT_ICON_ID, createArrowImage(ARROW_SPRITE_SIZE), { sdf: true });
    }

    if (!this.map.getSource(this.sourceId)) {
      this.map.addSource(this.sourceId, { type: 'geojson', data: this.collection as never });
    }

    if (this.trail && !this.map.getSource(this.trail.opts.sourceId)) {
      const t = this.trail;
      this.map.addSource(t.opts.sourceId, { type: 'geojson', data: t.collection as never });
      if (!this.map.getLayer(t.opts.layerId)) {
        this.map.addLayer(
          {
            id: t.opts.layerId,
            type: 'line',
            source: t.opts.sourceId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': t.opts.width,
              'line-opacity': t.opts.opacity,
            },
          } as never,
          this.beforeId,
        );
      }
    }

    if (!this.map.getLayer(this.layerId)) {
      this.map.addLayer(
        {
          id: this.layerId,
          type: 'symbol',
          source: this.sourceId,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-rotate': ['get', 'rotation'],
            'icon-size': ['get', 'size'],
            // Vehicles are dense and must never be dropped by collision
            // detection — a hidden vehicle reads as a tracking failure.
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            // Rotate with the map so a heading stays geographically true.
            'icon-rotation-alignment': 'map',
          },
          paint: {
            'icon-color': ['get', 'color'],
            'icon-opacity': ['get', 'opacity'],
          },
        } as never,
        this.beforeId,
      );
    }

    this.ready = true;

    // `addSource` was handed the live collection, so a fresh adapter needs no
    // upload at all. Only flush when ingest ran ahead of the style load and
    // there is already something buffered — otherwise every adapter would open
    // with a pointless write of an empty FeatureCollection.
    const buffered =
      this.collection.features.length > 0 ||
      (this.trail !== null && this.trail.collection.features.length > 0);
    this.dirty = buffered;
    if (buffered) this.flush();
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushScheduled || this.destroyed) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  private setSourceData(sourceId: string, data: unknown): void {
    const source = this.map.getSource(sourceId) as GeoJsonSourceLike | undefined;
    if (source && typeof source.setData === 'function') source.setData(data);
  }

  private removeLayerIfPresent(id: string): void {
    if (typeof this.map.getLayer === 'function' && this.map.getLayer(id)) {
      this.map.removeLayer(id);
    }
  }

  private removeSourceIfPresent(id: string): void {
    if (typeof this.map.getSource === 'function' && this.map.getSource(id)) {
      this.map.removeSource(id);
    }
  }

  private resolveStyle(point: TrailPoint, id: string): VehicleStyle {
    if (this.staticStyle) return this.staticStyle;
    if (this.styleFn) return this.styleFn(point, id);
    return this.defaultFactory(point);
  }

  private initTrail(id: string, point: TrailPoint): void {
    if (!this.trail) return;
    const feature: TrailFeature = {
      type: 'Feature',
      id: `trail:${id}`,
      geometry: { type: 'LineString', coordinates: [[point.lng, point.lat]] },
      properties: { id, color: trailColor(point, this.trail.opts) },
    };
    this.trail.entries.set(id, { feature, lastSampledAt: 0 });
    this.trail.collection.features.push(feature);
  }

  private appendToTrail(id: string, point: TrailPoint): void {
    if (!this.trail) return;
    const opts = this.trail.opts;
    const entry = this.trail.entries.get(id);
    if (!entry) {
      this.initTrail(id, point);
      return;
    }
    if (opts.intervalMs > 0) {
      const now = Date.now();
      if (now - entry.lastSampledAt < opts.intervalMs) return;
      entry.lastSampledAt = now;
    }
    const coords = entry.feature.geometry.coordinates;
    coords.push([point.lng, point.lat]);
    if (coords.length > opts.maxPoints) {
      coords.splice(0, coords.length - opts.maxPoints);
    }
    entry.feature.properties.color = trailColor(point, opts);
  }
}

function resolveTrailOptions(opts: TrailRenderOptions): ResolvedTrailOptions {
  return {
    maxPoints: opts.maxPoints ?? 60,
    intervalMs: opts.intervalMs ?? 100,
    width: opts.width ?? 3,
    opacity: opts.opacity ?? 0.5,
    color: opts.color,
    defaultColor: opts.defaultColor ?? '#3b82f6',
    sourceId: opts.sourceId ?? DEFAULT_TRAIL_SOURCE_ID,
    layerId: opts.layerId ?? DEFAULT_TRAIL_SOURCE_ID,
  };
}

function trailColor(point: TrailPoint, opts: ResolvedTrailOptions): string {
  const fromMeta =
    typeof point.meta?.['color'] === 'string' ? (point.meta['color'] as string) : undefined;
  return opts.color ?? fromMeta ?? opts.defaultColor;
}
