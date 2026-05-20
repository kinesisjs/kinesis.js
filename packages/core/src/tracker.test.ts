import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tracker } from './tracker';
import type { Position, TrackAdapter, TrackerError, TrailPoint } from './types';

class MockAdapter implements TrackAdapter {
  readonly added: Map<string, TrailPoint> = new Map();
  readonly updated: Map<string, TrailPoint> = new Map();
  readonly removed: Set<string> = new Set();
  opacityCalls: Array<{ id: string; opacity: number }> = [];
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
