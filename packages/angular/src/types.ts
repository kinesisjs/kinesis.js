import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type OLMap from 'ol/Map';
import type { Map as LeafletMap } from 'leaflet';
import type { LeafletAdapterOptions } from '@kinesisjs/leaflet';
import type { OpenLayersAdapterOptions } from '@kinesisjs/openlayers';
import type { Position, TrackerOptions } from '@kinesisjs/core';

/** Map adapter selector. */
export type AdapterKind = 'openlayers' | 'leaflet';

/**
 * Configuration for the programmatic `kinesisTracker(...)` factory. The
 * caller supplies their own map instance — the advanced path that bypasses
 * the `[kinesisMap]` directive.
 *
 * Pass an OpenLayers `Map` together with `adapter: 'openlayers'` (the
 * default), or a Leaflet `Map` together with `adapter: 'leaflet'`. The
 * `adapterOptions` shape is selected by `adapter`.
 */
export interface KinesisTrackerConfig {
  /** Map instance owned by the caller — an OpenLayers `Map` or a Leaflet `Map`. */
  map: OLMap | LeafletMap;

  /** Position source — either a Signal or an Observable. */
  positions: Signal<Position[]> | Observable<Position[]>;

  /** Map adapter selector. Default: 'openlayers'. */
  adapter?: AdapterKind;

  /** Tracker options (interpolation, thresholds, etc.). */
  trackerOptions?: Partial<Omit<TrackerOptions, 'adapter'>>;

  /**
   * Adapter options matching the chosen `adapter`. The directive routes the
   * value to whichever adapter is constructed.
   */
  adapterOptions?: OpenLayersAdapterOptions | LeafletAdapterOptions;
}
