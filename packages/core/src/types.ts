/**
 * Raw position payload supplied by the consumer.
 */
export interface Position {
  /** Unique vehicle identifier (e.g. plate, internal ID). */
  id: string;
  /** Longitude in WGS84. */
  lng: number;
  /** Latitude in WGS84. */
  lat: number;
  /** Server-side timestamp (epoch ms). Filled in during ingest if absent. */
  timestamp?: number;
  /** Speed in km/h (optional). */
  speed?: number;
  /** Heading in degrees, 0–360 (optional). */
  heading?: number;
  /** Consumer-defined metadata. */
  meta?: Record<string, unknown>;
}

/**
 * Position enriched with internal bookkeeping; what the library keeps in its
 * per-vehicle ring buffer.
 */
export interface TrailPoint {
  lng: number;
  lat: number;
  /** Data timestamp (epoch ms). */
  ts: number;
  speed?: number;
  heading?: number;
  /** When the client received the position (epoch ms). */
  receivedAt: number;
  meta?: Record<string, unknown>;
}

/**
 * Sweeper-tracked lifecycle state of a vehicle.
 *
 * - 'active'    : Last ingest is recent (idle < warningThreshold).
 * - 'warning'   : Data has stopped arriving but the slot isn't stale yet; the
 *                 feature stays on the map.
 * - 'stale'     : staleThreshold exceeded; adapter.removeVehicle is invoked.
 * - 'completed' : Manually marked via `tracker.markCompleted(id)`.
 */
export type VehicleState = 'active' | 'warning' | 'stale' | 'completed';

export interface SweepResult {
  vehicleId: string;
  state: VehicleState;
  lastSeen: number;
  reason: string;
}

/**
 * Position + the scheduled time it should be reached, used by the playout
 * buffer to convert variable ingest spacing into a constant render rate.
 */
export interface PlayoutQueueEntry {
  point: TrailPoint;
  /** Wall-clock ms (Date.now domain) when this point becomes the segment endpoint. */
  playoutAt: number;
}

/**
 * Fixed-size per-vehicle slot (ring pattern).
 */
export interface VehicleSlot {
  /**
   * Position before {@link previous}. Needed by `interpolation: 'smooth'`
   * (3-point Catmull-Rom) for tangent shaping at `previous`. Null until
   * the third ingest lands; smooth mode falls back to linear while it is.
   */
  previous2: TrailPoint | null;
  previous: TrailPoint | null;
  current: TrailPoint | null;
  lastIngestAt: number;
  state: VehicleState;
  /** Whether `Adapter.addVehicle` has been called yet — critical for the
   *  `wait-for-second` initial-position behavior. */
  isAttached: boolean;
  /**
   * Playout buffer (FIFO of scheduled positions). Populated only when
   * `TrackerOptions.playout` is set; absent for the classical real-time
   * path. Adjacent entries are spaced exactly `pace` ms apart, so tick()
   * renders at a constant rate regardless of how irregular ingest arrival
   * is.
   */
  playoutQueue?: PlayoutQueueEntry[];
  /** `playoutAt` to assign to the next incoming ingest for this vehicle. */
  nextPlayoutAt?: number;
  /**
   * Sliding window of the last few ingest gap measurements (ms), used by
   * `playout: 'auto'` to converge on a `pace` / `bufferMs` per vehicle.
   * Absent when playout is off or manual.
   */
  playoutSamples?: number[];
}

/**
 * Behavior when the very first position for a vehicle arrives.
 */
export type InitialPositionBehavior = 'show-immediately' | 'wait-for-second' | 'fade-in';

/**
 * Built-in interpolation modes (excluding custom interpolators and 'adaptive').
 *
 * - `linear`   : Straight-line lerp between the two latest points.
 * - `cubic`    : Smoothstep easing on the same two points.
 * - `geodesic` : Great-circle arc (ships, aircraft).
 * - `none`     : Snap to the latest point with no in-between motion.
 * - `smooth`   : 3-point centripetal Catmull-Rom over `previous2 → previous
 *               → current`, so direction changes at `previous` round off
 *               instead of kinking. Until the third ingest lands, falls
 *               back to `linear` (no extra history yet to shape with).
 */
export type InterpolationMode = 'linear' | 'cubic' | 'geodesic' | 'none' | 'smooth';

export interface InterpolationOptions {
  shortestArcHeading?: boolean;
  vehicleId?: string;
}

/**
 * User-supplied interpolation logic (route-aware, ML, dead-reckoning, etc.).
 */
export interface CustomInterpolator {
  compute(
    from: TrailPoint,
    to: TrailPoint,
    ratio: number,
    options?: InterpolationOptions,
  ): TrailPoint | Promise<TrailPoint>;

