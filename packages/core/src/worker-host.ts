import { EventBus } from './event-bus';
import type {
  Position,
  TrackAdapter,
  TrackerEventMap,
  TrackerOptions,
  TrackerStats,
} from './types';
import type {
  AdapterCall,
  MainToWorkerMessage,
  SerializableTrackerOptions,
  WorkerToMainMessage,
} from './worker-protocol';

/**
 * Injected at build time (see tsup.config.ts): the bundled worker-script as a
 * string, used to spin up the worker from an inline Blob with zero consumer
 * setup. Falls back to `undefined` when running from un-built source — in that
 * case `worker: true` throws and the caller must pass `worker: { url }`.
 */
declare const __KINESIS_WORKER_SOURCE__: string | undefined;

/**
 * Main-thread stand-in for {@link Tracker} when `worker: true` (or
 * `worker: { url }`) is set. Mirrors Tracker's public surface exactly so
 * `new Tracker({ worker: true })` can return a WorkerTracker transparently.
 *
 * The real Tracker runs in the worker; this class owns the real adapter and
 * applies the adapter calls the worker streams back, re-emits Tracker events
 * on a local EventBus, and caches the periodic stats snapshot.
 */
export class WorkerTracker {
  private readonly worker: Worker;
  private readonly adapter: TrackAdapter;
  private readonly events = new EventBus<TrackerEventMap>();
  private blobUrl: string | null = null;
  private latestStats: TrackerStats = emptyStats();
  private destroyed = false;

  constructor(options: TrackerOptions) {
    if (typeof options.interpolation === 'object') {
      throw new Error(
        'Kinesis.js: worker mode does not support a CustomInterpolator (functions ' +
          'cannot cross the worker boundary). Use a built-in interpolation mode, or ' +
          'run without worker: true.',
      );
    }
    if (typeof Worker === 'undefined') {
      throw new Error(
        'Kinesis.js: worker mode requires the Web Worker API, which is unavailable in ' +
          'this environment (e.g. server-side rendering). Run without worker: true here.',
      );
    }

    this.adapter = options.adapter;
    this.worker = this.spawnWorker(options.worker);
    this.worker.onmessage = (e: MessageEvent<WorkerToMainMessage>): void =>
      this.handleWorkerMessage(e.data);
    this.worker.onerror = (e: ErrorEvent): void => {
      this.events.emit('error', {
        code: 'WORKER_ERROR',
        message: e.message || 'Worker crashed',
        context: { filename: e.filename, lineno: e.lineno },
      });
    };

    this.send({ type: 'init', options: toSerializable(options) });
  }

  // ─── Public API (mirrors Tracker) ─────────────────────────────────────

  ingest(positions: Position[]): void {
    this.send({ type: 'ingest', positions });
  }

  start(): void {
    this.send({ type: 'start' });
  }

  stop(): void {
    this.send({ type: 'stop' });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.send({ type: 'destroy' });
    try {
      this.adapter.destroy();
    } catch {
      // adapter teardown errors are non-fatal during destroy
    }
    this.worker.terminate();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.events.removeAllListeners();
  }

