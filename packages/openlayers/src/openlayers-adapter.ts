import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import type OLMap from 'ol/Map';
import type { Coordinate } from 'ol/coordinate';
import type { TrackAdapter, TrailPoint, VehicleState } from '@kinesisjs/core';
import type { OpenLayersAdapterOptions, TrailRenderOptions } from './types';

interface ResolvedTrailOptions {
  maxPoints: number;
  intervalMs: number;
  width: number;
  opacity: number;
  color?: string;
  defaultColor: string;
  zIndex?: number;
}

interface TrailEntry {
  feature: Feature<LineString>;
  coords: Coordinate[];
  lastSampledAt: number;
}

/**
 * OpenLayers implementation of the Kinesis.js Core `TrackAdapter` interface.
 *
 * Responsibilities:
 *   - Per-vehicle `Feature<Point>` lifecycle (create / update / remove).
 *   - Static or dynamic style application (re-evaluated on each `updatePosition`).
 *   - Optional opacity updates (used by the Tracker's fade behavior).
 *   - Optional trail rendering (recent-positions polyline on a separate VectorLayer).
 *   - Respect for `managedFeatureIds` — leaves unrelated features on a shared
 *     existing layer untouched.
 *   - Memory estimate (`getMemoryEstimate`) surfaced through `Tracker.getStats`.
 *
 * Not its responsibility: interpolation, data source, user interaction.
 */
export class OpenLayersAdapter implements TrackAdapter {
  private readonly source: VectorSource;
  private readonly layer: VectorLayer<VectorSource>;
  private readonly features = new Map<string, Feature<Point>>();
  private readonly projection: string;
  private readonly ownedLayer: boolean;
  private managedIds: Set<string> | null = null;

  private readonly trail: {
    opts: ResolvedTrailOptions;
    source: VectorSource;
    layer: VectorLayer<VectorSource>;
    entries: Map<string, TrailEntry>;
  } | null;

  constructor(
    private readonly map: OLMap,
    private readonly options: OpenLayersAdapterOptions = {},
  ) {
    this.projection = options.projection ?? 'EPSG:3857';

    if (options.managedFeatureIds) {
      this.managedIds = new Set(options.managedFeatureIds);
    }

    // Trail layer is added FIRST (before the vehicle layer below) so OpenLayers'
    // natural render order — later-added layers paint on top of earlier ones —
    // places trails under their vehicles without any zIndex juggling. Users in
    // existingLayer mode (where their own vehicle layer is already in the map)
    // can still override `zIndex` to place the trail at a specific position.
    if (options.trail?.enabled) {
      const opts = resolveTrailOptions(options.trail);
      const source = new VectorSource();
      const layer = new VectorLayer({
        source,
        properties: { name: 'kinesis-trails' },
        ...(opts.zIndex !== undefined ? { zIndex: opts.zIndex } : {}),
      });
      this.map.addLayer(layer);
      this.trail = { opts, source, layer, entries: new Map() };
    } else {
      this.trail = null;
    }

    if (options.existingLayer) {
      this.layer = options.existingLayer;
      const existingSource = options.existingLayer.getSource();
      if (!existingSource) {
        throw new Error('OpenLayersAdapter: existingLayer must have a source');
      }
      this.source = existingSource;
      this.ownedLayer = false;
    } else {
      this.source = new VectorSource();
      this.layer = new VectorLayer({
        source: this.source,
        properties: { name: options.layerName ?? 'kinesis-vehicles' },
      });
      this.map.addLayer(this.layer);
      this.ownedLayer = true;
    }
  }

  // ─── TrackAdapter contract ────────────────────────────────────────────

  addVehicle(id: string, initialPoint: TrailPoint): void {
    if (this.managedIds && !this.managedIds.has(id)) return;

    const feature = new Feature<Point>({
      geometry: new Point(this.project(initialPoint)),
    });
    feature.setId(id);
    feature.set('opacity', 1, true);

    if (initialPoint.heading !== undefined) feature.set('heading', initialPoint.heading, true);
    if (initialPoint.speed !== undefined) feature.set('speed', initialPoint.speed, true);
    if (initialPoint.meta !== undefined) feature.set('meta', initialPoint.meta, true);

    if (this.options.style) {
      const style =
        typeof this.options.style === 'function'
          ? this.options.style(initialPoint, id)
          : this.options.style;
      feature.setStyle(style);
    }

    this.features.set(id, feature);
    this.source.addFeature(feature);

    if (this.trail) this.initTrail(id, initialPoint);
  }

  updatePosition(id: string, point: TrailPoint): void {
    const feature = this.features.get(id);
    if (!feature) return;

    const geom = feature.getGeometry();
    if (geom) geom.setCoordinates(this.project(point));

    if (point.heading !== undefined) feature.set('heading', point.heading, true);
    if (point.speed !== undefined) feature.set('speed', point.speed, true);

    if (typeof this.options.style === 'function') {
      const newStyle = this.options.style(point, id);
      // During a fade animation, opacity must carry over to the refreshed style.
      const opacity = feature.get('opacity') as number | undefined;
      if (opacity !== undefined && opacity !== 1) {
        newStyle.getImage()?.setOpacity(opacity);
      }
      feature.setStyle(newStyle);
    }

    if (this.trail) this.appendToTrail(id, point);
  }