  prepare?(from: TrailPoint, to: TrailPoint): Promise<void> | void;

  dispose?(): void;
}

export interface AdaptiveOptions {
  minPeriodMs?: number;
  maxPeriodMs?: number;
  fadeThresholdMs?: number;
  snapThresholdMs?: number;
}

export type AdaptiveBehavior = 'none' | 'linear' | 'fade' | 'snap';

export type TrackerErrorCode =
  | 'INVALID_POSITION'
  | 'ADAPTER_ERROR'
  | 'INTERPOLATION_ERROR'
  | 'WORKER_ERROR'
  | 'INTERNAL_ERROR';

export interface TrackerError {
  code: TrackerErrorCode;
  message: string;
  vehicleId?: string;
  context?: Record<string, unknown>;
  cause?: Error;
}

export interface FadeAnimationOptions {
  /** Animation duration in ms. Default: 800. */
  duration?: number;
  /** Easing function. Default: 'ease-in-out'. */
  easing?: 'linear' | 'ease-in-out';
}

/**
 * Configuration for the playout buffer — turns a variable-period (jittery)
 * ingest stream into a constant-rate render so the marker no longer speeds
 * up and slows down with each segment.
 *
 * Trade-off: `bufferMs` of additional perceived latency in exchange for
 * smooth motion. Pick `bufferMs >= worstCaseGap` to avoid buffer underrun
 * (which would freeze the marker until the next ingest arrives).
 */
export interface PlayoutOptions {
  /**
   * Wall-clock ms each segment should occupy. Constant across segments
   * regardless of input timing. Typical: the expected average ingest
   * period (e.g. 1000 for a nominally 1 Hz feed).
   */
  pace: number;
  /**
   * How far behind real time the first ingest is scheduled. Acts as
   * jitter absorption — a 10 s gap won't underrun a 12 s buffer.
   * Rule of thumb: pick `worstCaseGap × 1.5`.
   */
  bufferMs: number;
  /**
   * Maximum queue length per vehicle. Caps memory under bursty inputs.
   * When the queue is full, the oldest already-played entry is dropped.
   * Default: 20.
   */
  maxQueue?: number;
}

/**
 * Tracker configuration.
 */
export interface TrackerOptions {
  /**
   * Interpolation behavior.
   * - 'linear' (default): Straight-line lerp.
   * - 'cubic'           : Smoothstep easing.
   * - 'geodesic'        : Great-circle arc (ships, aircraft).
   * - 'none'            : Direct `setCoordinates`, no interpolation.
   * - 'adaptive'        : Period-aware (none / linear / fade / snap) — recommended.
   * - CustomInterpolator: User-supplied implementation.
   */
  interpolation?: InterpolationMode | 'adaptive' | CustomInterpolator;

  /** Thresholds for the 'adaptive' mode. */
  adaptive?: AdaptiveOptions;

  /** Fade animation settings (fade behavior + 'fade-in' initialPositionBehavior). */
  fadeAnimation?: FadeAnimationOptions;

  /**
   * If the gap between two points exceeds this value, the standard
   * interpolation is skipped. Adaptive mode uses its own zone thresholds.
   * Default: 30000 (30 seconds).
   */
  maxInterpolationGap?: number;

  /**
   * A vehicle transitions to 'warning' state after this much idle time.
   * Default: 60000 (60 seconds).
   */
  warningThreshold?: number;

  /**
   * A vehicle is considered 'stale' after this much idle time and gets removed.
   * Default: 600000 (10 minutes).
   */
  staleThreshold?: number;

  /** Sweeper check interval. Default: 60000 ms. */
  staleCheckInterval?: number;

  /**
   * Minimum ingest interval per vehicleId (ms). Default: 100.
   * Subsequent ingests within this window are dropped and counted under
   * `throttled` on the 'ingest' event.
   */
  ingestThrottle?: number;

  /** Initial-position behavior. Default: 'show-immediately'. */
  initialPositionBehavior?: InitialPositionBehavior;

  /** Use the shortest-arc path when interpolating heading. Default: true. */
  shortestArcHeading?: boolean;

  /**
   * Render-side interpolation buffer (ms). The marker is rendered at the
   * position corresponding to `now - renderLagMs`.
   *
   * Without this, `current.receivedAt = now` the moment a new position is
   * ingested, so `elapsed = now - previous.receivedAt ≥ period` is always
   * true and the tick degenerates to snapping — interpolation **never runs**
   * in real-time scenarios.
   *
   * Sensible default: roughly the expected ingest period (e.g. 1000 for a
   * 1 Hz feed). At that value, the moment a new "current" is ingested,
   * `renderTime ≈ previous.receivedAt`, and the marker slides smoothly from
   * previous to current until the next ingest arrives.
   *
   * Setting this to 0 disables the buffer (legacy v0.1.0 behavior; real-time
   * interpolation does not run, the marker simply teleports).
   *
   * Default: 1000.
   */
  renderLagMs?: number;