  on<K extends keyof TrackerEventMap>(
    event: K,
    handler: (payload: TrackerEventMap[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  markCompleted(vehicleId: string): boolean {
    // Optimistic: the slot lives in the worker, so we can't synchronously
    // confirm it exists. We forward the command and report success.
    this.send({ type: 'markCompleted', vehicleId });
    return true;
  }

  removeVehicle(vehicleId: string): boolean {
    this.send({ type: 'removeVehicle', vehicleId });
    return true;
  }

  getStats(): Readonly<TrackerStats> {
    // Last snapshot pushed by the worker (every ~30 ticks). Slightly stale by
    // design — see the worker-mode note in TrackerOptions.worker.
    return Object.freeze({ ...this.latestStats });
  }

  /**
   * No-op in worker mode: the tick loop is driven by the worker's own clock,
   * so there's no main-thread tick to advance manually. (Tracker exposes this
   * as a test helper; it isn't part of the runtime contract.)
   */
  tickOnce(): void {
    // intentionally empty
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private send(message: MainToWorkerMessage): void {
    if (this.destroyed && message.type !== 'destroy') return;
    this.worker.postMessage(message);
  }

  private handleWorkerMessage(msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case 'adapter':
        this.applyAdapterCalls(msg.calls);
        break;
      case 'event':
        this.events.emit(msg.name, msg.payload as TrackerEventMap[typeof msg.name]);
        break;
      case 'stats':
        this.latestStats = msg.stats;
        break;
      case 'ready':
        // init handshake complete; nothing to do — commands are FIFO-ordered
        // after init, so we never had to queue them.
        break;
    }
  }

  private applyAdapterCalls(calls: AdapterCall[]): void {
    for (const c of calls) {
      try {
        switch (c.call) {
          case 'addVehicle':
            this.adapter.addVehicle(c.id, c.point);
            break;
          case 'updatePosition':
            this.adapter.updatePosition(c.id, c.point);
            break;
          case 'removeVehicle':
            this.adapter.removeVehicle(c.id);
            break;
          case 'setVehicleState':
            this.adapter.setVehicleState?.(c.id, c.state);
            break;
        }
      } catch (err) {
        this.events.emit('error', {
          code: 'ADAPTER_ERROR',
          message: `adapter.${c.call} failed`,
          vehicleId: 'id' in c ? c.id : undefined,
          cause: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }

  private spawnWorker(workerOpt: TrackerOptions['worker']): Worker {
    if (workerOpt && typeof workerOpt === 'object' && 'url' in workerOpt) {
      return new Worker(workerOpt.url, { type: 'module' });
    }

    const source = typeof __KINESIS_WORKER_SOURCE__ === 'string' ? __KINESIS_WORKER_SOURCE__ : '';
    if (!source) {
      throw new Error(
        'Kinesis.js: inline worker source is unavailable (likely running from un-built ' +
          'source). Pass worker: { url } pointing at the bundled worker script, or use the ' +
          'published package where the worker is inlined.',
      );
    }
    const blob = new Blob([source], { type: 'application/javascript' });
    this.blobUrl = URL.createObjectURL(blob);
    return new Worker(this.blobUrl);
  }
}

/** Strip non-cloneable fields (adapter, custom interpolator) before postMessage. */
function toSerializable(options: TrackerOptions): SerializableTrackerOptions {
  const out: SerializableTrackerOptions = {};
  if (typeof options.interpolation === 'string') out.interpolation = options.interpolation;
  if (options.adaptive) out.adaptive = options.adaptive;
  if (options.fadeAnimation) out.fadeAnimation = options.fadeAnimation;
  if (options.maxInterpolationGap !== undefined)
    out.maxInterpolationGap = options.maxInterpolationGap;
  if (options.warningThreshold !== undefined) out.warningThreshold = options.warningThreshold;
  if (options.staleThreshold !== undefined) out.staleThreshold = options.staleThreshold;
  if (options.staleCheckInterval !== undefined) out.staleCheckInterval = options.staleCheckInterval;
  if (options.ingestThrottle !== undefined) out.ingestThrottle = options.ingestThrottle;
  if (options.initialPositionBehavior !== undefined)
    out.initialPositionBehavior = options.initialPositionBehavior;
  if (options.shortestArcHeading !== undefined) out.shortestArcHeading = options.shortestArcHeading;
  if (options.renderLagMs !== undefined) out.renderLagMs = options.renderLagMs;
  if (options.playout !== undefined) out.playout = options.playout;
  return out;
}

function emptyStats(): TrackerStats {
  return {
    vehicleCount: 0,
    totalBufferedPoints: 0,
    fps: 0,
    lastTickDurationMs: 0,
    lastIngestLatencyMs: 0,
    memoryEstimateBytes: 0,
    staleRemovedTotal: 0,
    uptime: 0,
    memoryBreakdown: { slotsBytes: 0, eventListenersBytes: 0, adapterEstimateBytes: 0 },
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
