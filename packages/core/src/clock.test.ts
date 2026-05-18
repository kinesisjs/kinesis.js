import { describe, expect, it, vi } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  it('does not invoke onTick before start()', () => {
    const onTick = vi.fn();
    new Clock(onTick);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('reports fps=0 before any tick', () => {
    const clock = new Clock(() => {});
    expect(clock.getFps()).toBe(0);
  });

  it('invokes onTick when tickOnce() called (test helper)', () => {
    const onTick = vi.fn();
    const clock = new Clock(onTick);
    clock.start();
    clock.tickOnce();
    expect(onTick).toHaveBeenCalled();
    clock.stop();
  });

  it('stop() prevents further ticks via the rAF chain', () => {
    const onTick = vi.fn();
    const clock = new Clock(onTick);
    clock.start();
    clock.stop();
    clock.tickOnce(); // isRunning false → loop returns immediately
    expect(onTick).not.toHaveBeenCalled();
  });

  it('start() is idempotent', () => {
    const clock = new Clock(() => {});
    clock.start();
    clock.start();
    clock.stop();
  });

  it('stop() is idempotent', () => {
    const clock = new Clock(() => {});
    clock.stop();
    clock.stop();
  });
});