  /**
   * Playout buffer: decouple display rate from arrival rate so a jittery
   * feed (1–10 s gaps, replay scrubbing, retry storms) renders at a
   * steady pace instead of speeding up and slowing down with each
   * segment. Opt-in; absent → classical real-time path (no behaviour
   * change).
   *
   * - Object form: pick `pace` (display interval per segment) and
   *   `bufferMs` (latency floor) yourself. Best when you know your
   *   feed's worst-case gap.
   * - `'auto'`: Tracker measures the last ~10 ingest periods per
   *   vehicle and sets `pace = avg`, `bufferMs = max × 1.5`. Until it
   *   has at least ~5 samples it falls back to the classical path,
   *   then engages playout.
   *
   * Render-lag (`renderLagMs`) is ignored while playout is active —
   * `bufferMs` plays the same role and would otherwise double up.
   */
  playout?: PlayoutOptions | 'auto';

  /**
   * Run the tick loop (interpolation, sanity checks, sweeper) inside a Web
   * Worker, off the main thread. The adapter stays on the main thread and is
   * driven by messages the worker streams back, so the UI thread only does
   * the actual DOM/map writes.
   *
   * - `false` (default): everything runs on the main thread.
   * - `true`: spin up the worker from an inlined Blob — zero setup, but adds
   *   the worker bundle (~a few KB) to the main package.
   * - `{ url }`: load the bundled worker script from a URL you control (e.g.
   *   `new URL('./kinesis.worker.js', import.meta.url)`), avoiding the inline
   *   payload.
   *
   * Worker-mode caveats:
   * - A `CustomInterpolator` is not supported (functions can't cross the
   *   worker boundary) — construction throws if both are set.
   * - `updateOpacity`-based fade animations degrade to snapping (rAF is a
   *   main-thread concern).
   * - `getStats()` returns a snapshot refreshed every ~30 ticks, so it lags
   *   real time slightly.
   */
  worker?: boolean | { url: string | URL };

  /** Adapter instance. */
  adapter: TrackAdapter;
}

/**
 * Contract every map adapter must implement.
 */
export interface TrackAdapter {
  addVehicle(id: string, initialPoint: TrailPoint): void;
  updatePosition(id: string, point: TrailPoint): void;
  removeVehicle(id: string): void;
  destroy(): void;

  /** Optional: update marker opacity (0..1). Used by the fade behavior. */
  updateOpacity?(id: string, opacity: number): void;

  /**
   * Optional: invoked whenever a vehicle's lifecycle state changes
   * (active ↔ warning, → stale → removeVehicle, → completed → removeVehicle).
   *
   * Adapters can use this hook to render gap visualization — e.g. dimming
   * the marker in `warning` state and restoring opacity on recovery. The
   * `stale` and `completed` states are immediately followed by
   * `removeVehicle`, so adapters don't have to handle them visually.
   */
  setVehicleState?(id: string, state: VehicleState): void;

  /** Optional: adapter-side memory estimate in bytes (surfaced via getStats). */
  getMemoryEstimate?(): number;
}

/**
 * Event names and payload shapes.
 */
export type TrackerEventMap = {
  tick: { time: number; activeCount: number };
  vehicleadded: { vehicleId: string };
  vehiclewarning: { vehicleId: string; lastSeen: number };
  vehiclestale: { vehicleId: string };
  vehiclecompleted: { vehicleId: string };
  vehicleremoved: { vehicleId: string };
  ingest: { count: number; throttled: number; latency: number };
  error: TrackerError;
  start: void;
  stop: void;
  destroy: void;
};

/**
 * Runtime statistics (devtools + benchmarks).
 */
export interface TrackerStats {
  vehicleCount: number;
  totalBufferedPoints: number;
  fps: number;
  lastTickDurationMs: number;
  lastIngestLatencyMs: number;
  memoryEstimateBytes: number;
  staleRemovedTotal: number;
  uptime: number;

  memoryBreakdown: {
    slotsBytes: number;
    eventListenersBytes: number;
    adapterEstimateBytes: number;
  };

  performanceMetrics: {
    tickHistoryP50: number;
    tickHistoryP95: number;
    tickHistoryP99: number;
    ingestRate: number;
    droppedTicks: number;
    droppedTicksLast60s: number;
  };
}
