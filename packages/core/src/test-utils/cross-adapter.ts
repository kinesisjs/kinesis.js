/**
 * Cross-adapter parity harness.
 *
 * Defines deterministic scenarios + a canonical expected sequence of
 * adapter calls. Each adapter package imports this and asserts that its
 * own implementation, driven by a real Tracker, produces the same call
 * trace. If both `@kinesisjs/openlayers` and `@kinesisjs/leaflet` pass
 * the same baseline, they are observationally interchangeable from the
 * Tracker's point of view.
 *
 * Map-library-agnostic: only depends on `TrackAdapter`, never on `L`/`ol`.
 */

import { Tracker } from '../tracker';
import type { Position, TrackAdapter, TrackerOptions, TrailPoint, VehicleState } from '../types';

// ─── Recorded calls ──────────────────────────────────────────────────────

/**
 * One observed adapter method invocation. The `args` field carries the
 * Tracker-supplied payload (e.g. `[id, point]`), allowing structural
 * comparison with tolerance. `tick` records the tick index that produced
 * the call, so order across batched ticks stays inspectable.
 */
export interface RecordedCall {
  method: keyof TrackAdapter;
  id?: string;
  point?: TrailPoint;
  state?: VehicleState;
  opacity?: number;
  tick: number;
}

/**
 * Wrap an adapter so every Tracker→adapter call is captured. The original
 * adapter still runs (so map-side state stays consistent in case the test
 * inspects it), but every method also pushes a RecordedCall into `calls`.
 */
export function recordAdapter(inner: TrackAdapter): {
  adapter: TrackAdapter;
  calls: RecordedCall[];
  bumpTick: () => void;
} {
  const calls: RecordedCall[] = [];
  let tickIndex = 0;

  const wrap = <K extends keyof TrackAdapter>(method: K, payload: Partial<RecordedCall>) =>
    calls.push({ method, tick: tickIndex, ...payload });

  const adapter: TrackAdapter = {
    addVehicle(id, point) {
      wrap('addVehicle', { id, point });
      inner.addVehicle(id, point);
    },
    updatePosition(id, point) {
      wrap('updatePosition', { id, point });
      inner.updatePosition(id, point);
    },
    removeVehicle(id) {
      wrap('removeVehicle', { id });
      inner.removeVehicle(id);
    },
    destroy() {
      wrap('destroy', {});
      inner.destroy();
    },
  };

  if (typeof inner.updateOpacity === 'function') {
    adapter.updateOpacity = (id, opacity) => {
      wrap('updateOpacity', { id, opacity });
      inner.updateOpacity?.(id, opacity);
    };
  }
  if (typeof inner.setVehicleState === 'function') {
    adapter.setVehicleState = (id, state) => {
      wrap('setVehicleState', { id, state });
      inner.setVehicleState?.(id, state);
    };
  }
  if (typeof inner.getMemoryEstimate === 'function') {
    adapter.getMemoryEstimate = () => inner.getMemoryEstimate?.() ?? 0;
  }

  return { adapter, calls, bumpTick: () => void (tickIndex += 1) };
}

// ─── Scenarios ───────────────────────────────────────────────────────────

/**
 * A scenario specifies (a) how to build the Tracker, (b) what positions
 * to ingest at which simulated time, and (c) the canonical sequence of
 * adapter calls every conforming adapter must produce.
 *
 * `now0` anchors the simulated clock (Date.now()) at scenario start. Each
 * step advances simulated time by `dtMs` (relative to now0) before
 * ingesting and then calls `tracker.tickOnce()` `ticks` times. This keeps
 * the harness deterministic without requiring vi.useFakeTimers in the
 * caller.
 */
/**
 * Public Tracker commands a scenario can issue mid-flight. Lets a parity
 * scenario assert that calls like `tracker.removeVehicle(id)` flow through
 * to the adapter consistently across implementations.
 */
export interface ScenarioCommand {
  type: 'removeVehicle' | 'markCompleted';
  vehicleId: string;
}

export interface ScenarioStep {
  /** Simulated ms since scenario start to advance to before this step. */
  atMs: number;
  /** Positions to ingest at this time. */
  ingest?: Position[];
  /** Tracker commands to invoke after the ingest, in order. */
  commands?: ScenarioCommand[];
  /** Number of `tickOnce()` calls to perform after the commands. */
  ticks: number;
}

