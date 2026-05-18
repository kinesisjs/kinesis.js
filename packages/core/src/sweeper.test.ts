import { describe, expect, it, vi } from 'vitest';
import { Sweeper } from './sweeper';
import type { SweepResult, VehicleSlot } from './types';

const makeSlot = (lastIngestAt: number, state: VehicleSlot['state'] = 'active'): VehicleSlot => ({
  previous: null,
  current: { lng: 0, lat: 0, ts: 0, receivedAt: lastIngestAt },
  lastIngestAt,
  state,
  isAttached: true,
});

describe('Sweeper', () => {
  it('transitions active → warning when idle exceeds warningThreshold', () => {
    const slots = new Map<string, VehicleSlot>([['v1', makeSlot(0, 'active')]]);
    const cb = vi.fn<(r: SweepResult) => void>();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    sw.sweep(70_000); // 70s idle, warning threshold 60s
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].state).toBe('warning');
  });

  it('transitions warning → stale when idle exceeds staleThreshold', () => {
    const slots = new Map<string, VehicleSlot>([['v1', makeSlot(0, 'warning')]]);
    const cb = vi.fn<(r: SweepResult) => void>();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    sw.sweep(700_000); // 700s idle, stale threshold 600s
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].state).toBe('stale');
  });

  it('transitions warning → active when slot recovers', () => {
    const slots = new Map<string, VehicleSlot>([['v1', makeSlot(0, 'warning')]]);
    const cb = vi.fn<(r: SweepResult) => void>();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    // Slot's lastIngestAt is 0, but warning state was set earlier. New idle 30s < 60s threshold.
    sw.sweep(30_000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].state).toBe('active');
  });

  it('does not transition active vehicles within warning window', () => {
    const slots = new Map<string, VehicleSlot>([['v1', makeSlot(0, 'active')]]);
    const cb = vi.fn<(r: SweepResult) => void>();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    sw.sweep(30_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('completed is terminal — never reclassified', () => {
    const slots = new Map<string, VehicleSlot>([['v1', makeSlot(0, 'completed')]]);
    const cb = vi.fn<(r: SweepResult) => void>();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    sw.sweep(1_000_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('skips a sweep entry when state is unchanged', () => {
    const slots = new Map<string, VehicleSlot>([['v1', makeSlot(0, 'warning')]]);
    const cb = vi.fn<(r: SweepResult) => void>();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    sw.sweep(120_000); // still in warning range (60s-600s), no transition needed
    expect(cb).not.toHaveBeenCalled();
  });

  it('start/stop is idempotent', () => {
    const slots = new Map<string, VehicleSlot>();
    const cb = vi.fn();
    const sw = new Sweeper(slots, 60_000, 600_000, 60_000, cb);
    sw.start();
    sw.start();
    sw.stop();
    sw.stop();
    // No errors thrown — idempotency holds
  });
});
