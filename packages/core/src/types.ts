/**
 * Kullanıcının kütüphaneye verdiği ham pozisyon verisi.
 */
export interface Position {
  /** Araç benzersiz tanımlayıcısı (örn. plaka, ID). */
  id: string;
  /** Boylam (longitude), WGS84. */
  lng: number;
  /** Enlem (latitude), WGS84. */
  lat: number;
  /** Sunucudan gelen timestamp (epoch ms). Yoksa ingest sırasında atanır. */
  timestamp?: number;
  /** Hız (km/h, opsiyonel). */
  speed?: number;
  /** Yön (0-360 derece, opsiyonel). */
  heading?: number;
  /** Kullanıcıya özel meta veri. */
  meta?: Record<string, unknown>;
}

/**
 * Kütüphanenin iç buffer'ında tutulan zenginleştirilmiş pozisyon.
 */
export interface TrailPoint {
  lng: number;
  lat: number;
  /** Pozisyon zamanı (epoch ms). */
  ts: number;
  speed?: number;
  heading?: number;
  /** İstemcide alındığı zaman (epoch ms). */
  receivedAt: number;
  meta?: Record<string, unknown>;
}

/**
 * Bir aracın sweeper-tarafından bilinen state'i.
 *
 * - 'active'    : Son ingest yakın zamanda (idle < warningThreshold).
 * - 'warning'   : Veri gelmiyor ama henüz stale değil; feature haritadan KALDIRILMAZ.
 * - 'stale'     : staleThreshold aşıldı; adapter.removeVehicle çağrılır.
 * - 'completed' : `tracker.markCompleted(id)` ile manuel işaretlendi.
 */
export type VehicleState = 'active' | 'warning' | 'stale' | 'completed';

export interface SweepResult {
  vehicleId: string;
  state: VehicleState;
  lastSeen: number;
  reason: string;
}

/**
 * Her araç için tutulan sabit boyutlu slot (ring pattern).
 */
export interface VehicleSlot {
  previous: TrailPoint | null;
  current: TrailPoint | null;
  lastIngestAt: number;
  state: VehicleState;
  /** Adapter.addVehicle çağrıldı mı? `wait-for-second` modu için kritik. */
  isAttached: boolean;
}

/**
 * İlk pozisyon geldiğinde davranış.
 */
export type InitialPositionBehavior = 'show-immediately' | 'wait-for-second' | 'fade-in';

/**
 * Built-in interpolation modları (custom + 'adaptive' hariç).
 */
export type InterpolationMode = 'linear' | 'cubic' | 'geodesic' | 'none';

export interface InterpolationOptions {
  shortestArcHeading?: boolean;
  vehicleId?: string;
}

/**
 * Kullanıcı kendi interpolation mantığını yazabilir (route-aware, ML vb.).
 */
export interface CustomInterpolator {
  compute(
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    options?: InterpolationOptions,
  ): TrailPoint | Promise<TrailPoint>;

  prepare?(from: TrailPoint, to: TrailPoint): Promise<void> | void;

  dispose?(): void;
}

export interface AdaptiveOptions {
  minPeriodMs?: number;
  maxPeriodMs?: number;
  fadeThresholdMs?: number;
  snapThresholdMs?: number;
}

export type AdaptiveBehavior = 'none' | 'linear' | 'fade' | 'snap';

export type TrackerErrorCode =
  | 'INVALID_POSITION'
  | 'ADAPTER_ERROR'
  | 'INTERPOLATION_ERROR'
  | 'WORKER_ERROR'
  | 'INTERNAL_ERROR';

export interface TrackerError {
  code: TrackerErrorCode;
  message: string;
  vehicleId?: string;
  context?: Record<string, unknown>;
  cause?: Error;
}

export interface FadeAnimationOptions {
  /** Animasyon süresi (ms). Default: 800. */
  duration?: number;
  /** Easing fonksiyonu. Default: 'ease-in-out'. */
  easing?: 'linear' | 'ease-in-out';
}

/**
 * Tracker konfigürasyonu.
 */
export interface TrackerOptions {
  /**
   * İnterpolation davranışı.
   * - 'linear' (default): Düz çizgi
   * - 'cubic'           : Smoothstep easing
   * - 'geodesic'        : Great-circle (gemi/uçak)
   * - 'none'            : Direkt setCoordinates
   * - 'adaptive'        : Periyot-bilinçli (none/linear/fade/snap) — önerilen
   * - CustomInterpolator: Kullanıcı sağlayıcısı
   */
  interpolation?: InterpolationMode | 'adaptive' | CustomInterpolator;

  /** 'adaptive' modu eşikleri. */
  adaptive?: AdaptiveOptions;

  /** Fade animasyon ayarları (fade behavior + 'fade-in' initialPositionBehavior). */
  fadeAnimation?: FadeAnimationOptions;

