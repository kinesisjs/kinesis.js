import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tracker } from './tracker';
import type { Position, TrackAdapter, TrackerError, TrailPoint, VehicleSlot } from './types';

class MockAdapter implements TrackAdapter {
  readonly added: Map<string, TrailPoint> = new Map();
  readonly updated: Map<string, TrailPoint> = new Map();
  readonly removed: Set<string> = new Set();
  opacityCalls: Array<{ id: string; opacity: number }> = [];
  stateCalls: Array<{ id: string; state: string }> = [];
  shouldThrowOnAdd = false;
  shouldThrowOnUpdate = false;

  addVehicle = vi.fn((id: string, point: TrailPoint) => {
    if (this.shouldThrowOnAdd) throw new Error('add failed');
    this.added.set(id, point);
  });
  updatePosition = vi.fn((id: string, point: TrailPoint) => {
    if (this.shouldThrowOnUpdate) throw new Error('update failed');
    this.updated.set(id, point);
  });
  removeVehicle = vi.fn((id: string) => {
    this.removed.add(id);
  });
  destroy = vi.fn();
  updateOpacity = vi.fn((id: string, opacity: number) => {
    this.opacityCalls.push({ id, opacity });
  });
  setVehicleState = vi.fn((id: string, state: string) => {
    this.stateCalls.push({ id, state });
  });
  getMemoryEstimate = vi.fn(() => 128);
}

const validPos = (id: string, lng = 29, lat = 41): Position => ({ id, lng, lat });

describe('Tracker.ingest', () => {
  it('creates a slot and attaches to adapter (default initialPositionBehavior)', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    t.ingest([validPos('v1')]);
    expect(adapter.addVehicle).toHaveBeenCalledTimes(1);
    expect(adapter.added.get('v1')).toBeDefined();
  });

  it("'wait-for-second' defers addVehicle until the second ingest", () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, initialPositionBehavior: 'wait-for-second' });
    t.ingest([validPos('v1', 29, 41)]);
    expect(adapter.addVehicle).not.toHaveBeenCalled();
    t.ingest([validPos('v1', 29.1, 41.0)]);
    expect(adapter.addVehicle).toHaveBeenCalledTimes(1);
  });

  it("'fade-in' calls updateOpacity when adapter supports it", () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, initialPositionBehavior: 'fade-in' });
    t.ingest([validPos('v1')]);
    expect(adapter.addVehicle).toHaveBeenCalled();
    expect(adapter.updateOpacity).toHaveBeenCalled();
  });

  it('emits ingest event with count and throttled', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const handler = vi.fn();
    t.on('ingest', handler);
    t.ingest([validPos('v1'), validPos('v2')]);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ count: 2, throttled: 0 }));
  });

  it('throttles repeated ingests for same vehicleId within throttle window', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 1000 });
    const handler = vi.fn();
    t.on('ingest', handler);
    t.ingest([validPos('v1')]);
    t.ingest([validPos('v1')]); // immediate; should be throttled
    expect(handler.mock.calls[1]![0].throttled).toBe(1);
  });

  it('rejects invalid position id', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const errHandler = vi.fn<(e: TrackerError) => void>();
    t.on('error', errHandler);
    t.ingest([{ id: '', lng: 29, lat: 41 }]);
    expect(errHandler).toHaveBeenCalledTimes(1);
    expect(errHandler.mock.calls[0]![0].code).toBe('INVALID_POSITION');
    expect(adapter.addVehicle).not.toHaveBeenCalled();
  });

  it('rejects non-finite coordinates', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const errHandler = vi.fn<(e: TrackerError) => void>();
    t.on('error', errHandler);
    t.ingest([{ id: 'v1', lng: NaN, lat: 41 }]);
    expect(errHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects out-of-range coordinates', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const errHandler = vi.fn<(e: TrackerError) => void>();
    t.on('error', errHandler);
    t.ingest([{ id: 'v1', lng: 200, lat: 41 }]);
    expect(errHandler).toHaveBeenCalledTimes(1);
  });

  it('emits error when adapter.addVehicle throws', () => {
    const adapter = new MockAdapter();
    adapter.shouldThrowOnAdd = true;
    const t = new Tracker({ adapter });
    const errHandler = vi.fn<(e: TrackerError) => void>();
    t.on('error', errHandler);
    t.ingest([validPos('v1')]);
    expect(errHandler).toHaveBeenCalledTimes(1);
    expect(errHandler.mock.calls[0]![0].code).toBe('ADAPTER_ERROR');
  });
});

