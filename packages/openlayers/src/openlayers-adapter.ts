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
 * Kinesis.js Core'un `TrackAdapter` interface'ini OpenLayers için uygulayan adapter.
 *
 * Sorumlulukları:
 *   - Her araç için bir `Feature<Point>` lifecycle'ı (create/update/remove)
 *   - Statik veya dinamik style uygulama (her `updatePosition`'da yeniden üretilebilir)
 *   - Opsiyonel opacity güncellemesi (fade behavior için)
 *   - Opsiyonel trail rendering (geride bıraktığı yol, ayrı VectorLayer)
 *   - `managedFeatureIds` ile mevcut layer'da diğer feature'lara dokunmama
 *   - Bellek tahmini (`getMemoryEstimate`) — Tracker.getStats için
 *
 * Sorumlu olmadığı: interpolation, veri kaynağı, kullanıcı etkileşimi.
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
      // Fade animasyonu sırasında opacity yenilenen style'a taşınmalı
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
      // existingLayer modu: sadece managed feature'ları sil, layer'ı kaldırma
      for (const id of this.managedIds) {
        const f = this.features.get(id);
        if (f) this.source.removeFeature(f);
      }
    } else {
      // Kendi layer'ımız ya da managed listesi yok → topyekun temizle
      for (const feature of this.features.values()) {
        this.source.removeFeature(feature);
      }
    }
    this.features.clear();
    if (this.ownedLayer) {
      this.map.removeLayer(this.layer);
    }

    // Trails her zaman adapter-owned; topyekun temizle.
    if (this.trail) {
      for (const t of this.trail.entries.values()) {
        this.trail.source.removeFeature(t.feature);
      }
      this.trail.entries.clear();
      this.map.removeLayer(this.trail.layer);
    }
  }

  /**
   * Opsiyonel TrackAdapter metodu — Tracker'ın fade behavior'ı kullanır.
   * Feature property olarak `opacity` yazılır; OL Icon/Circle Image'dan miras olduğu
   * için `image.setOpacity` aynı anda çağrılır ve feature.changed() ile redraw tetiklenir.
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
   * Opsiyonel TrackAdapter metodu — Tracker vehicle lifecycle state değiştirdiğinde
   * çağrılır. Feature property olarak `vehicleState` her zaman set edilir (external
   * okuma için). `warningOpacity` config'i varsa warning'e geçince marker o opacity'ye
   * düşer, recovery'de (active'e dönünce) 1.0'a geri çıkar. `stale`/`completed`
   * state'leri burada handle edilmez — hemen `removeVehicle` izler.
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
   * Opsiyonel TrackAdapter metodu — Tracker.getStats memoryBreakdown için.
   * Feature başına ~256B, trail başına ~64B + 16B/coord tahmini.
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

  /** Bir feature'ı id ile getir (click handler, custom interaction için). */
  getFeature(vehicleId: string): Feature<Point> | undefined {
    return this.features.get(vehicleId);
  }

  /** Yönetilen tüm feature'ların shallow kopyası. */
  getAllFeatures(): Map<string, Feature<Point>> {
    return new Map(this.features);
  }

  /** Managed ID listesini runtime'da değiştir. */
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
 * Hex (`#rrggbb` veya `#rgb`) renge alfa uygular ve `rgba(...)` döner.
 * Diğer formatları (named, rgb(), rgba()) olduğu gibi geçirir — kullanıcı
 * istediği şekilde alfayı zaten verdi varsayılır.
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
