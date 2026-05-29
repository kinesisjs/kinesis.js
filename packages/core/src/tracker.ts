import { AdaptiveInterpolator } from './adaptive-interpolator';
import { Clock } from './clock';
import { EventBus } from './event-bus';
import { Interpolator } from './interpolator';
import { haversineDistance, linearLerp, shortestArcDiff } from './math-utils';
import { Sweeper } from './sweeper';
import { WorkerTracker } from './worker-host';
import type {
  CustomInterpolator,
  InterpolationOptions,
  Position,
  SweepResult,
  TrackerError,
  TrackerEventMap,
  TrackerOptions,
  TrackerStats,
  TrailPoint,
  VehicleSlot,
} from './types';

/**
 * Top-level orchestrator for Kinesis.js.
 *
 * Responsibilities:
 *   - Position ingest (validation + throttling + initial-position behavior).
 *   - Tick loop (rAF-driven clock, sanity-checked interpolation).
 *   - Multi-state vehicle lifecycle (integrated with the Sweeper).
 *   - Isolating adapter / interpolator calls (errors surface as events).
 *   - Performance telemetry (p50/p95/p99 ring buffer, dropped ticks, ingest rate).
 *
 * Not its responsibility: map feature lifecycle (adapter), framework reactivity
 * (wrapper), data source (consumer).
 */
export class Tracker {
  private static readonly TICK_HISTORY_SIZE = 100;
  private static readonly DROPPED_TICK_BUDGET_MS = 16;

  private readonly slots = new Map<string, VehicleSlot>();
  private readonly events = new EventBus<TrackerEventMap>();
  // Definite-assignment (`!`): these are assigned in the constructor's normal
  // path. In worker mode the constructor returns a WorkerTracker before
  // reaching that path, so they stay unset — but the returned object is a
  // WorkerTracker and never touches them.
  private readonly clock!: Clock;
  private readonly interpolator!: Interpolator | AdaptiveInterpolator | CustomInterpolator;
  private readonly sweeper!: Sweeper;
  private readonly tickHistory = new Float32Array(Tracker.TICK_HISTORY_SIZE);
  private readonly droppedTickRecent: number[] = [];
  private readonly ingestTimestamps: number[] = [];
  private readonly asyncCache = new Map<
    string,
    { from: TrailPoint; to: TrailPoint; result?: TrailPoint }
  >();

  private stats!: TrackerStats;
  private isRunning = false;
  private startedAt = 0;
  private tickHistoryIndex = 0;