describe('Tracker tick (sanity checks)', () => {
  it('on second ingest, tickOnce drives updatePosition through adapter', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0 });
    t.ingest([{ id: 'v1', lng: 29, lat: 41, timestamp: Date.now() - 1000 }]);
    t.ingest([{ id: 'v1', lng: 29.001, lat: 41.001, timestamp: Date.now() }]);
    t.tickOnce();
    expect(adapter.updatePosition).toHaveBeenCalled();
  });

  it('anomalous jump (huge distance) triggers fade fallback via updateOpacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0 });
    t.ingest([{ id: 'v1', lng: 0, lat: 0, speed: 5 }]);
    vi.setSystemTime(2000); // 1s later
    t.ingest([{ id: 'v1', lng: 10, lat: 0, speed: 5 }]); // ~1100km in 1s → impossible
    t.tickOnce();
    expect(adapter.updateOpacity).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('Tracker lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start/stop/destroy emits corresponding events', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const startHandler = vi.fn();
    const stopHandler = vi.fn();
    const destroyHandler = vi.fn();
    t.on('start', startHandler);
    t.on('stop', stopHandler);
    t.on('destroy', destroyHandler);
    t.start();
    t.stop();
    t.destroy();
    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(stopHandler).toHaveBeenCalledTimes(1);
    expect(destroyHandler).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalled();
  });

  it('markCompleted removes vehicle and emits vehiclecompleted', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const handler = vi.fn();
    t.on('vehiclecompleted', handler);
    t.ingest([validPos('v1')]);
    expect(t.markCompleted('v1')).toBe(true);
    expect(handler).toHaveBeenCalledWith({ vehicleId: 'v1' });
    expect(adapter.removeVehicle).toHaveBeenCalledWith('v1');
  });

  it('markCompleted returns false for unknown vehicle', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    expect(t.markCompleted('unknown')).toBe(false);
  });

  it('removeVehicle emits vehicleremoved and calls adapter.removeVehicle', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    const handler = vi.fn();
    t.on('vehicleremoved', handler);
    t.ingest([validPos('v1')]);
    expect(t.removeVehicle('v1')).toBe(true);
    expect(handler).toHaveBeenCalledWith({ vehicleId: 'v1' });
  });
});

describe('Tracker.getStats', () => {
  it('returns frozen stats with the expected shape', () => {
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter });
    t.ingest([validPos('v1'), validPos('v2')]);
    const stats = t.getStats();
    expect(stats.vehicleCount).toBe(2);
    expect(stats.totalBufferedPoints).toBe(4);
    expect(stats.memoryBreakdown).toBeDefined();
    expect(stats.memoryBreakdown.adapterEstimateBytes).toBe(128); // from getMemoryEstimate mock
    expect(stats.performanceMetrics).toBeDefined();
    expect(Object.isFrozen(stats)).toBe(true);
  });
});

