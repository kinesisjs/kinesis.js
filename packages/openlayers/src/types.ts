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

  /**
   * Per-vehicle trail rendering (fading polyline behind each marker).
   * Defaults off; pass `{ enabled: true }` to opt in.
   */
  trail?: TrailRenderOptions;

  /**
   * Opacity uygulanan değer 0-1 arasında, vehicle `warning` state'e geçtiğinde.
   * Sweeper warning'e geçirdiğinde marker bu opacity'ye düşer; recovery'de (ingest
   * veya sweeper active'e döndüğünde) 1.0'a geri çıkar.
   *
   * Belirtilmezse opacity değişmez — gap visualization opt-out kalır.
   * Tipik değer: 0.5-0.7.
   */
  warningOpacity?: number;
}

/**
 * Trail (geride bıraktığı yol) çizimi opsiyonları. `OpenLayersAdapter` her aracın
 * son N pozisyonunu kendi ring buffer'ında tutar ve ayrı bir VectorLayer'da
 * `Feature<LineString>` olarak çizer. Marker katmanının altında kalır (zIndex < 0).
 *
 * Renk çözümleme sırası: explicit `color` → `TrailPoint.meta.color` (string) →
 * `defaultColor` → `'#3b82f6'`. Bu sayede demo'daki fleet renkleri otomatik
 * trail'lere yansır.
 */
export interface TrailRenderOptions {
  /** Trail çizimi açık mı. Opt-in için zorunlu `true`. */
  enabled: boolean;
  /** Ring buffer kapasitesi (vehicle başına). Default: 60. */
  maxPoints?: number;
  /**
   * Vehicle başına ardışık iki trail örneği arasında minimum ms. Tick frekansı
   * (60 Hz) trail uzunluğunu çok çabuk tüketmesin diye throttle. Default: 100
   * (≈10 Hz örnekleme). 0 verilirse her tick örneklenir.
   */
  intervalMs?: number;
  /** Çizgi kalınlığı (piksel). Default: 3. */
  width?: number;
  /** Çizgi alfa kanalı, 0-1. Default: 0.5. */
  opacity?: number;
  /**
   * Sabit trail rengi (CSS hex / rgb / named). Verilirse `meta.color`'ı ezer.
   * Sadece hex (`#rrggbb` veya `#rgb`) için alfa uygulanır; diğer renklerde
   * fonksiyon string'i olduğu gibi geri verir.
   */
  color?: string;
  /** `color` ve `meta.color` yokken kullanılan fallback. Default: '#3b82f6'. */
  defaultColor?: string;
  /** Trail layer z-index. Negatif değer marker'ların altına alır. Default: -1. */
  zIndex?: number;
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