  constructor(private readonly options: TrackerOptions) {
    if (options.worker) {
      // Worker mode: return a WorkerTracker transparently. A constructor may
      // return an object, which becomes the `new` result; WorkerTracker
      // mirrors this class's public surface, so callers see no API difference.
      // Field initializers above still run (cheap, discarded), but the heavy
      // setup below (Clock, Sweeper, interpolator) is skipped.
      return new WorkerTracker(options) as unknown as Tracker;
    }
    this.interpolator = this.buildInterpolator();
    // We swallow the performance.now()-based timestamp the Clock hands back and
    // rely on Date.now() inside tick() instead, because slot.receivedAt is also
    // Date.now()-based — mixing the two clocks would corrupt elapsed/period math.
    this.clock = new Clock(() => this.tick());
    this.sweeper = new Sweeper(
      this.slots,
      options.warningThreshold ?? 60_000,
      options.staleThreshold ?? 600_000,
      options.staleCheckInterval ?? 60_000,
      (result) => this.handleStateChange(result),
    );
    this.stats = this.initStats();
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Feed positions into the system. Validation, throttling, and
   * `initialPositionBehavior` are applied. A slot is created on first sight;
   * subsequent ingests rotate the ring slot (`previous = current`,
   * `current = new`).
   */
  ingest(positions: Position[]): void {
    const start = monotonicNow();
    const now = Date.now();
    const throttle = this.options.ingestThrottle ?? 100;
    let processed = 0;
    let throttled = 0;

    for (const pos of positions) {
      if (!this.validatePosition(pos)) continue;

      const existing = this.slots.get(pos.id);

      if (!existing) {
        this.createSlot(pos, now);
        processed++;
        continue;
      }

      // wait-for-second: the second ingest has arrived → attach now, regardless
      // of throttle. The throttle only suppresses the data update (previous /
      // current shift), not side effects (attach, state recovery).
      if (!existing.isAttached) {
        this.attachToAdapter(pos.id, existing);
      }

      if (now - existing.lastIngestAt < throttle) {
        throttled++;
        continue;
      }

      existing.previous = existing.current;
      existing.current = this.toTrailPoint(pos, now);
      existing.lastIngestAt = now;
      if (existing.state !== 'active') {
        existing.state = 'active';
        // Recovery from warning via fresh ingest; notify adapter immediately
        // so any gap-visual treatment (dim, badge) clears without waiting for
        // the next sweep tick.
        this.options.adapter.setVehicleState?.(pos.id, 'active');
      }

      const ci = this.asCustom();
      if (ci?.prepare && existing.previous) {
        void Promise.resolve(ci.prepare(existing.previous, existing.current)).catch(
          (err: unknown) =>
            this.emitError({
              code: 'INTERPOLATION_ERROR',
              message: 'CustomInterpolator.prepare failed',
              vehicleId: pos.id,
              cause: err instanceof Error ? err : new Error(String(err)),
            }),
        );
      }
      processed++;
    }

    this.stats.lastIngestLatencyMs = monotonicNow() - start;
    this.trackIngestRate(now, processed);
    this.events.emit('ingest', {
      count: processed,
      throttled,
      latency: this.stats.lastIngestLatencyMs,
    });
  }

  /** Start the tick loop and the stale-sweeper. Idempotent. Emits `start`. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startedAt = Date.now();
    this.clock.start();
    this.sweeper.start();
    this.events.emit('start');
  }

  /** Pause the tick loop and sweeper without tearing anything down. Emits `stop`. */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.clock.stop();
    this.sweeper.stop();
    this.events.emit('stop');
  }

