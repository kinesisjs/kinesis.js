import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock } from './clock';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Clock fps sampling', () => {
  it('recomputes fps once at least one second of frames has elapsed', () => {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);

    const onTick = vi.fn();
    const clock = new Clock(onTick);

    t = 0;
    clock.start(); // fpsLastSample = 0, frameCount = 0
    expect(clock.getFps()).toBe(0);

    t = 1000; // one second later → loop crosses the fps sampling window
    clock.tickOnce();

    expect(onTick).toHaveBeenCalledWith(1000);
    expect(clock.getFps()).toBeGreaterThan(0);
  });

  it('start() is idempotent while already running', () => {
    const clock = new Clock(() => {});
    clock.start();
    expect(() => clock.start()).not.toThrow();
    clock.stop();
  });
});
