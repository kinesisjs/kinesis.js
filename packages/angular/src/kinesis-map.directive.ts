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
import { OpenLayersAdapter, type VehicleStyleProvider } from '@kinesisjs/openlayers';
import type { Position, TrackerOptions } from '@kinesisjs/core';
import { bindPositions } from './kinesis-tracker.factory';

/**
 * Tek satır setup: host element'e OpenLayers Map + Kinesis.js Tracker bağlar.
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
 * Daha detaylı kontrol için (kendi map'inle çalışma, custom layer vb.) bkz.
 * `kinesisTracker(...)` factory'si.
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

  /** Pozisyon kaynağı: Signal<Position[]> veya Observable<Position[]>. */
  @Input({ required: true }) positions!: Signal<Position[]> | Observable<Position[]>;

  /** Haritanın başlangıç merkezi (lng, lat). Default: İstanbul. */
  @Input() center: [number, number] = [29.0, 41.0];

  /** Haritanın başlangıç zoom seviyesi. Default: 10. */
  @Input() zoom = 10;

  /**
   * İnterpolation davranışı. PRD §7.1 detayları.
   * Default: 'linear'. 'adaptive' önerilen (periyot-bilinçli).
   */
  @Input() interpolation: TrackerOptions['interpolation'] = 'linear';

  /** İki nokta arası bu süreden büyükse interpolation atlanır (ms). Default: 30000. */
  @Input() maxInterpolationGap = 30_000;

  /** Stale araç eşiği (ms). Default: 600000 (10 dakika). */
  @Input() staleThreshold = 600_000;

  /** Warning state eşiği (ms). Default: 60000. */
  @Input() warningThreshold = 60_000;

  /** Aynı vehicleId için minimum ingest aralığı (ms). Default: 100. */
  @Input() ingestThrottle = 100;

  /** Style provider — bkz. `createVehicleStyle()` helper'ı. */
  @Input() vehicleStyle?: VehicleStyleProvider;

  /** Hangi adapter? Şu an sadece 'openlayers'. v0.3'te 'leaflet'. */
  @Input() adapter = 'openlayers' as const;

  private map?: OLMap;
  private trackerInstance?: Tracker;

  ngOnInit(): void {
    this.map = this.createMap();
    const mapAdapter = new OpenLayersAdapter(
      this.map,
      this.vehicleStyle ? { style: this.vehicleStyle } : {},
    );
    const interpolation = this.interpolation;
    this.trackerInstance = new Tracker(
      interpolation === undefined
        ? {
            adapter: mapAdapter,
            maxInterpolationGap: this.maxInterpolationGap,
            warningThreshold: this.warningThreshold,
            staleThreshold: this.staleThreshold,
            ingestThrottle: this.ingestThrottle,
          }
        : {
            adapter: mapAdapter,
            interpolation,
            maxInterpolationGap: this.maxInterpolationGap,
            warningThreshold: this.warningThreshold,
            staleThreshold: this.staleThreshold,
            ingestThrottle: this.ingestThrottle,
          },
    );

    bindPositions(this.trackerInstance, this.positions, this.destroyRef, this.injector);
    this.trackerInstance.start();

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  /** Public: Tracker instance — getStats, manuel removeVehicle, event subscribe için. */
  getTracker(): Tracker | undefined {
    return this.trackerInstance;
  }

  /** Public: OL Map instance — custom layer/control/interaction eklemek için. */
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
