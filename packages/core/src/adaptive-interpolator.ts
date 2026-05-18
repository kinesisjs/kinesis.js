import { Interpolator } from './interpolator';
import type { AdaptiveBehavior, AdaptiveOptions, TrailPoint } from './types';

/**
 * Periyot-bilinçli karar motoru. Her tick'te `to.receivedAt - from.receivedAt`
 * periyodu hesaplanır ve 4 zon arasından biri seçilir:
 *
 *   periyot < minPeriodMs            → 'none'
 *   minPeriodMs ≤ periyot ≤ maxPeriodMs → 'linear'
 *   maxPeriodMs < periyot ≤ fadeThresholdMs → 'fade'
 *   periyot > snapThresholdMs        → 'snap'
 *
 * `compute()` matematiksel pozisyonu döner; **fade animasyonunun kendisi**
 * (opacity 1→0, snap, 0→1) Tracker tarafında sürülür (adapter.updateOpacity üzerinden).
 */
export class AdaptiveInterpolator {
  private readonly linear = new Interpolator('linear');
  private readonly cubic = new Interpolator('cubic');

  constructor(private readonly opts: AdaptiveOptions = {}) {}

  /** Verilen periyot için davranış zonu. */
  classify(periodMs: number): AdaptiveBehavior {
    const min = this.opts.minPeriodMs ?? 1000;
    const max = this.opts.maxPeriodMs ?? 8000;
    const fade = this.opts.fadeThresholdMs ?? 15000;
    const snap = this.opts.snapThresholdMs ?? 15000;
    if (periodMs < min) return 'none';
    if (periodMs <= max) return 'linear';
    if (periodMs <= fade) return 'fade';
    if (periodMs > snap) return 'snap';
    return 'linear';
  }

  /**
   * Tracker tarafından çağrılır. Built-in Interpolator ile aynı 5-parametreli
   * imza için: `(from, to, ratio, shortestArcHeading?, forceCubic?)`.
   */
  compute(
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    shortestArcHeading = true,
    forceCubic = false,
  ): TrailPoint {
    const period = to.receivedAt - from.receivedAt;
    const zone = this.classify(period);
    if (zone === 'none' || zone === 'snap') return to;
    if (forceCubic) return this.cubic.compute(from, to, ratio, shortestArcHeading);
    return this.linear.compute(from, to, ratio, shortestArcHeading);
  }

  /** Tracker'a "bu segment için fade davranışı tetikle" sinyali. */
  shouldFade(periodMs: number): boolean {
    return this.classify(periodMs) === 'fade';
  }
}
