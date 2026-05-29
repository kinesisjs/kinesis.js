import { DestroyRef, Injector, effect, inject, isSignal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isObservable, type Observable } from 'rxjs';
import { Tracker } from '@kinesisjs/core';
import type { Position, TrackAdapter } from '@kinesisjs/core';
import { OpenLayersAdapter, type OpenLayersAdapterOptions } from '@kinesisjs/openlayers';
import { LeafletAdapter, type LeafletAdapterOptions } from '@kinesisjs/leaflet';
import type OLMap from 'ol/Map';
import type { Map as LeafletMap } from 'leaflet';
import type { KinesisTrackerConfig } from './types';

/**
 * Programmatic Tracker factory. Callable outside a component (service, route
 * resolver, etc.). Cleanup is automatic via Angular's `DestroyRef` — no
 * manual `tracker.destroy()` required.
 *
 * @example
 * ```ts
 * export class TrackingService {
 *   private readonly map = inject(MapService).map;
 *   private readonly positions = inject(PositionsService).positions;
 *
 *   tracker = kinesisTracker({ map: this.map, positions: this.positions });
 *   // Leaflet: kinesisTracker({ map, positions, adapter: 'leaflet' });
 * }
 * ```
 *
 * **Important:** must be called inside an Angular injection context
 * (a constructor or a `runInInjectionContext` block).
 */
export function kinesisTracker(config: KinesisTrackerConfig): Tracker {
  const destroyRef = inject(DestroyRef);
  const injector = inject(Injector);

  const adapter = buildAdapter(config);
  const tracker = new Tracker({
    adapter,
    interpolation: 'linear',
    ...config.trackerOptions,
  });

  bindPositions(tracker, config.positions, destroyRef, injector);

  tracker.start();
  destroyRef.onDestroy(() => tracker.destroy());

  return tracker;
}

function buildAdapter(config: KinesisTrackerConfig): TrackAdapter {
  const kind = config.adapter ?? 'openlayers';
  if (kind === 'leaflet') {
    return new LeafletAdapter(
      config.map as LeafletMap,
      (config.adapterOptions as LeafletAdapterOptions | undefined) ?? {},
    );
  }
  return new OpenLayersAdapter(
    config.map as OLMap,
    (config.adapterOptions as OpenLayersAdapterOptions | undefined) ?? {},
  );
}

/**
 * Bind a position source (Signal or Observable) to a Tracker. Cleanup is
 * automatic (Signals via the effect's injector, Observables via
 * `takeUntilDestroyed`).
 *
 * @internal Not a public export — shared helper between the directive and the
 *           factory.
 */
export function bindPositions(
  tracker: Tracker,
  positions: Signal<Position[]> | Observable<Position[]>,
  destroyRef: DestroyRef,
  injector: Injector,
): void {
  if (isObservable(positions)) {
    positions.pipe(takeUntilDestroyed(destroyRef)).subscribe((p) => tracker.ingest(p));
    return;
  }
  if (isSignal(positions)) {
    effect(
      () => {
        tracker.ingest(positions());
      },
      { injector },
    );
    return;
  }
  throw new Error(
    '[kinesisjs/angular] positions must be a Signal<Position[]> or Observable<Position[]>',
  );
}