export interface ExpectedCall {
  method: keyof TrackAdapter;
  /** Optional vehicle id to match. */
  id?: string;
  /** Optional state for setVehicleState. */
  state?: VehicleState;
  /**
   * Optional approximate coordinates check. Tolerance applies to both
   * lng and lat (degrees). Useful for interpolated points where rounding
   * differs across math implementations.
   */
  approxLngLat?: { lng: number; lat: number; tolerance?: number };
}

export interface Scenario {
  name: string;
  options?: Partial<TrackerOptions>;
  /** ISO ms anchor for the simulated clock. Defaults to a stable epoch. */
  now0?: number;
  steps: ScenarioStep[];
  /** Expected sequence of adapter calls, in order. */
  expected: ExpectedCall[];
}

// ─── Runner ──────────────────────────────────────────────────────────────

/**
 * Construct a Tracker bound to the recorded adapter, then walk the
 * scenario steps using a monotonic stub clock. Returns the recorded
 * call list so the test can assert against `scenario.expected`.
 */
export function runScenario(buildAdapter: () => TrackAdapter, scenario: Scenario): RecordedCall[] {
  const inner = buildAdapter();
  const { adapter, calls, bumpTick } = recordAdapter(inner);

  const now0 = scenario.now0 ?? 1_700_000_000_000;
  let simNow = now0;

  // Pin Date.now() and performance.now() so Tracker's internal time math
  // is reproducible. Restored at the end of the function.
  const origDateNow = Date.now;
  const origPerfNow = typeof performance !== 'undefined' ? performance.now : undefined;
  Date.now = () => simNow;
  if (typeof performance !== 'undefined') {
    performance.now = () => simNow - now0;
  }

  try {
    const tracker = new Tracker({
      adapter,
      ingestThrottle: 0,
      ...scenario.options,
    });

    for (const step of scenario.steps) {
      simNow = now0 + step.atMs;
      if (step.ingest && step.ingest.length > 0) {
        tracker.ingest(step.ingest);
      }
      if (step.commands) {
        for (const cmd of step.commands) {
          if (cmd.type === 'removeVehicle') {
            tracker.removeVehicle(cmd.vehicleId);
          } else if (cmd.type === 'markCompleted') {
            tracker.markCompleted(cmd.vehicleId);
          }
        }
      }
      for (let i = 0; i < step.ticks; i++) {
        bumpTick();
        tracker.tickOnce();
      }
    }

    // No tracker.destroy() here — destroy() invokes adapter.destroy() but
    // does not iterate slots calling removeVehicle, so adding it would
    // contaminate the recorded sequence with a trailing 'destroy' that
    // every scenario.expected would have to include. The Tracker is GC'd
    // when the test fixture goes out of scope.
  } finally {
    Date.now = origDateNow;
    if (origPerfNow !== undefined) {
      performance.now = origPerfNow;
    }
  }

  return calls;
}

// ─── Parity assertion ────────────────────────────────────────────────────

export interface ParityAssertionResult {
  ok: boolean;
  message?: string;
}

/**
 * Compare recorded calls against the canonical expected sequence.
 * Returns a structured result so the caller can integrate with
 * Vitest's expect() or fail() with a precise diff.
 *
 * Match semantics:
 *   - Methods must match exactly, in order.
 *   - `id`/`state` must match when specified on the expected entry.
 *   - `approxLngLat` checks lng & lat within tolerance (default 1e-6).
 *   - Expected entries without a constraint act as wildcards on
 *     unspecified fields.
 */
