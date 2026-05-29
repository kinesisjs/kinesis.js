import {
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  Input,
  type OnInit,
  inject,
  type Signal,
} from '@angular/core';
import type { Observable } from 'rxjs';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import { map as createLeafletMap, tileLayer as createLeafletTileLayer } from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { Tracker } from '@kinesisjs/core';
import {
  OpenLayersAdapter,
  type TrailRenderOptions as OLTrailRenderOptions,
  type VehicleStyleProvider as OLVehicleStyleProvider,
} from '@kinesisjs/openlayers';
import {
  LeafletAdapter,
  type TrailRenderOptions as LeafletTrailRenderOptions,
  type VehicleStyleProvider as LeafletVehicleStyleProvider,
} from '@kinesisjs/leaflet';
import type {
  AdaptiveOptions,
  FadeAnimationOptions,
  InitialPositionBehavior,
  Position,
  TrackAdapter,
  TrackerOptions,
} from '@kinesisjs/core';
import { bindPositions } from './kinesis-tracker.factory';
import type { AdapterKind } from './types';

interface Scene {
  map: OLMap | LeafletMap;
  adapter: TrackAdapter;
  dispose: () => void;
}

/**
 * One-line setup: attaches a map (OpenLayers or Leaflet) + a Kinesis.js
 * Tracker to the host element.
 *
 * @example
 * ```ts
 * @Component({
 *   imports: [KinesisMapDirective],
 *   template: `<div kinesisMap [positions]="positions" class="map"></div>`,
 * })
 * export class LiveMapComponent {
 *   positions = inject(PositionsService).positions; // Signal<Position[]>
 * }
 * ```
 *
 * Switch to Leaflet with `[adapter]="'leaflet'"`. For finer control (your own
 * map instance, extra layers, etc.) see the `kinesisTracker(...)` factory.
 */
