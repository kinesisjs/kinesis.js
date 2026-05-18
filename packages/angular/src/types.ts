import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type OLMap from 'ol/Map';
import type { OpenLayersAdapterOptions } from '@kinesisjs/openlayers';
import type { Position, TrackerOptions } from '@kinesisjs/core';

/**
 * Programmatik `kinesisTracker(...)` factory'sinin konfigürasyonu.
 * Kullanıcı kendi OL Map'ini sağlar — directive'i bypass eden gelişmiş senaryo.
 */
export interface KinesisTrackerConfig {
  /** Kullanıcının yarattığı OpenLayers Map. */
  map: OLMap;

  /** Pozisyon kaynağı — Signal veya Observable kabul edilir. */
  positions: Signal<Position[]> | Observable<Position[]>;

  /**
   * Map adapter seçimi. Şu an sadece 'openlayers'.
   * v0.3'te 'leaflet' eklenecek.
   */
  adapter?: 'openlayers';

  /** Tracker'a iletilecek opsiyonlar (interpolation, threshold'lar vb.). */
  trackerOptions?: Partial<Omit<TrackerOptions, 'adapter'>>;

  /** Adapter'a iletilecek opsiyonlar (style, managedFeatureIds vb.). */
  adapterOptions?: OpenLayersAdapterOptions;
}
