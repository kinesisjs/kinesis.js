import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import type OLMap from 'ol/Map';
import type Style from 'ol/style/Style';
import type { TrackAdapter, TrailPoint } from '@kinesisjs/core';
import type { OpenLayersAdapterOptions } from './types';

/**
 * Kinesis.js Core'un `TrackAdapter` interface'ini OpenLayers için uygulayan adapter.
 *
 * Sorumlulukları:
 *   - Her araç için bir `Feature<Point>` lifecycle'ı (create/update/remove)
 *   - Statik veya dinamik style uygulama (her `updatePosition`'da yeniden üretilebilir)
 *   - Opsiyonel opacity güncellemesi (fade behavior için)
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

  constructor(
    private readonly map: OLMap,
    private readonly options: OpenLayersAdapterOptions = {},
  ) {
    this.projection = options.projection ?? 'EPSG:3857';

    if (options.managedFeatureIds) {
      this.managedIds = new Set(options.managedFeatureIds);
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
  }

  removeVehicle(id: string): void {
    const feature = this.features.get(id);
    if (!feature) return;
    this.source.removeFeature(feature);
    this.features.delete(id);
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
   * Opsiyonel TrackAdapter metodu — Tracker.getStats memoryBreakdown için.
   * Feature başına ~256B (Point geom + properties + style ref) tahmini.
   */
  getMemoryEstimate(): number {
    return this.features.size * 256;
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
}