export function checkParity(
  actual: RecordedCall[],
  expected: ExpectedCall[],
): ParityAssertionResult {
  if (actual.length !== expected.length) {
    return {
      ok: false,
      message:
        `Expected ${expected.length} adapter calls but got ${actual.length}.\n` +
        `Actual:\n${actual.map(summarizeActual).join('\n')}`,
    };
  }

  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const a = actual[i];
    if (!e || !a) {
      // Should be unreachable given the length check above.
      return { ok: false, message: `Internal parity-check error at index ${i}.` };
    }
    if (a.method !== e.method) {
      return {
        ok: false,
        message: `Call #${i}: expected method "${e.method}" but got "${a.method}".`,
      };
    }
    if (e.id !== undefined && a.id !== e.id) {
      return {
        ok: false,
        message: `Call #${i} (${e.method}): expected id "${e.id}" but got "${a.id}".`,
      };
    }
    if (e.state !== undefined && a.state !== e.state) {
      return {
        ok: false,
        message: `Call #${i} (${e.method}): expected state "${e.state}" but got "${a.state}".`,
      };
    }
    if (e.approxLngLat) {
      const tol = e.approxLngLat.tolerance ?? 1e-6;
      const p = a.point;
      if (!p) {
        return {
          ok: false,
          message: `Call #${i} (${e.method}): expected a point but none recorded.`,
        };
      }
      if (
        Math.abs(p.lng - e.approxLngLat.lng) > tol ||
        Math.abs(p.lat - e.approxLngLat.lat) > tol
      ) {
        return {
          ok: false,
          message:
            `Call #${i} (${e.method}): expected (lng=${e.approxLngLat.lng}, ` +
            `lat=${e.approxLngLat.lat}) ±${tol}, got (lng=${p.lng}, lat=${p.lat}).`,
        };
      }
    }
  }

  return { ok: true };
}

function summarizeActual(c: RecordedCall): string {
  const parts: string[] = [`  #${c.tick} ${c.method}`];
  if (c.id !== undefined) parts.push(`id=${c.id}`);
  if (c.point) parts.push(`lng=${c.point.lng}, lat=${c.point.lat}`);
  if (c.state !== undefined) parts.push(`state=${c.state}`);
  if (c.opacity !== undefined) parts.push(`opacity=${c.opacity}`);
  return parts.join(' ');
}

// ─── Canonical scenarios ─────────────────────────────────────────────────

/**
 * Every shipped TrackAdapter must reproduce this baseline. Adding a new
 * scenario here automatically widens the parity bar for every adapter
 * the next time their tests run.
 */