  removeVehicle(id: string): void {
    const feature = this.features.get(id);
    if (feature) {
      this.source.removeFeature(feature);
      this.features.delete(id);
    }
    if (this.trail) {
      const t = this.trail.entries.get(id);
      if (t) {
        this.trail.source.removeFeature(t.feature);
        this.trail.entries.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.managedIds) {
      // existingLayer mode: remove only managed features, keep the layer.
      for (const id of this.managedIds) {
        const f = this.features.get(id);
        if (f) this.source.removeFeature(f);
      }
    } else {
      // Owned layer (or no managed list) → clear everything.
      for (const feature of this.features.values()) {
        this.source.removeFeature(feature);
      }
    }
    this.features.clear();
    if (this.ownedLayer) {
      this.map.removeLayer(this.layer);
    }

    // Trails are always adapter-owned — clear them in full.
    if (this.trail) {
      for (const t of this.trail.entries.values()) {
        this.trail.source.removeFeature(t.feature);
      }
      this.trail.entries.clear();
      this.map.removeLayer(this.trail.layer);
    }
  }

  /**
   * Optional TrackAdapter method — used by the Tracker's fade behavior.
   * Writes `opacity` as a feature property and (since OL's Icon/Circle inherits
   * from `Image`) calls `image.setOpacity(...)` plus `feature.changed()` to
   * trigger a redraw on the same frame.
   */
  updateOpacity(id: string, opacity: number): void {
    const feature = this.features.get(id);
    if (!feature) return;
    feature.set('opacity', opacity, true);
    const style = feature.getStyle() as Style | undefined;
    const img = style?.getImage?.();
    if (img) {
      img.setOpacity(opacity);
      feature.changed();
    }
  }

  /**
   * Optional TrackAdapter method — invoked by the Tracker whenever a vehicle's
   * lifecycle state changes. The `vehicleState` feature property is always
   * written (useful for external readers — popups, debug panels, custom
   * styles). When `warningOpacity` is configured, the marker dims to that
   * value on entering `warning` and restores to 1 on recovery to `active`.
   * `stale` / `completed` are no-ops here — both are immediately followed by
   * `removeVehicle`.
   */
  setVehicleState(id: string, state: VehicleState): void {
    const feature = this.features.get(id);
    if (!feature) return;
    feature.set('vehicleState', state, true);

    const dim = this.options.warningOpacity;
    if (dim === undefined) return; // opt-out: no opacity treatment
    if (state === 'warning') {
      this.updateOpacity(id, dim);
    } else if (state === 'active') {
      this.updateOpacity(id, 1);
    }
  }

  /**
   * Optional TrackAdapter method — surfaces a per-adapter byte estimate inside
   * `Tracker.getStats().memoryBreakdown`. Rough numbers: ~256 B per vehicle
   * feature, ~64 B + 16 B per coordinate for a trail entry.
   */
  getMemoryEstimate(): number {
    let bytes = this.features.size * 256;
    if (this.trail) {
      for (const t of this.trail.entries.values()) {
        bytes += 64 + t.coords.length * 16;
      }
    }
    return bytes;
  }

  // ─── Public utilities ─────────────────────────────────────────────────

  /** Look up a feature by id — handy for click handlers and custom interactions. */
  getFeature(vehicleId: string): Feature<Point> | undefined {
    return this.features.get(vehicleId);
  }

  /** Shallow copy of every managed feature. */
  getAllFeatures(): Map<string, Feature<Point>> {
    return new Map(this.features);
  }

  /** Update the managed-id allow-list at runtime. */
  setManagedIds(ids: Set<string> | string[] | null): void {
    this.managedIds = ids === null ? null : new Set(ids);
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private project(point: { lng: number; lat: number }): [number, number] {
    return fromLonLat([point.lng, point.lat], this.projection) as [number, number];
  }

  private initTrail(id: string, point: TrailPoint): void {
    if (!this.trail) return;
    const coord = this.project(point);
    const feature = new Feature({ geometry: new LineString([coord]) });
    feature.setId(`trail:${id}`);
    feature.setStyle(this.trailStyleFor(point));
    this.trail.source.addFeature(feature);
    this.trail.entries.set(id, { feature, coords: [coord], lastSampledAt: 0 });
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
    const coord = this.project(point);
    entry.coords.push(coord);
    if (entry.coords.length > opts.maxPoints) {
      entry.coords.splice(0, entry.coords.length - opts.maxPoints);
    }
    (entry.feature.getGeometry() as LineString).setCoordinates(entry.coords);
    // Refresh style — covers the rare case where vehicle's meta.color changes
    // (e.g. fleet re-skinned mid-run). Cheap; OL diffs the style internally.
    entry.feature.setStyle(this.trailStyleFor(point));
  }

  private trailStyleFor(point: TrailPoint): Style {
    const opts = this.trail?.opts;
    const fallback = opts?.defaultColor ?? '#3b82f6';
    const baseColor =
      opts?.color ??
      (typeof point.meta?.['color'] === 'string' ? (point.meta['color'] as string) : undefined) ??
      fallback;
    return new Style({
      stroke: new Stroke({
        color: applyAlpha(baseColor, opts?.opacity ?? 0.5),
        width: opts?.width ?? 3,
      }),
    });
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
    zIndex: opts.zIndex, // undefined by default: natural OL ordering (trail behind vehicles)
  };
}

/**
 * Applies alpha to a hex color (`#rrggbb` or `#rgb`) and returns an `rgba(...)`
 * string. Non-hex inputs (named, `rgb()`, `rgba()`) are passed through unchanged
 * — the caller is assumed to have already encoded alpha as needed.
 */
function applyAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  const hex = color.slice(1);
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (expanded.length !== 6) return color;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