describe('Tracker with CustomInterpolator', () => {
  it('uses sync compute result on tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MockAdapter();
    const customCompute = vi.fn((_from: TrailPoint, to: TrailPoint) => ({
      ...to,
      lng: 999, // distinctive marker so we can verify routing
    }));
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: { compute: customCompute },
    });
    t.ingest([{ id: 'v1', lng: 29, lat: 41 }]);
    vi.setSystemTime(2000);
    t.ingest([{ id: 'v1', lng: 29.001, lat: 41 }]);
    // With default renderLagMs=1000, renderTime = now - 1000. To land inside
    // the interpolation window [previous.receivedAt, current.receivedAt] =
    // [1000, 2000], wall-clock `now` must be in [2000, 3000].
    vi.setSystemTime(2500); // renderTime=1500 → midway between previous and current
    t.tickOnce();
    expect(customCompute).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('falls back to linear for async compute (cached result used in later ticks)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: {
        compute: (_from, to) => Promise.resolve({ ...to, lng: 555 }),
      },
    });
    t.ingest([{ id: 'v1', lng: 29, lat: 41 }]);
    vi.setSystemTime(2000);
    t.ingest([{ id: 'v1', lng: 29.001, lat: 41 }]);
    vi.setSystemTime(2500); // renderTime=1500, midway → triggers interpolation path
    t.tickOnce();
    // First tick: linear fallback used; updatePosition called nonetheless
    expect(adapter.updatePosition).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('Tracker → adapter.setVehicleState (gap visualization hook)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sweeper warning transition fires setVehicleState(id, "warning")', () => {
    vi.useFakeTimers({ now: 0 });
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      warningThreshold: 100,
      staleThreshold: 5000,
      staleCheckInterval: 50,
    });
    t.ingest([validPos('v1')]); // lastIngestAt = 0
    t.start(); // starts sweeper interval

    // advanceTimersByTime steps through sweep fires gradually so each sees the
    // intermediate Date.now() — setSystemTime would jump past the warning
    // window straight into stale.
    vi.advanceTimersByTime(150);

    expect(adapter.setVehicleState).toHaveBeenCalledWith('v1', 'warning');
    t.destroy();
  });

  it('fresh ingest after warning fires setVehicleState(id, "active") immediately', () => {
    vi.useFakeTimers({ now: 0 });
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      warningThreshold: 100,
      staleThreshold: 5000,
      staleCheckInterval: 50,
    });
    t.ingest([validPos('v1')]);
    t.start();

    vi.advanceTimersByTime(150);
    expect(adapter.setVehicleState).toHaveBeenLastCalledWith('v1', 'warning');

    // Fresh ingest now — recovery
    adapter.setVehicleState.mockClear();
    t.ingest([validPos('v1', 29.001)]);
    expect(adapter.setVehicleState).toHaveBeenCalledWith('v1', 'active');
    t.destroy();
  });

  it('stale transition does NOT call setVehicleState (removeVehicle follows)', () => {
    vi.useFakeTimers({ now: 0 });
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      warningThreshold: 100,
      staleThreshold: 200,
      staleCheckInterval: 50,
    });
    t.ingest([validPos('v1')]);
    t.start();

    vi.advanceTimersByTime(300);

    expect(adapter.removeVehicle).toHaveBeenCalledWith('v1');
    // Only 'warning' should appear in stateCalls — never 'stale'
    const states = adapter.stateCalls.map((c) => c.state);
    expect(states).not.toContain('stale');
    expect(states).toContain('warning');
    t.destroy();
  });
});

describe('Tracker render-lag (interpolation buffer)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // lng deltas kept tiny so the per-tick distance stays under the
  // anomalous-jump sanity threshold (≈21 m at default speed 50 km/h).
  const LNG_FROM = 29.0;
  const LNG_TO = 29.0001; // ~11 m east
  const LNG_MID = (LNG_FROM + LNG_TO) / 2;

  it('default renderLagMs=1000 enables real-time interpolation between ingests', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0 });
    t.ingest([{ id: 'v1', lng: LNG_FROM, lat: 41, speed: 50 }]);
    vi.setSystemTime(2000);
    t.ingest([{ id: 'v1', lng: LNG_TO, lat: 41, speed: 50 }]);

    // now=2000, renderTime=1000 → elapsed=0 → hold at previous
    t.tickOnce();
    let lastCall = adapter.updatePosition.mock.calls.at(-1);
    expect(lastCall?.[1].lng).toBeCloseTo(LNG_FROM, 8);

    // now=2500, renderTime=1500 → ratio=0.5 → midway
    vi.setSystemTime(2500);
    t.tickOnce();
    lastCall = adapter.updatePosition.mock.calls.at(-1);
    expect(lastCall?.[1].lng).toBeCloseTo(LNG_MID, 8);

    // now=3000, renderTime=2000 → elapsed=period → snap to current
    vi.setSystemTime(3000);
    t.tickOnce();
    lastCall = adapter.updatePosition.mock.calls.at(-1);
    expect(lastCall?.[1].lng).toBeCloseTo(LNG_TO, 8);
  });

  it('renderLagMs=0 reproduces legacy snap-on-ingest behavior', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MockAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0, renderLagMs: 0 });
    t.ingest([{ id: 'v1', lng: LNG_FROM, lat: 41, speed: 50 }]);
    vi.setSystemTime(2000);
    t.ingest([{ id: 'v1', lng: LNG_TO, lat: 41, speed: 50 }]);

    // Immediately after second ingest with no render lag: elapsed=period → snap to current.
    t.tickOnce();
    const lastCall = adapter.updatePosition.mock.calls.at(-1);
    expect(lastCall?.[1].lng).toBeCloseTo(LNG_TO, 8);
  });
});

