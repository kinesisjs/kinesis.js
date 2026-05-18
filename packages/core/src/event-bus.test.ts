import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './event-bus';

type TestEvents = {
  ping: { id: number };
  noop: void;
};

describe('EventBus', () => {
  it('delivers emitted payload to listener', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.emit('ping', { id: 1 });
    expect(handler).toHaveBeenCalledWith({ id: 1 });
  });

  it('supports multiple listeners for same event', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.emit('ping', { id: 7 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);
    off();
    bus.emit('ping', { id: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits void events without payload', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('noop', handler);
    bus.emit('noop');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('listenerCount reflects active subscribers', () => {
    const bus = new EventBus<TestEvents>();
    expect(bus.listenerCount('ping')).toBe(0);
    const off = bus.on('ping', () => {});
    expect(bus.listenerCount('ping')).toBe(1);
    off();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('removeAllListeners clears every subscription', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    bus.on('ping', a);
    bus.on('noop', vi.fn());
    bus.removeAllListeners();
    bus.emit('ping', { id: 3 });
    expect(a).not.toHaveBeenCalled();
    expect(bus.listenerCount('ping')).toBe(0);
    expect(bus.listenerCount('noop')).toBe(0);
  });
});