  /**
   * Tear everything down: stop the loops, clear all slots, call
   * `adapter.destroy()` and the CustomInterpolator's `dispose()`, and drop all
   * listeners. Emits `destroy` (then removes listeners). Not reusable afterward.
   */
  destroy(): void {
    this.stop();
    this.slots.clear();
    this.asyncCache.clear();
    try {
      this.options.adapter.destroy();
    } catch (err) {
      this.emitError({
        code: 'ADAPTER_ERROR',
        message: 'adapter.destroy failed',
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
    this.asCustom()?.dispose?.();
    this.events.emit('destroy');
    this.events.removeAllListeners();
  }

  /**
   * Subscribe to a tracker event. Returns an unsubscribe function — call it to
   * remove the handler (or rely on `destroy()`, which drops every listener).
   */
  on<K extends keyof TrackerEventMap>(
    event: K,
    handler: (payload: TrackerEventMap[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  /**
   * Mark a vehicle as 'completed' (planned end of a shift, finished delivery,
   * etc.). The feature is removed from the map and a 'vehiclecompleted' event
   * is emitted.
   */
  markCompleted(vehicleId: string): boolean {
    const slot = this.slots.get(vehicleId);
    if (!slot) return false;
    this.handleStateChange({
      vehicleId,
      state: 'completed',
      lastSeen: slot.lastIngestAt,
      reason: 'manually marked completed',
    });
    return true;
  }

  /**
   * Remove a vehicle immediately (e.g. user dismissed it). Calls
   * `adapter.removeVehicle` and emits `vehicleremoved`. Returns `false` if the
   * id is unknown. For a planned end-of-shift, prefer {@link markCompleted}.
   */
  removeVehicle(vehicleId: string): boolean {
    if (!this.slots.has(vehicleId)) return false;
    this.slots.delete(vehicleId);
    this.asyncCache.delete(vehicleId);
    try {
      this.options.adapter.removeVehicle(vehicleId);
    } catch (err) {
      this.emitError({
        code: 'ADAPTER_ERROR',
        message: 'removeVehicle failed',
        vehicleId,
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
    this.events.emit('vehicleremoved', { vehicleId });
    return true;
  }

  /**
   * Snapshot of runtime telemetry (vehicle count, fps, tick p50/p95/p99,
   * dropped ticks, ingest rate, memory breakdown). Recomputed on each call and
   * returned frozen. Foundation for the planned devtools panel.
   */
  getStats(): Readonly<TrackerStats> {
    this.refreshStats();
    return Object.freeze({ ...this.stats });
  }

  /** Test helper: run a single tick manually. */
  tickOnce(): void {
    this.tick();
  }

  // ─── Tick loop ────────────────────────────────────────────────────────

  private tick(): void {
    const tickStart = monotonicNow();
    const now = Date.now();
    let activeCount = 0;

    for (const [vehicleId, slot] of this.slots) {
      if (!slot.current || !slot.isAttached) continue;

      if (!slot.previous) {
        this.safeUpdate(vehicleId, slot.current);
        activeCount++;
        continue;
      }

      const period = slot.current.receivedAt - slot.previous.receivedAt;

      // Same-millisecond / out-of-order ingests carry no time signal — snap to
      // current. This also avoids a period=0 division-by-zero and spurious
      // sanity-check positives.
      if (period <= 0) {
        this.safeUpdate(vehicleId, slot.current);
        activeCount++;
        continue;
      }

      // Distance sanity check (anomalous jump → fade).
      const distance = haversineDistance(slot.previous, slot.current);
      const speedMs = ((slot.previous.speed ?? 50) * 1000) / 3600;
      const maxRealistic = speedMs * (period / 1000) * 1.5;
      if (distance > 100 && distance > maxRealistic) {
        this.handleAnomalousJump(vehicleId, slot);
        activeCount++;
        continue;
      }

      // Heading sanity check (sharp turn → single-tick cubic easing).
      let forceCubic = false;
      if (
        slot.previous.heading !== undefined &&
        slot.current.heading !== undefined &&
        Math.abs(shortestArcDiff(slot.previous.heading, slot.current.heading)) > 90 &&
        (this.options.interpolation === 'linear' ||
          this.options.interpolation === undefined ||
          this.options.interpolation === 'adaptive')
      ) {
        forceCubic = true;
      }

      const maxGap = this.options.maxInterpolationGap ?? 30_000;
      if (period > maxGap && !this.isAdaptive()) {
        this.safeUpdate(vehicleId, slot.current);
        activeCount++;
        continue;
      }

      // Render-side interpolation buffer (see TrackerOptions.renderLagMs).
      // Without this, current.receivedAt == now at ingest, elapsed >= period
      // would always hold, and the tick would only ever snap.
      const renderLag = this.options.renderLagMs ?? 1000;
      const renderTime = now - renderLag;
      const elapsed = renderTime - slot.previous.receivedAt;

      if (elapsed >= period) {
        this.safeUpdate(vehicleId, slot.current);
      } else if (elapsed > 0) {
        const ratio = elapsed / period;
        const opts: InterpolationOptions = {
          shortestArcHeading: this.options.shortestArcHeading ?? true,
          vehicleId,
        };
        const point = this.computeInterpolated(
          vehicleId,
          slot.previous,
          slot.current,
          ratio,
          opts,
          forceCubic,
        );
        if (point) this.safeUpdate(vehicleId, point);
      } else {
        // renderTime still before previous.receivedAt — within the lag warm-up;
        // hold at previous so the marker stays visible.
        this.safeUpdate(vehicleId, slot.previous);
      }
      activeCount++;
    }

    const tickDuration = monotonicNow() - tickStart;
    this.recordTick(tickDuration);
    this.stats.lastTickDurationMs = tickDuration;
    this.stats.fps = this.clock.getFps();
    this.events.emit('tick', { time: now, activeCount });
  }

  // ─── Internal helpers ─────────────────────────────────────────────────

  private buildInterpolator(): Interpolator | AdaptiveInterpolator | CustomInterpolator {
    const mode = this.options.interpolation ?? 'linear';
    if (typeof mode === 'object') return mode;
    if (mode === 'adaptive') {
      return new AdaptiveInterpolator(this.options.adaptive ?? {});
    }
    return new Interpolator(mode);
  }

  private createSlot(pos: Position, now: number): void {
    const initial = this.toTrailPoint(pos, now);
    const slot: VehicleSlot = {
      previous: null,
      current: initial,
      lastIngestAt: now,
      state: 'active',
      isAttached: false,
    };
    this.slots.set(pos.id, slot);

    const behavior = this.options.initialPositionBehavior ?? 'show-immediately';
    if (behavior === 'show-immediately' || behavior === 'fade-in') {
      this.attachToAdapter(pos.id, slot);
      if (behavior === 'fade-in' && typeof this.options.adapter.updateOpacity === 'function') {
        this.animateOpacity(pos.id, 0, 1, this.options.fadeAnimation?.duration ?? 800);
      }
    }
    // 'wait-for-second' → addVehicle is deferred to the second ingest.
  }

  private attachToAdapter(id: string, slot: VehicleSlot): void {
    if (slot.isAttached || !slot.current) return;
    try {
      this.options.adapter.addVehicle(id, slot.current);
      slot.isAttached = true;
      this.events.emit('vehicleadded', { vehicleId: id });
    } catch (err) {
      this.emitError({
        code: 'ADAPTER_ERROR',
        message: 'addVehicle failed',
        vehicleId: id,
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  private safeUpdate(id: string, point: TrailPoint): void {
    try {
      this.options.adapter.updatePosition(id, point);
    } catch (err) {
      this.emitError({
        code: 'ADAPTER_ERROR',
        message: 'updatePosition failed',
        vehicleId: id,
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  private computeInterpolated(
    vehicleId: string,
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    opts: InterpolationOptions,
    forceCubic: boolean,
  ): TrailPoint | null {
    const ci = this.asCustom();
    if (ci) {
      try {
        const result = ci.compute(from, to, ratio, opts);
        if (result instanceof Promise) {
          this.asyncCache.set(vehicleId, { from, to });
          result
            .then((p) => {
              const pending = this.asyncCache.get(vehicleId);
              if (pending) pending.result = p;
            })
            .catch((err: unknown) =>
              this.emitError({
                code: 'INTERPOLATION_ERROR',
                message: 'CustomInterpolator async compute failed',
                vehicleId,
                cause: err instanceof Error ? err : new Error(String(err)),
              }),
            );
          const cached = this.asyncCache.get(vehicleId)?.result;
          return cached ?? linearLerp(from, to, ratio, opts.shortestArcHeading ?? true);
        }
        return result;
      } catch (err) {
        this.emitError({
          code: 'INTERPOLATION_ERROR',
          message: 'CustomInterpolator.compute failed',
          vehicleId,
          cause: err instanceof Error ? err : new Error(String(err)),
        });
        return linearLerp(from, to, ratio, opts.shortestArcHeading ?? true);
      }
    }

    try {
      const interp = this.interpolator as Interpolator | AdaptiveInterpolator;
      return interp.compute(from, to, ratio, opts.shortestArcHeading ?? true, forceCubic);
    } catch (err) {
      this.emitError({
        code: 'INTERPOLATION_ERROR',
        message: 'compute failed',
        vehicleId,
        cause: err instanceof Error ? err : new Error(String(err)),
      });
      return null;
    }
  }

  private handleAnomalousJump(vehicleId: string, slot: VehicleSlot): void {
    const adapter = this.options.adapter;
    const dur = this.options.fadeAnimation?.duration ?? 800;
    if (typeof adapter.updateOpacity === 'function' && slot.current) {
      this.animateOpacity(vehicleId, 1, 0, dur / 2);
      setTimeout(() => {
        if (slot.current) this.safeUpdate(vehicleId, slot.current);
        this.animateOpacity(vehicleId, 0, 1, dur / 2);
      }, dur / 2);
    } else if (slot.current) {
      this.safeUpdate(vehicleId, slot.current);
    }
  }

  private animateOpacity(id: string, from: number, to: number, duration: number): void {
    const update = this.options.adapter.updateOpacity;
    if (!update) return;
    const easing = this.options.fadeAnimation?.easing ?? 'ease-in-out';
    const start = monotonicNow();
    const step = (): void => {
      const t = Math.min(1, (monotonicNow() - start) / Math.max(1, duration));
      const eased = easing === 'linear' ? t : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      try {
        update.call(this.options.adapter, id, from + (to - from) * eased);
      } catch (err) {
        this.emitError({
          code: 'ADAPTER_ERROR',
          message: 'updateOpacity failed',
          vehicleId: id,
          cause: err instanceof Error ? err : new Error(String(err)),
        });
        return;
      }
      if (t < 1 && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(step);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(step);
    } else {
      // Node test environment — no rAF; apply the final value in one shot.
      try {
        update.call(this.options.adapter, id, to);
      } catch {
        // Swallow silently — no rAF to drive the animation anyway.
      }
    }
  }

  private handleStateChange(result: SweepResult): void {
    const slot = this.slots.get(result.vehicleId);
    if (!slot) return;
    slot.state = result.state;

    switch (result.state) {
      case 'warning':
        this.options.adapter.setVehicleState?.(result.vehicleId, 'warning');
        this.events.emit('vehiclewarning', {
          vehicleId: result.vehicleId,
          lastSeen: result.lastSeen,
        });
        return;
      case 'stale':
      case 'completed': {
        this.slots.delete(result.vehicleId);
        this.asyncCache.delete(result.vehicleId);
        try {
          this.options.adapter.removeVehicle(result.vehicleId);
        } catch (err) {
          this.emitError({
            code: 'ADAPTER_ERROR',
            message: 'removeVehicle failed',
            vehicleId: result.vehicleId,
            cause: err instanceof Error ? err : new Error(String(err)),
          });
        }
        if (result.state === 'stale') {
          this.events.emit('vehiclestale', { vehicleId: result.vehicleId });
          this.stats.staleRemovedTotal++;
        } else {
          this.events.emit('vehiclecompleted', { vehicleId: result.vehicleId });
        }
        return;
      }
      case 'active':
        // Recovered from warning via sweeper — notify adapter so gap-visual
        // treatment clears. (Ingest also fires this path immediately when a
        // fresh ingest is what triggered the recovery; both are idempotent.)
        this.options.adapter.setVehicleState?.(result.vehicleId, 'active');
        return;
    }
  }

  private toTrailPoint(pos: Position, now: number): TrailPoint {
    const result: TrailPoint = {
      lng: pos.lng,
      lat: pos.lat,
      ts: pos.timestamp ?? now,
      receivedAt: now,
    };
    if (pos.speed !== undefined) result.speed = pos.speed;
    if (pos.heading !== undefined) result.heading = pos.heading;
    if (pos.meta !== undefined) result.meta = pos.meta;
    return result;
  }

  private validatePosition(pos: Position): boolean {
    if (!pos || !pos.id || typeof pos.id !== 'string') {
      this.emitError({
        code: 'INVALID_POSITION',
        message: `Invalid vehicle id: ${String(pos?.id)}`,
        context: { position: pos as unknown as Record<string, unknown> },
      });
      return false;
    }
    if (!Number.isFinite(pos.lng) || !Number.isFinite(pos.lat)) {
      this.emitError({
        code: 'INVALID_POSITION',
        message: 'Non-finite coordinates',
        vehicleId: pos.id,
        context: { lng: pos.lng, lat: pos.lat },
      });
      return false;
    }
    if (pos.lng < -180 || pos.lng > 180 || pos.lat < -90 || pos.lat > 90) {
      this.emitError({
        code: 'INVALID_POSITION',
        message: 'Coordinates out of range',
        vehicleId: pos.id,
        context: { lng: pos.lng, lat: pos.lat },
      });
      return false;
    }
    return true;
  }

  private emitError(err: TrackerError): void {
    this.events.emit('error', err);
  }

  private asCustom(): CustomInterpolator | null {
    if (
      this.interpolator instanceof Interpolator ||
      this.interpolator instanceof AdaptiveInterpolator
    ) {
      return null;
    }
    return this.interpolator;
  }

  private isAdaptive(): boolean {
    return this.interpolator instanceof AdaptiveInterpolator;
  }

  // ─── Performance ring buffer ─────────────────────────────────────────

  private recordTick(durationMs: number): void {
    this.tickHistory[this.tickHistoryIndex] = durationMs;
    this.tickHistoryIndex = (this.tickHistoryIndex + 1) % Tracker.TICK_HISTORY_SIZE;
    if (durationMs > Tracker.DROPPED_TICK_BUDGET_MS) {
      const ts = Date.now();
      this.droppedTickRecent.push(ts);
      this.stats.performanceMetrics.droppedTicks++;
      const cutoff = ts - 60_000;
      trimOlderThan(this.droppedTickRecent, cutoff);
    }
  }

  private trackIngestRate(now: number, processed: number): void {
    for (let i = 0; i < processed; i++) this.ingestTimestamps.push(now);
    trimOlderThan(this.ingestTimestamps, now - 60_000);
  }

  private refreshStats(): void {
    this.stats.vehicleCount = this.slots.size;
    this.stats.totalBufferedPoints = this.slots.size * 2;
    this.stats.uptime = this.startedAt ? Date.now() - this.startedAt : 0;

    const slotsBytes = this.slots.size * 184;
    const adapterBytes =
      typeof this.options.adapter.getMemoryEstimate === 'function'
        ? this.options.adapter.getMemoryEstimate()
        : this.slots.size * 64;
    this.stats.memoryBreakdown.slotsBytes = slotsBytes;
    this.stats.memoryBreakdown.adapterEstimateBytes = adapterBytes;
    this.stats.memoryEstimateBytes = slotsBytes + adapterBytes;

    const samples: number[] = [];
    for (let i = 0; i < this.tickHistory.length; i++) {
      const v = this.tickHistory[i];
      if (v !== undefined && v > 0) samples.push(v);
    }
    samples.sort((a, b) => a - b);
    this.stats.performanceMetrics.tickHistoryP50 = percentile(samples, 0.5);
    this.stats.performanceMetrics.tickHistoryP95 = percentile(samples, 0.95);
    this.stats.performanceMetrics.tickHistoryP99 = percentile(samples, 0.99);
    this.stats.performanceMetrics.ingestRate = this.ingestTimestamps.length / 60;
    this.stats.performanceMetrics.droppedTicksLast60s = this.droppedTickRecent.length;
  }

  private initStats(): TrackerStats {
    return {
      vehicleCount: 0,
      totalBufferedPoints: 0,
      fps: 0,
      lastTickDurationMs: 0,
      lastIngestLatencyMs: 0,
      memoryEstimateBytes: 0,
      staleRemovedTotal: 0,
      uptime: 0,
      memoryBreakdown: {
        slotsBytes: 0,
        eventListenersBytes: 0,
        adapterEstimateBytes: 0,
      },
      performanceMetrics: {
        tickHistoryP50: 0,
        tickHistoryP95: 0,
        tickHistoryP99: 0,
        ingestRate: 0,
        droppedTicks: 0,
        droppedTicksLast60s: 0,
      },
    };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function trimOlderThan(stamps: number[], cutoff: number): void {
  while (stamps.length) {
    const head = stamps[0];
    if (head === undefined || head >= cutoff) return;
    stamps.shift();
  }
}

function monotonicNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