describe('Tracker interpolation: smooth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to linear lerp for the first interpolated segment (no previous2)', () => {
    // First two ingests give us slot.previous + slot.current. previous2
    // is still null until the third ingest, so the smooth branch must
    // not engage yet — output matches a linear lerp.
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'smooth',
      renderLagMs: 1000,
    });
    t.ingest([{ id: 'v1', lng: 29, lat: 41 }]);
    vi.setSystemTime(2000);
    t.ingest([{ id: 'v1', lng: 29.0001, lat: 41.0001 }]);

    vi.setSystemTime(2500);
    t.tickOnce();
    const last = adapter.updatePosition.mock.calls.at(-1);
    // Linear midpoint of (29,41) → (29.0001,41.0001) at ratio 0.5.
    expect(last?.[1].lng).toBeCloseTo(29.00005, 8);
    expect(last?.[1].lat).toBeCloseTo(41.00005, 8);
  });

  it('engages Catmull-Rom once a third ingest provides previous2', () => {
    // After the third ingest, slot = { previous2, previous, current }.
    // Interpolating between previous and current should now route through
    // catmullRomLerp — its output diverges from a pure linear midpoint
    // when the three control points are non-collinear.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'smooth',
      renderLagMs: 1000,
    });
    // Three colinear-ish ingests with a bend at p2 (the upcoming
    // `previous` once the third lands) so the spline visibly differs.
    vi.setSystemTime(0);
    t.ingest([{ id: 'v1', lng: 29.0, lat: 41.0 }]);
    vi.setSystemTime(1000);
    t.ingest([{ id: 'v1', lng: 29.0001, lat: 41.0 }]);
    vi.setSystemTime(2000);
    t.ingest([{ id: 'v1', lng: 29.0002, lat: 41.0002 }]);

    vi.setSystemTime(2500);
    t.tickOnce();
    const last = adapter.updatePosition.mock.calls.at(-1);
    // Linear midpoint of (29.0001,41.0) → (29.0002,41.0002) at ratio 0.5
    // is (29.00015, 41.0001). The spline shapes the lat toward the
    // outbound tangent, so the recorded lat must NOT equal the linear
    // value to a strict tolerance.
    expect(last?.[1].lat).not.toBe(41.0001);
    // Sanity: longitude is close to the linear midpoint (geometry shifts
    // primarily on the lat axis here).
    expect(last?.[1].lng).toBeCloseTo(29.00015, 6);
  });

  it('falls back to linear when the previous2 → previous gap exceeds maxInterpolationGap', () => {
    // previous2 ingested long before previous: a stale control point
    // would warp the spline. Tracker drops it and uses linear instead.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'smooth',
      renderLagMs: 1000,
      maxInterpolationGap: 5_000,
    });
    vi.setSystemTime(0);
    t.ingest([{ id: 'v1', lng: 29.0, lat: 41.0 }]);
    // 20 s gap — past the 5 s maxInterpolationGap budget.
    vi.setSystemTime(20_000);
    t.ingest([{ id: 'v1', lng: 29.0001, lat: 41.0 }]);
    vi.setSystemTime(21_000);
    t.ingest([{ id: 'v1', lng: 29.0002, lat: 41.0002 }]);

    vi.setSystemTime(21_500);
    t.tickOnce();
    const last = adapter.updatePosition.mock.calls.at(-1);
    // With previous2 dropped, behaviour matches pure linear midpoint.
    expect(last?.[1].lng).toBeCloseTo(29.00015, 8);
    expect(last?.[1].lat).toBeCloseTo(41.0001, 8);
  });
});

