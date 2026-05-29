import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tracker } from './tracker';
import type { CustomInterpolator, Position, TrackAdapter, TrackerError, TrailPoint } from './types';

/** Full adapter with all optional hooks and per-method throw toggles. */
class FullAdapter implements TrackAdapter {
  shouldThrowOnUpdate = false;
  shouldThrowOnRemove = false;
  shouldThrowOnDestroy = false;
  addVehicle = vi.fn();
  updatePosition = vi.fn((_id: string, _p: TrailPoint) => {
    if (this.shouldThrowOnUpdate) throw new Error('update failed');
  });
  removeVehicle = vi.fn((_id: string) => {
    if (this.shouldThrowOnRemove) throw new Error('remove failed');
  });
  destroy = vi.fn(() => {
    if (this.shouldThrowOnDestroy) throw new Error('destroy failed');
  });
  updateOpacity = vi.fn();
  setVehicleState = vi.fn();
  getMemoryEstimate = vi.fn(() => 256);
}

/** Bare adapter: only the four required methods, no optional capabilities. */
class MinimalAdapter implements TrackAdapter {
  addVehicle = vi.fn();
  updatePosition = vi.fn();
  removeVehicle = vi.fn();
  destroy = vi.fn();
}

const pos = (id: string, lng = 29, lat = 41, extra: Partial<Position> = {}): Position => ({
  id,
  lng,
  lat,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Tracker tick — single point and snap branches', () => {
  it('renders a lone point (no previous) straight through updatePosition', () => {
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter });
    t.ingest([pos('v1')]);
    t.tickOnce();
    expect(adapter.updatePosition).toHaveBeenCalledWith('v1', expect.objectContaining({ lng: 29 }));
  });

  it('snaps to current when the period exceeds maxInterpolationGap (non-adaptive)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0, maxInterpolationGap: 500 });
    t.ingest([pos('v1', 29, 41)]);
    vi.setSystemTime(2000); // period = 1000 > 500
    t.ingest([pos('v1', 29.0001, 41)]);
    t.tickOnce();
    const last = adapter.updatePosition.mock.calls.at(-1);
    expect(last?.[1].lng).toBeCloseTo(29.0001, 8);
  });

  it('adaptive mode ignores maxInterpolationGap (isAdaptive branch)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new FullAdapter();
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      interpolation: 'adaptive',
      maxInterpolationGap: 100,
    });
    t.ingest([pos('v1', 29, 41, { speed: 50 })]);
    vi.setSystemTime(2000);
    t.ingest([pos('v1', 29.0001, 41, { speed: 50 })]);
    vi.setSystemTime(2500); // renderTime 1500 → interpolate, not snapped despite gap>max
    t.tickOnce();
    expect(adapter.updatePosition).toHaveBeenCalled();
  });

  it('sharp heading turn forces cubic easing on a linear tracker', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0 });
    t.ingest([pos('v1', 29, 41, { heading: 10 })]);
    vi.setSystemTime(2000);
    t.ingest([pos('v1', 29, 41, { heading: 200 })]); // |Δheading| > 90, same coords
    vi.setSystemTime(2500);
    t.tickOnce();
    expect(adapter.updatePosition).toHaveBeenCalled();
  });

  it('emits ADAPTER_ERROR when updatePosition throws during a tick', () => {
    const adapter = new FullAdapter();
    adapter.shouldThrowOnUpdate = true;
    const t = new Tracker({ adapter });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.ingest([pos('v1')]);
    t.tickOnce();
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ADAPTER_ERROR', message: 'updatePosition failed' }),
    );
  });
});

describe('Tracker lifecycle — error paths', () => {
  it('emits ADAPTER_ERROR when adapter.destroy throws', () => {
    const adapter = new FullAdapter();
    adapter.shouldThrowOnDestroy = true;
    const t = new Tracker({ adapter });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.destroy();
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ADAPTER_ERROR', message: 'adapter.destroy failed' }),
    );
  });

  it('emits ADAPTER_ERROR when removeVehicle throws (manual removal)', () => {
    const adapter = new FullAdapter();
    adapter.shouldThrowOnRemove = true;
    const t = new Tracker({ adapter });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.ingest([pos('v1')]);
    expect(t.removeVehicle('v1')).toBe(true);
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ADAPTER_ERROR', message: 'removeVehicle failed' }),
    );
  });

  it('removeVehicle returns false for an unknown vehicle', () => {
    const t = new Tracker({ adapter: new FullAdapter() });
    expect(t.removeVehicle('ghost')).toBe(false);
  });

  it('emits ADAPTER_ERROR when removeVehicle throws on stale sweep', () => {
    vi.useFakeTimers({ now: 0 });
    const adapter = new FullAdapter();
    adapter.shouldThrowOnRemove = true;
    const t = new Tracker({
      adapter,
      ingestThrottle: 0,
      warningThreshold: 100,
      staleThreshold: 200,
      staleCheckInterval: 50,
    });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.ingest([pos('v1')]);
    t.start();
    vi.advanceTimersByTime(300);
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ADAPTER_ERROR', message: 'removeVehicle failed' }),
    );
    t.destroy();
  });
});

