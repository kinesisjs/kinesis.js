/**
 * rAF tabanlı tick üretici. `setInterval` yerine `requestAnimationFrame` kullanır
 * çünkü tab background'a düştüğünde rAF temiz durur; setInterval birikmiş tick'leri
 * geri geldiğinde "catchup" yapar ve görsel sıçramaya neden olur.
 *
 * FPS bilgisi saniyede bir güncellenir.
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

  /** Test/SSR helper: bir tick'i manuel çalıştır (yalnızca testlerde). */
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
    // Node.js ortamı: rAF yoksa scheduleNext bir no-op. Test ortamında tickOnce() kullanılır.
  }
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
