import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type OLMap from 'ol/Map';
import type { OpenLayersAdapterOptions } from '@kinesisjs/openlayers';
import type { Position, TrackerOptions } from '@kinesisjs/core';

/**
 * Configuration for the programmatic `kinesisTracker(...)` factory.
 * The caller supplies their own OpenLayers Map — the advanced path that
 * bypasses the `[kinesisMap]` directive.
 */
export interface KinesisTrackerConfig {
  /** OpenLayers Map instance owned by the caller. */
  map: OLMap;

  /** Position source — either a Signal or an Observable. */
  positions: Signal<Position[]> | Observable<Position[]>;

  /**
   * Map adapter selector. Currently only 'openlayers'; 'leaflet' is planned
   * for v0.3.
   */
  adapter?: 'openlayers';

  /** Tracker options (interpolation, thresholds, etc.). */
  trackerOptions?: Partial<Omit<TrackerOptions, 'adapter'>>;

  /** Adapter options (style, managedFeatureIds, etc.). */
  adapterOptions?: OpenLayersAdapterOptions;
}