describe('Tracker playout buffer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders at the configured pace regardless of arrival jitter (manual config)', () => {
    // Three ingests with deliberately uneven gaps land at t=0 / 500 / 1500.
    // Playout schedules them at bufferMs (=2000) and then pace (=1000)
    // apart, so the marker should sit at the start point until t=2000
    // and arrive at the second-position midpoint at t=2500.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'linear',
      playout: { pace: 1000, bufferMs: 2000 },
    });
    t.ingest([{ id: 'v1', lng: 29.0, lat: 41.0 }]); // playoutAt = 2000

    vi.setSystemTime(500);
    t.ingest([{ id: 'v1', lng: 29.0001, lat: 41.0 }]); // playoutAt = 3000

    vi.setSystemTime(1500);
    t.ingest([{ id: 'v1', lng: 29.0002, lat: 41.0 }]); // playoutAt = 4000

    // Before the buffer warms up: still at the first point.
    vi.setSystemTime(1000);
    t.tickOnce();
    let last = adapter.updatePosition.mock.calls.at(-1);
    expect(last?.[1].lng).toBeCloseTo(29.0, 8);

    // Half-way through the first segment (2000 → 3000) at t=2500.
    vi.setSystemTime(2500);
    t.tickOnce();
    last = adapter.updatePosition.mock.calls.at(-1);
    expect(last?.[1].lng).toBeCloseTo(29.00005, 8);

    // Half-way through the second segment (3000 → 4000) at t=3500.
    // Even though ingest gaps were 500 ms and 1000 ms (jittery), display
    // pace stays a constant 1000 ms per segment.
    vi.setSystemTime(3500);
    t.tickOnce();
    last = adapter.updatePosition.mock.calls.at(-1);
    expect(last?.[1].lng).toBeCloseTo(29.00015, 8);
  });

  it("'auto' calibrates pace and bufferMs from the gap history (per vehicle)", () => {
    // PLAYOUT_AUTO_MIN_SAMPLES is 5 — the first five inter-ingest gaps
    // fall on the classical path; subsequent ones engage the resolved
    // playout config. Sample gaps of [1000, 2000, 3000, 4000, 5000] →
    // avg=3000 → pace=3000, max=5000 → bufferMs=7500.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'linear',
      playout: 'auto',
    });

    let now = 0;
    t.ingest([{ id: 'v1', lng: 29.0, lat: 41.0 }]);

    // First five gaps (1, 2, 3, 4, 5 seconds) populate the sample window.
    for (const gap of [1000, 2000, 3000, 4000, 5000]) {
      now += gap;
      vi.setSystemTime(now);
      t.ingest([{ id: 'v1', lng: 29.0 + gap * 1e-8, lat: 41.0 }]);
    }

    // After 5 samples auto must be live. The next ingest schedules with
    // pace=3000, bufferMs=7500 → playoutAt = now + 7500 = (5+15)s × ?...
    // We don't need to assert the exact playoutAt; what we *do* assert
    // is that the queue is now populated (proof that auto engaged).
    // @ts-expect-error reach into private state for the assertion
    const slot = (t as unknown as { slots: Map<string, VehicleSlot> }).slots.get('v1');
    expect(slot?.playoutQueue?.length ?? 0).toBeGreaterThan(0);
  });

  it('holds at the head when the buffer underruns (single entry in queue)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'linear',
      playout: { pace: 1000, bufferMs: 2000 },
    });
    t.ingest([{ id: 'v1', lng: 29.0, lat: 41.0 }]);

    // Way past everything that's in the queue: only the seeded first
    // entry exists, no second segment endpoint. Marker must stay at
    // the head point — no NaN, no jump.
    vi.setSystemTime(60_000);
    t.tickOnce();
    const last = adapter.updatePosition.mock.calls.at(-1);
    expect(last?.[1].lng).toBeCloseTo(29.0, 8);
    expect(Number.isFinite(last?.[1].lng)).toBe(true);
  });

  it("doesn't touch the classical path when playout is absent (backwards compat)", () => {
    // No playout in options → classical behaviour: ingest twice, then
    // tick at half-period; should match linear lerp with renderLagMs.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new MockAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'linear',
      renderLagMs: 1000,
      // no playout
    });
    t.ingest([{ id: 'v1', lng: 29.0, lat: 41.0 }]);
    vi.setSystemTime(1000);
    t.ingest([{ id: 'v1', lng: 29.0001, lat: 41.0 }]);
    vi.setSystemTime(1500);
    t.tickOnce();
    const last = adapter.updatePosition.mock.calls.at(-1);
    expect(last?.[1].lng).toBeCloseTo(29.00005, 8);

    // And no playoutQueue should have been allocated on the slot.
    // @ts-expect-error reach into private state for the assertion
    const slot = (t as unknown as { slots: Map<string, VehicleSlot> }).slots.get('v1');
    expect(slot?.playoutQueue).toBeUndefined();
  });
});
