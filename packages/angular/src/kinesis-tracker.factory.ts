import { DestroyRef, Injector, effect, inject, isSignal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isObservable, type Observable } from 'rxjs';
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter } from '@kinesisjs/openlayers';
import type { Position } from '@kinesisjs/core';
import type { KinesisTrackerConfig } from './types';

/**
 * Programmatik kullanım için Tracker fabrikası. Component dışında (service,
 * route resolver, vb.) çağrılabilir. Angular `DestroyRef`'ten otomatik cleanup
 * yapar — manuel `tracker.destroy()` gerekmez.
 *
 * @example
 * ```ts
 * export class TrackingService {
 *   private readonly map = inject(MapService).map;
 *   private readonly positions = inject(PositionsService).positions;
 *
 *   tracker = kinesisTracker({ map: this.map, positions: this.positions });
 * }
 * ```
 *
 * **Önemli:** Bu fonksiyon Angular injection context'i gerektirir
 * (constructor veya `runInInjectionContext` içinden çağrılmalı).
 */
export function kinesisTracker(config: KinesisTrackerConfig): Tracker {
  const destroyRef = inject(DestroyRef);
  const injector = inject(Injector);

  const adapter = new OpenLayersAdapter(config.map, config.adapterOptions ?? {});
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

/**
 * Pozisyon kaynağını (Signal veya Observable) Tracker'a bağla.
 * Cleanup otomatik (Signal effect injector ile, Observable takeUntilDestroyed ile).
 *
 * @internal Public export değil — directive ve factory bu helper'ı paylaşır.
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
