import { Interpolator } from './interpolator';
import type { AdaptiveBehavior, AdaptiveOptions, TrailPoint } from './types';

/**
 * Period-aware decision engine. On every tick the period
 * `to.receivedAt - from.receivedAt` is computed and one of four zones is
 * selected:
 *
 *   period < minPeriodMs                  → 'none'   (default min: 500 ms)
 *   minPeriodMs ≤ period ≤ maxPeriodMs    → 'linear' (default max: 8000 ms)
 *   maxPeriodMs < period ≤ fadeThresholdMs → 'fade'  (default fade: 15000 ms)
 *   period > snapThresholdMs               → 'snap'  (default snap: 15000 ms)
 *
 * `minPeriodMs` dropped from 1000 to 500 in v0.1.2: common 1 Hz GPS feeds
 * routinely jitter under the 1000 ms boundary, which used to teleport the
 * marker through the 'none' zone. Sub-second feeds can opt back into the
 * 'none' behavior by setting e.g. `minPeriodMs: 100`.
 *
 * `compute()` returns the math-only interpolated position; the **fade
 * animation itself** (opacity 1→0, snap, 0→1) is driven by the Tracker via
 * `adapter.updateOpacity`.
 */
export class AdaptiveInterpolator {
  private readonly linear = new Interpolator('linear');
  private readonly cubic = new Interpolator('cubic');

  constructor(private readonly opts: AdaptiveOptions = {}) {}

  /** Behavior zone for a given period. */
  classify(periodMs: number): AdaptiveBehavior {
    const min = this.opts.minPeriodMs ?? 500;
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
   * Called by the Tracker. Same 5-parameter signature as the built-in
   * Interpolator: `(from, to, ratio, shortestArcHeading?, forceCubic?)`.
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

  /** Signal to the Tracker: "trigger fade behavior for this segment". */
  shouldFade(periodMs: number): boolean {
    return this.classify(periodMs) === 'fade';
  }
}
