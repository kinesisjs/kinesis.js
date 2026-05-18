import type { SweepResult, VehicleSlot, VehicleState } from './types';

/**
 * Multi-state vehicle lifecycle yöneticisi.
 *
 * Her `checkInterval`'da slot'ları gezer, idle süresine göre state geçişlerini
 * `onStateChange` ile bildirir. `completed` terminal state'tir; bu state'e geçen
 * araç bir daha sweep'lenmez (Tracker zaten kaldırdı).
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

  /** Test helper: bir sweep döngüsünü manuel çalıştır. */
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
