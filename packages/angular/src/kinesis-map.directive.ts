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
import { Tracker } from '@kinesisjs/core';
import {
  OpenLayersAdapter,
  type TrailRenderOptions,
  type VehicleStyleProvider,
} from '@kinesisjs/openlayers';
import type {
  AdaptiveOptions,
  FadeAnimationOptions,
  InitialPositionBehavior,
  Position,
  TrackerOptions,
} from '@kinesisjs/core';
import { bindPositions } from './kinesis-tracker.factory';

/**
 * One-line setup: attaches an OpenLayers Map + a Kinesis.js Tracker to the
 * host element.
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
 * For finer control (your own OL Map instance, extra layers, etc.) see the
 * `kinesisTracker(...)` factory.
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

  /** Initial map center (lng, lat). Default: Istanbul. */
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

  /** Style provider — see the `createVehicleStyle()` helper. */
  @Input() vehicleStyle?: VehicleStyleProvider;

  /**
   * Trail rendering — fading polyline behind each marker on a separate OL
   * VectorLayer that sits below the vehicle layer. Opt in with
   * `[trail]="{ enabled: true }"`. Full option surface lives in
   * `@kinesisjs/openlayers` `TrailRenderOptions`.
   */
  @Input() trail?: TrailRenderOptions;

  /**
   * Gap visualization: when a vehicle transitions to `warning`, the marker
   * dims to this opacity (0–1). It recovers to 1.0 on the next ingest or on
   * a sweeper-detected recovery to `active`. If omitted, opacity stays
   * untouched (backward compatible).
   *
   * Typical value: 0.5–0.7. Equivalent to
   * `OpenLayersAdapterOptions.warningOpacity`.
   */
  @Input() warningOpacity?: number;

  /**
   * Run the tick loop inside a Web Worker (the OpenLayers adapter stays on the
   * main thread). `true` uses the inlined worker; `{ url }` loads a bundled
   * worker script you host. See `TrackerOptions.worker`. Default: off.
   */
  @Input() worker?: boolean | { url: string | URL };

  /** Adapter to use. Currently only 'openlayers'; 'leaflet' is planned for v0.3. */
  @Input() adapter = 'openlayers' as const;

  private map?: OLMap;
  private trackerInstance?: Tracker;

  ngOnInit(): void {
    this.map = this.createMap();
    const mapAdapter = new OpenLayersAdapter(this.map, {
      ...(this.vehicleStyle ? { style: this.vehicleStyle } : {}),
      ...(this.trail ? { trail: this.trail } : {}),
      ...(this.warningOpacity !== undefined ? { warningOpacity: this.warningOpacity } : {}),
    });

    const trackerOpts: TrackerOptions = {
      adapter: mapAdapter,
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

  /** Public: the OL Map instance — for adding custom layers, controls, or interactions. */
  getMap(): OLMap | undefined {
    return this.map;
  }

  private createMap(): OLMap {
    return new OLMap({
      target: this.el.nativeElement,
      layers: [new TileLayer({ source: new OSM() })],
      view: new View({
        center: fromLonLat(this.center),
        zoom: this.zoom,
      }),
    });
  }

  private cleanup(): void {
    this.trackerInstance?.destroy();
    this.map?.dispose();
    this.trackerInstance = undefined;
    this.map = undefined;
  }
}