export const CROSS_ADAPTER_SCENARIOS: Scenario[] = [
  // ── 1) First-sight ingest with show-immediately attaches at t=0 ────────
  //
  // Pure ingest-only check: a brand-new vehicle in show-immediately mode
  // produces exactly one addVehicle and nothing else. We deliberately do
  // not tick — the first-position-only path in Tracker.tick() would emit
  // an updatePosition every frame until a second ingest lands; that's the
  // subject of scenario 2 below.
  {
    name: 'first-sight ingest with show-immediately attaches immediately',
    options: {
      initialPositionBehavior: 'show-immediately',
      renderLagMs: 0,
      interpolation: 'none',
    },
    steps: [{ atMs: 0, ingest: [{ id: 'v1', lng: 29, lat: 41 }], ticks: 0 }],
    expected: [{ method: 'addVehicle', id: 'v1' }],
  },

  // ── 2) wait-for-second defers addVehicle to the second ingest ──────────
  {
    name: 'wait-for-second defers addVehicle to the second ingest',
    options: {
      initialPositionBehavior: 'wait-for-second',
      renderLagMs: 0,
      interpolation: 'none',
    },
    steps: [
      // First ingest: no addVehicle yet (wait-for-second).
      { atMs: 0, ingest: [{ id: 'v1', lng: 29, lat: 41 }], ticks: 0 },
      // Second ingest at 1 Hz: addVehicle fires now. Position moved by
      // ~11 m, well under the 100 m anomalous-jump floor.
      { atMs: 1000, ingest: [{ id: 'v1', lng: 29.0001, lat: 41.0001 }], ticks: 0 },
    ],
    expected: [{ method: 'addVehicle', id: 'v1' }],
  },

  // ── 3) Two-position ingest then a half-period tick interpolates ────────
  //
  // The render-lag buffer is what makes mid-flight interpolation possible:
  // with renderLagMs=1000 the tick at t=1500 evaluates a `renderTime` of
  // 500 ms, exactly half-way between previous.receivedAt (0) and
  // current.receivedAt (1000). ratio=0.5 → linear lerp → midpoint.
  // Coordinates kept ~11 m apart so the anomalous-jump sanity check
  // accepts the ingest.
  {
    name: 'second ingest + half-period tick produces an interpolated updatePosition',
    options: {
      initialPositionBehavior: 'show-immediately',
      renderLagMs: 1000,
      interpolation: 'linear',
    },
    steps: [
      { atMs: 0, ingest: [{ id: 'v1', lng: 29, lat: 41 }], ticks: 0 },
      { atMs: 1000, ingest: [{ id: 'v1', lng: 29.0001, lat: 41.0001 }], ticks: 0 },
      { atMs: 1500, ticks: 1 },
    ],
    expected: [
      { method: 'addVehicle', id: 'v1' },
      {
        method: 'updatePosition',
        id: 'v1',
        approxLngLat: { lng: 29.00005, lat: 41.00005, tolerance: 1e-6 },
      },
    ],
  },

  // ── 4) Long-gap re-ingest does not double-fire addVehicle ──────────────
  //
  // After a 2 s idle (past the warningThreshold of 1 s but well before
  // stale), a fresh ingest must not re-trigger addVehicle for the same id.
  // The Sweeper transition itself is setInterval-driven and out of scope
  // here — that's covered by tracker.test.ts.
  {
    name: 'long-gap re-ingest does not duplicate addVehicle',
    options: {
      initialPositionBehavior: 'show-immediately',
      renderLagMs: 0,
      interpolation: 'none',
      warningThreshold: 1000,
      staleThreshold: 10_000,
      staleCheckInterval: 100,
    },
    steps: [
      { atMs: 0, ingest: [{ id: 'v1', lng: 29, lat: 41 }], ticks: 0 },
      { atMs: 2000, ingest: [{ id: 'v1', lng: 29.0001, lat: 41.0001 }], ticks: 0 },
    ],
    expected: [{ method: 'addVehicle', id: 'v1' }],
  },

  // ── 5) Multiple vehicles in one ingest produce one addVehicle each ─────
  {
    name: 'multi-vehicle ingest fans out to one addVehicle per id',
    options: {
      initialPositionBehavior: 'show-immediately',
      renderLagMs: 0,
      interpolation: 'none',
    },
    steps: [
      {
        atMs: 0,
        ingest: [
          { id: 'v1', lng: 29, lat: 41 },
          { id: 'v2', lng: 30, lat: 42 },
          { id: 'v3', lng: 31, lat: 43 },
        ],
        ticks: 0,
      },
    ],
    expected: [
      { method: 'addVehicle', id: 'v1' },
      { method: 'addVehicle', id: 'v2' },
      { method: 'addVehicle', id: 'v3' },
    ],
  },

  // ── 6) tracker.removeVehicle() flows through to adapter.removeVehicle ──
  {
    name: 'tracker.removeVehicle propagates a removeVehicle call',
    options: {
      initialPositionBehavior: 'show-immediately',
      renderLagMs: 0,
      interpolation: 'none',
    },
    steps: [
      { atMs: 0, ingest: [{ id: 'v1', lng: 29, lat: 41 }], ticks: 0 },
      { atMs: 100, commands: [{ type: 'removeVehicle', vehicleId: 'v1' }], ticks: 0 },
    ],
    expected: [
      { method: 'addVehicle', id: 'v1' },
      { method: 'removeVehicle', id: 'v1' },
    ],
  },

  // ── 7) tracker.markCompleted() removes the vehicle via the adapter ─────
  //
  // markCompleted triggers the same lifecycle path as 'stale', so the
  // adapter receives a removeVehicle (not a setVehicleState('completed')
  // — that state is immediately followed by removal).
  {
    name: 'tracker.markCompleted removes the vehicle via removeVehicle',
    options: {
      initialPositionBehavior: 'show-immediately',
      renderLagMs: 0,
      interpolation: 'none',
    },
    steps: [
      { atMs: 0, ingest: [{ id: 'v1', lng: 29, lat: 41 }], ticks: 0 },
      { atMs: 100, commands: [{ type: 'markCompleted', vehicleId: 'v1' }], ticks: 0 },
    ],
    expected: [
      { method: 'addVehicle', id: 'v1' },
      { method: 'removeVehicle', id: 'v1' },
    ],
  },
];
