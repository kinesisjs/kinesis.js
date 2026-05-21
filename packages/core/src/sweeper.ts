import type { SweepResult, VehicleSlot, VehicleState } from './types';

/**
 * Multi-state vehicle lifecycle manager.
 *
 * Every `checkInterval` it walks the slots and reports state transitions
 * (based on idle time) through `onStateChange`. `completed` is a terminal
 * state — slots that enter it are no longer swept (the Tracker has already
 * removed them).
 */
export class Sweeper {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly slots: Map<string, VehicleSlot>,
    private readonly warningThreshold: number,
    private readonly staleThreshold: number,
    private readonly checkInterval: number,
    private readonly onStateChange: (result: SweepResult) => void,
  ) {}

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.sweep(Date.now()), this.checkInterval);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Test helper — run a single sweep cycle manually. */
  sweep(now: number): void {
    for (const [vehicleId, slot] of this.slots) {
      const idleMs = now - slot.lastIngestAt;
      const next = this.classify(idleMs, slot.state);
      if (next !== null && next !== slot.state) {
        this.onStateChange({
          vehicleId,
          state: next,
          lastSeen: slot.lastIngestAt,
          reason: this.reasonFor(next, idleMs),
        });
      }
    }
  }

  private classify(idleMs: number, current: VehicleState): VehicleState | null {
    if (current === 'completed') return null;
    if (idleMs >= this.staleThreshold) return 'stale';
    if (idleMs >= this.warningThreshold) return 'warning';
    return current === 'warning' ? 'active' : null;
  }

  private reasonFor(state: VehicleState, idleMs: number): string {
    switch (state) {
      case 'warning':
        return `no data for ${idleMs}ms (warning threshold)`;
      case 'stale':
        return `no data for ${idleMs}ms (stale threshold)`;
      case 'active':
        return 'recovered from warning';
      case 'completed':
        return 'manually marked completed';
    }
  }
}