describe('Tracker CustomInterpolator — prepare / async / sync-throw', () => {
  it('calls prepare(previous, current) on the second ingest', () => {
    const adapter = new FullAdapter();
    const prepare = vi.fn();
    const ci: CustomInterpolator = { compute: (_f, to) => to, prepare };
    const t = new Tracker({ adapter, ingestThrottle: 0, interpolation: ci });
    t.ingest([pos('v1', 29, 41)]);
    t.ingest([pos('v1', 29.001, 41)]);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('emits INTERPOLATION_ERROR when prepare rejects', async () => {
    const adapter = new FullAdapter();
    const ci: CustomInterpolator = {
      compute: (_f, to) => to,
      prepare: () => Promise.reject(new Error('prefetch failed')),
    };
    const t = new Tracker({ adapter, ingestThrottle: 0, interpolation: ci });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.ingest([pos('v1', 29, 41)]);
    t.ingest([pos('v1', 29.001, 41)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERPOLATION_ERROR',
        message: 'CustomInterpolator.prepare failed',
      }),
    );
  });

  it('emits INTERPOLATION_ERROR when an async compute rejects', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new FullAdapter();
    const ci: CustomInterpolator = { compute: () => Promise.reject(new Error('async boom')) };
    const t = new Tracker({ adapter, ingestThrottle: 0, interpolation: ci });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.ingest([pos('v1', 29, 41)]);
    vi.setSystemTime(2000);
    t.ingest([pos('v1', 29.001, 41)]);
    vi.setSystemTime(2500);
    t.tickOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(err).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERPOLATION_ERROR' }));
  });

  it('falls back to linear and emits error when a sync compute throws', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new FullAdapter();
    const ci: CustomInterpolator = {
      compute: () => {
        throw new Error('sync boom');
      },
    };
    const t = new Tracker({ adapter, ingestThrottle: 0, interpolation: ci });
    const err = vi.fn<(e: TrackerError) => void>();
    t.on('error', err);
    t.ingest([pos('v1', 29, 41)]);
    vi.setSystemTime(2000);
    t.ingest([pos('v1', 29.0001, 41)]);
    vi.setSystemTime(2500);
    t.tickOnce();
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERPOLATION_ERROR',
        message: 'CustomInterpolator.compute failed',
      }),
    );
    // linear fallback still drove a position update
    expect(adapter.updatePosition).toHaveBeenCalled();
  });

  it('disposes a CustomInterpolator on destroy', () => {
    const adapter = new FullAdapter();
    const dispose = vi.fn();
    const ci: CustomInterpolator = { compute: (_f, to) => to, dispose };
    const t = new Tracker({ adapter, interpolation: ci });
    t.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('Tracker anomalous jump — adapter without updateOpacity', () => {
  it('snaps directly to current when updateOpacity is unavailable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new MinimalAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0 });
    t.ingest([pos('v1', 0, 0, { speed: 5 })]);
    vi.setSystemTime(2000);
    t.ingest([pos('v1', 10, 0, { speed: 5 })]); // impossible jump
    t.tickOnce();
    expect(adapter.updatePosition).toHaveBeenCalled();
  });

  it('runs the fade-out → snap → fade-in setTimeout path when updateOpacity exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0, fadeAnimation: { duration: 400 } });
    t.ingest([pos('v1', 0, 0, { speed: 5 })]);
    vi.setSystemTime(2000);
    t.ingest([pos('v1', 10, 0, { speed: 5 })]);
    t.tickOnce();
    vi.advanceTimersByTime(400); // fire the mid-jump setTimeout
    expect(adapter.updatePosition).toHaveBeenCalledWith('v1', expect.objectContaining({ lng: 10 }));
  });
});

describe('Tracker fade-in via requestAnimationFrame', () => {
  it('drives the opacity step loop when requestAnimationFrame is available', () => {
    // performance.now advances by a large step each call so the eased loop
    // completes (t ≥ 1) in a single rAF step instead of busy-looping.
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));

    // requestAnimationFrame is absent in the node test env — define one that
    // runs the callback synchronously, then remove it afterwards.
    let rafCalls = 0;
    const g = globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number };
    g.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      rafCalls++;
      cb(0);
      return 0;
    };

    try {
      const adapter = new FullAdapter();
      const t = new Tracker({ adapter, initialPositionBehavior: 'fade-in' });
      t.ingest([pos('v1')]);

      expect(rafCalls).toBeGreaterThan(0);
      // final opacity (to = 1) applied through the step body
      const opacities = adapter.updateOpacity.mock.calls.map((c) => c[1]);
      expect(opacities).toContain(1);
    } finally {
      delete g.requestAnimationFrame;
    }
  });
});

describe('Tracker stats branches', () => {
  it('falls back to slots×64 when the adapter has no getMemoryEstimate', () => {
    const adapter = new MinimalAdapter();
    const t = new Tracker({ adapter });
    t.ingest([pos('v1'), pos('v2')]);
    const stats = t.getStats();
    expect(stats.memoryBreakdown.adapterEstimateBytes).toBe(2 * 64);
  });

  it('computes tick-duration percentiles after ticks have run', () => {
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter });
    t.ingest([pos('v1')]);
    for (let i = 0; i < 5; i++) t.tickOnce();
    const stats = t.getStats();
    expect(stats.performanceMetrics.tickHistoryP50).toBeGreaterThanOrEqual(0);
    expect(stats.performanceMetrics.tickHistoryP99).toBeGreaterThanOrEqual(0);
  });

  it('counts dropped ticks when a tick exceeds the 16ms budget', () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 50)); // every tick "takes" 50ms
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter });
    t.ingest([pos('v1')]);
    t.tickOnce();
    const stats = t.getStats();
    expect(stats.performanceMetrics.droppedTicks).toBeGreaterThan(0);
  });

  it('trims ingest timestamps older than 60s from the rate window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const adapter = new FullAdapter();
    const t = new Tracker({ adapter, ingestThrottle: 0 });
    t.ingest([pos('v1')]); // timestamp 1000
    vi.setSystemTime(70_000); // >60s later → old stamp trimmed on next ingest
    t.ingest([pos('v1', 29.001)]);
    const stats = t.getStats();
    // only the recent ingest remains inside the 60s window
    expect(stats.performanceMetrics.ingestRate).toBeCloseTo(1 / 60, 5);
  });
});