  /**
   * İki nokta arası bu süreden büyükse standart interpolation atlanır.
   * Adaptive mod kendi eşiklerini kullanır.
   * Default: 30000 (30 saniye)
   */
  maxInterpolationGap?: number;

  /**
   * Veri gelmeyen araç bu süreden sonra 'warning' state'ine geçer.
   * Default: 60000 (60 saniye)
   */
  warningThreshold?: number;

  /**
   * Veri gelmeyen araç bu süreden sonra 'stale' kabul edilir, kaldırılır.
   * Default: 600000 (10 dakika)
   */
  staleThreshold?: number;

  /** Sweeper kontrol frekansı. Default: 60000 ms. */
  staleCheckInterval?: number;

  /**
   * Aynı vehicleId için minimum ingest aralığı (ms). Default: 100.
   * Bu süre içinde gelen ikinci ingest yutulur, 'ingest' event'inde 'throttled' sayılır.
   */
  ingestThrottle?: number;

  /** İlk pozisyon geldiğinde davranış. Default: 'show-immediately'. */
  initialPositionBehavior?: InitialPositionBehavior;

  /** Heading shortest-arc interpolation. Default: true. */
  shortestArcHeading?: boolean;

  /**
   * Render-tarafı interpolation buffer (ms). Marker, ekranda `now - renderLagMs`
   * anına denk gelen pozisyonda gösterilir.
   *
   * Olmadan: yeni ingest gelir gelmez `current.receivedAt = now`, dolayısıyla
   * `elapsed = now - previous.receivedAt ≥ period` daima true olur ve tick her
   * defasında current'a snap eder — interpolation **hiç çalışmaz**.
   *
   * Sağlıklı default: beklenen ingest periyodu kadar (örn. 1 Hz feed için 1000).
   * Bu, "current" ingest edildiği anda `renderTime ≈ previous.receivedAt` yapar
   * ve marker bir sonraki ingest gelene kadar previous'tan current'a düzgün akar.
   *
   * 0 verilirse buffer kapalıdır (eski v0.1.0 davranışı; gerçek-zamanlı
   * interpolation gözükmez, sadece teleport).
   *
   * Default: 1000.
   */
  renderLagMs?: number;

  /** Web Worker'da çalıştır. Default: false (v0.2'de detaylandırılır). */
  worker?: boolean;

  /** Adapter instance. */
  adapter: TrackAdapter;
}

/**
 * Tüm map adapter'ların uyması gereken interface.
 */
export interface TrackAdapter {
  addVehicle(id: string, initialPoint: TrailPoint): void;
  updatePosition(id: string, point: TrailPoint): void;
  removeVehicle(id: string): void;
  destroy(): void;

  /** Opsiyonel: opacity (0..1) güncelle. Fade behavior için. */
  updateOpacity?(id: string, opacity: number): void;

  /**
   * Opsiyonel: vehicle lifecycle state değiştiğinde çağrılır
   * (active ↔ warning, → stale → removeVehicle, → completed → removeVehicle).
   *
   * Adapter'lar bu hook'u kullanıp gap visualization yapabilir — örn. warning
   * state'de marker'ı soluklaştırma, recovery'de eski opacity'ye dönme.
   * `stale` ve `completed` hemen ardından `removeVehicle` ile takip edilir;
   * bu state'leri rendering tarafında handle etmek zorunlu değil.
   */
  setVehicleState?(id: string, state: VehicleState): void;

  /** Opsiyonel: adapter tarafındaki bellek tahmini (bytes). */
  getMemoryEstimate?(): number;
}

/**
 * Event isimleri ve payload'ları.
 */
export type TrackerEventMap = {
  tick: { time: number; activeCount: number };
  vehicleadded: { vehicleId: string };
  vehiclewarning: { vehicleId: string; lastSeen: number };
  vehiclestale: { vehicleId: string };
  vehiclecompleted: { vehicleId: string };
  vehicleremoved: { vehicleId: string };
  ingest: { count: number; throttled: number; latency: number };
  error: TrackerError;
  start: void;
  stop: void;
  destroy: void;
};

/**
 * Çalışma istatistikleri (devtools + benchmarks).
 */
export interface TrackerStats {
  vehicleCount: number;
  totalBufferedPoints: number;
  fps: number;
  lastTickDurationMs: number;
  lastIngestLatencyMs: number;
  memoryEstimateBytes: number;
  staleRemovedTotal: number;
  uptime: number;

  memoryBreakdown: {
    slotsBytes: number;
    eventListenersBytes: number;
    adapterEstimateBytes: number;
  };

  performanceMetrics: {
    tickHistoryP50: number;
    tickHistoryP95: number;
    tickHistoryP99: number;
    ingestRate: number;
    droppedTicks: number;
    droppedTicksLast60s: number;
  };
}