@Directive({
  selector: '[kinesisMap]',
  standalone: true,
  exportAs: 'kinesisMap',
})
export class KinesisMapDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  /** Position source: `Signal<Position[]>` or `Observable<Position[]>`. */
  @Input({ required: true }) positions!: Signal<Position[]> | Observable<Position[]>;

  /** Initial map center as `[lng, lat]` — the directive swaps to `[lat, lng]` for Leaflet. Default: Istanbul. */
  @Input() center: [number, number] = [29.0, 41.0];

  /** Initial zoom level. Default: 10. */
  @Input() zoom = 10;

  /**
   * Interpolation behavior — see PRD §7.1.
   * Default: 'linear'. 'adaptive' is the recommended period-aware mode.
   */
  @Input() interpolation: TrackerOptions['interpolation'] = 'linear';

  /** If the gap between two points exceeds this (ms), interpolation is skipped. Default: 30000. */
  @Input() maxInterpolationGap = 30_000;

  /** Stale vehicle threshold (ms). Default: 600000 (10 minutes). */
  @Input() staleThreshold = 600_000;

  /** Warning state threshold (ms). Default: 60000. */
  @Input() warningThreshold = 60_000;

  /** Minimum ingest interval per vehicleId (ms). Default: 100. */
  @Input() ingestThrottle = 100;

  /**
   * Render-side interpolation buffer (ms). For a 1 Hz GPS feed, 1000 is the
   * sweet spot (default). 0 disables the buffer (legacy snap-on-ingest
   * behavior). See `TrackerOptions.renderLagMs` for details.
   */
  @Input() renderLagMs?: number;

  /**
   * Adaptive interpolation zone thresholds — used only when
   * `interpolation: 'adaptive'`. See `AdaptiveOptions` for the defaults.
   * Example: `[adaptive]="{ minPeriodMs: 200 }"` for very high-frequency feeds.
   */
  @Input() adaptive?: AdaptiveOptions;

  /**
   * Animation parameters used in the adaptive 'fade' zone. Defaults:
   * `duration: 800`, `easing: 'ease-in-out'`.
   */
  @Input() fadeAnimation?: FadeAnimationOptions;

  /**
   * What happens when the first position for a vehicle arrives:
   * `'show-immediately'` (default), `'wait-for-second'` (the marker doesn't
   * appear until a second point lands), or `'fade-in'` (opacity 0→1).
   */
  @Input() initialPositionBehavior?: InitialPositionBehavior;

  /**
   * Style provider for the chosen adapter — see `createVehicleStyle()` in
   * `@kinesisjs/openlayers` or `@kinesisjs/leaflet`. Pass the one matching
   * `[adapter]`; the value is forwarded to whichever adapter is constructed.
   */
  @Input() vehicleStyle?: OLVehicleStyleProvider | LeafletVehicleStyleProvider;

  /**
   * Trail rendering — a fading polyline behind each marker. Opt in with
   * `[trail]="{ enabled: true }"`. The option shape is structurally identical
   * for both adapters; the value is forwarded to the selected one.
   */
  @Input() trail?: OLTrailRenderOptions | LeafletTrailRenderOptions;

  /**
   * Gap visualization: when a vehicle transitions to `warning`, the marker
   * dims to this opacity (0–1). It recovers to 1.0 on the next ingest or on
   * a sweeper-detected recovery to `active`. If omitted, opacity stays
   * untouched (backward compatible). Typical value: 0.5–0.7.
   */
  @Input() warningOpacity?: number;

  /**
   * Run the tick loop inside a Web Worker (the map adapter stays on the main
   * thread). `true` uses the inlined worker; `{ url }` loads a bundled
   * worker script you host. See `TrackerOptions.worker`. Default: off.
   */
  @Input() worker?: boolean | { url: string | URL };

  /**
   * Map adapter to use — `'openlayers'` (default) or `'leaflet'`. The
   * corresponding peer dependency (`ol` or `leaflet`) must be installed.
   */
  @Input() adapter: AdapterKind = 'openlayers';

  private scene?: Scene;
  private trackerInstance?: Tracker;

  ngOnInit(): void {
    this.scene =
      this.adapter === 'leaflet' ? this.createLeafletScene() : this.createOpenLayersScene();

    const trackerOpts: TrackerOptions = {
      adapter: this.scene.adapter,
      maxInterpolationGap: this.maxInterpolationGap,
      warningThreshold: this.warningThreshold,
      staleThreshold: this.staleThreshold,
      ingestThrottle: this.ingestThrottle,
      ...(this.interpolation !== undefined ? { interpolation: this.interpolation } : {}),
      ...(this.renderLagMs !== undefined ? { renderLagMs: this.renderLagMs } : {}),
      ...(this.adaptive !== undefined ? { adaptive: this.adaptive } : {}),
      ...(this.fadeAnimation !== undefined ? { fadeAnimation: this.fadeAnimation } : {}),
      ...(this.initialPositionBehavior !== undefined
        ? { initialPositionBehavior: this.initialPositionBehavior }
        : {}),
      ...(this.worker !== undefined ? { worker: this.worker } : {}),
    };
    this.trackerInstance = new Tracker(trackerOpts);

    bindPositions(this.trackerInstance, this.positions, this.destroyRef, this.injector);
    this.trackerInstance.start();

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  /** Public: the underlying `Tracker` — for `getStats()`, manual `removeVehicle`,
   *  event subscriptions, etc. */
  getTracker(): Tracker | undefined {
    return this.trackerInstance;
  }

  /**
   * Public: the underlying map instance. Narrow with the `adapter` you chose:
   * an `ol/Map` when `[adapter]="'openlayers'"`, an `L.Map` when `'leaflet'`.
   */
  getMap(): OLMap | LeafletMap | undefined {
    return this.scene?.map;
  }

  private createOpenLayersScene(): Scene {
    const map = new OLMap({
      target: this.el.nativeElement,
      layers: [new TileLayer({ source: new OSM() })],
      view: new View({
        center: fromLonLat(this.center),
        zoom: this.zoom,
      }),
    });
    const adapter = new OpenLayersAdapter(map, {
      ...(this.vehicleStyle ? { style: this.vehicleStyle as OLVehicleStyleProvider } : {}),
      ...(this.trail ? { trail: this.trail as OLTrailRenderOptions } : {}),
      ...(this.warningOpacity !== undefined ? { warningOpacity: this.warningOpacity } : {}),
    });
    return {
      map,
      adapter,
      dispose: () => {
        map.setTarget(undefined);
        map.dispose();
      },
    };
  }

  private createLeafletScene(): Scene {
    // Leaflet expects [lat, lng]; the directive's `center` input is documented
    // as [lng, lat] (matching the OL convention), so swap on the way in.
    const map = createLeafletMap(this.el.nativeElement).setView(
      [this.center[1], this.center[0]],
      this.zoom,
    );
    createLeafletTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(
      map,
    );
    const adapter = new LeafletAdapter(map, {
      ...(this.vehicleStyle ? { style: this.vehicleStyle as LeafletVehicleStyleProvider } : {}),
      ...(this.trail ? { trail: this.trail as LeafletTrailRenderOptions } : {}),
      ...(this.warningOpacity !== undefined ? { warningOpacity: this.warningOpacity } : {}),
    });
    return {
      map,
      adapter,
      dispose: () => map.remove(),
    };
  }

  private cleanup(): void {
    this.trackerInstance?.destroy();
    this.scene?.dispose();
    this.trackerInstance = undefined;
    this.scene = undefined;
  }
}
