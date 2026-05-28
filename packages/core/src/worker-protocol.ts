import type { Position, TrackerEventMap, TrackerStats, TrailPoint, VehicleState } from './types';

/**
 * postMessage protocol between the main thread (WorkerTracker) and the worker
 * thread (worker-script). All payloads must be structured-cloneable — no
 * functions, no DOM nodes, no class instances with methods.
 *
 * The adapter never crosses the boundary: it lives on the main thread and is
 * driven by `AdapterCall` messages the worker emits during its tick. Likewise
 * a `CustomInterpolator` can't be cloned, so worker mode rejects it at
 * construction time (see WorkerTracker).
 */

/**
 * The serializable subset of TrackerOptions sent to the worker at init.
 * `adapter` is omitted (stays on main thread) and `interpolation` is narrowed
 * to the cloneable string forms — a CustomInterpolator object is rejected
 * before we ever build this.
 */
export interface SerializableTrackerOptions {
  interpolation?: 'linear' | 'cubic' | 'geodesic' | 'none' | 'adaptive';
  adaptive?: {
    minPeriodMs?: number;
    maxPeriodMs?: number;
    fadeThresholdMs?: number;
    snapThresholdMs?: number;
  };
  fadeAnimation?: { duration?: number; easing?: 'linear' | 'ease-in-out' };
  maxInterpolationGap?: number;
  warningThreshold?: number;
  staleThreshold?: number;
  staleCheckInterval?: number;
  ingestThrottle?: number;
  initialPositionBehavior?: 'show-immediately' | 'wait-for-second' | 'fade-in';
  shortestArcHeading?: boolean;
  renderLagMs?: number;
}

// ─── Main → Worker ──────────────────────────────────────────────────────

export type MainToWorkerMessage =
  | { type: 'init'; options: SerializableTrackerOptions }
  | { type: 'ingest'; positions: Position[] }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'destroy' }
  | { type: 'markCompleted'; vehicleId: string }
  | { type: 'removeVehicle'; vehicleId: string };

// ─── Worker → Main ──────────────────────────────────────────────────────

/**
 * An adapter method the worker wants the main thread to invoke on the real
 * adapter. `opacity` calls (from fade behavior) are intentionally NOT proxied
 * — they're rAF-driven animations that belong on the main thread. The worker
 * only forwards the discrete lifecycle calls below; the WorkerTracker drives
 * any opacity animation locally (see WorkerTracker).
 */
export type AdapterCall =
  | { call: 'addVehicle'; id: string; point: TrailPoint }
  | { call: 'updatePosition'; id: string; point: TrailPoint }
  | { call: 'removeVehicle'; id: string }
  | { call: 'setVehicleState'; id: string; state: VehicleState };

export type WorkerToMainMessage =
  | { type: 'adapter'; calls: AdapterCall[] }
  | {
      // Re-emit a Tracker event on the main-thread EventBus. `name` is a key of
      // TrackerEventMap; `payload` is its corresponding value.
      type: 'event';
      name: keyof TrackerEventMap;
      payload: TrackerEventMap[keyof TrackerEventMap];
    }
  | { type: 'stats'; stats: TrackerStats }
  | { type: 'ready' };
