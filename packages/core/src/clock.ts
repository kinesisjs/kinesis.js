/**
 * rAF-based tick producer. Uses `requestAnimationFrame` rather than
 * `setInterval` because rAF pauses cleanly when the tab is backgrounded;
 * `setInterval` accumulates pending ticks and "catches up" on return, which
 * produces visible jumps in the rendered position.
 *
 * FPS is recomputed once per second.
 */
export class Clock {
  private rafId: number | null = null;
  private isRunning = false;
  private frameCount = 0;
  private fpsLastSample = 0;
  private fps = 0;

  constructor(private readonly onTick: (now: number) => void) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.fpsLastSample = now();
    this.frameCount = 0;
    this.scheduleNext();
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getFps(): number {
    return this.fps;
  }

  /** Test/SSR helper — run a single tick manually (intended for tests only). */
  tickOnce(): void {
    this.loop();
  }

  private readonly loop = (): void => {
    if (!this.isRunning) return;
    const t = now();
    this.frameCount++;

    if (t - this.fpsLastSample >= 1000) {
      this.fps = (this.frameCount * 1000) / (t - this.fpsLastSample);
      this.frameCount = 0;
      this.fpsLastSample = t;
    }

    this.onTick(t);
    this.scheduleNext();
  };

  private scheduleNext(): void {
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(this.loop);
    }
    // Node.js environment without rAF: scheduleNext is a no-op; tests call
    // `tickOnce()` directly.
  }
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
