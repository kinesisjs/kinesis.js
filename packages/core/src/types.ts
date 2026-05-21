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
 * Fixed-size per-vehicle slot (ring pattern).
 */
export interface VehicleSlot {
  previous: TrailPoint | null;
  current: TrailPoint | null;
  lastIngestAt: number;
  state: VehicleState;
  /** Whether `Adapter.addVehicle` has been called yet — critical for the
   *  `wait-for-second` initial-position behavior. */
  isAttached: boolean;
}

/**
 * Behavior when the very first position for a vehicle arrives.
 */
export type InitialPositionBehavior = 'show-immediately' | 'wait-for-second' | 'fade-in';

/**
 * Built-in interpolation modes (excluding custom interpolators and 'adaptive').
 */
export type InterpolationMode = 'linear' | 'cubic' | 'geodesic' | 'none';

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

  /** Run inside a Web Worker. Default: false (detailed in v0.2.x+). */
  worker?: boolean;

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
