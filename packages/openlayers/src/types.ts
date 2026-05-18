import type Style from 'ol/style/Style';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type { TrailPoint } from '@kinesisjs/core';

/**
 * Bir aracın style'ı için ya hazır bir `Style` ya da `(vehicle, id) => Style` üreteci.
 * Style fn her `updatePosition` çağrısında yeniden uygulanır (dynamic style).
 */
export type VehicleStyleProvider = Style | ((vehicle: TrailPoint, vehicleId: string) => Style);

export interface OpenLayersAdapterOptions {
  /** Layer adı (debugging). Default: 'kinesis-vehicles'. */
  layerName?: string;

  /** Statik Style veya per-vehicle style üreteci. */
  style?: VehicleStyleProvider;

  /**
   * Mevcut bir VectorLayer'a bağla (yeni layer oluşturma).
   * `managedFeatureIds` ile birlikte kullanılırsa diğer feature'lara dokunulmaz.
   */
  existingLayer?: VectorLayer<VectorSource>;

  /** Map projection. Default: 'EPSG:3857'. */
  projection?: string;

  /**
   * Sadece bu ID'lere sahip feature'ları yönet.
   *
   * `existingLayer` modunda kritik: aynı layer'da geofence polygon'ları,
   * custom markerlar gibi başka feature'lar varsa adapter onlara dokunmaz.
   * `destroy()` yalnızca bu listedeki feature'ları siler.
   *
   * Belirtilmezse adapter layer'daki tüm feature'ları kendi yönettiği varsayar
   * (yeni layer açıldığı senaryoda doğru davranış).
   *
   * Runtime'da `setManagedIds(...)` ile güncellenebilir.
   */
  managedFeatureIds?: Set<string> | string[];
}

export interface SpeedColorBand {
  /** Bu hızın altında (km/h dahil) bu renk uygulanır. */
  max: number;
  /** CSS color (hex, rgb, named). */
  color: string;
}

export interface VehicleStyleOptions {
  /** Icon URL. Belirtilirse Icon style, yoksa Circle style üretilir. */
  icon?: string;
  /** Icon scale. Default: 1. */
  iconScale?: number;
  /** Icon rotation offset (derece). Default: 0. */
  rotationOffset?: number;
  /** Circle/Icon default rengi. Default: '#3b82f6'. */
  defaultColor?: string;
  /**
   * Hıza göre renk bantları. `speed <= max` ilk eşleşen banda uygulanır.
   * Sıralı verilmeli (artan). Boş ise `defaultColor` kullanılır.
   */
  speedColorBands?: SpeedColorBand[];
  /** Circle yarıçapı. Default: 6. */
  circleRadius?: number;
}
