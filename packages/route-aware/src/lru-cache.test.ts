import { describe, expect, it } from 'vitest';
import { LRU } from './lru-cache';

describe('LRU', () => {
  it('throws when capacity < 1', () => {
    expect(() => new LRU<string, number>(0)).toThrow();
  });

  it('stores and retrieves up to capacity', () => {
    const c = new LRU<string, number>(3);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.size).toBe(3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('evicts the least-recently-used entry when capacity is exceeded', () => {
    const c = new LRU<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // evicts 'a'
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
  });

  it('get() moves the entry to "most recent" so it survives eviction', () => {
    const c = new LRU<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // touch 'a' → 'b' is now oldest
    c.set('c', 3); // evicts 'b'
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
  });

  it('re-setting an existing key updates the value and touches it', () => {
    const c = new LRU<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 99); // 'a' refreshed, 'b' is oldest
    c.set('c', 3); // evicts 'b'
    expect(c.get('a')).toBe(99);
    expect(c.has('b')).toBe(false);
  });

  it('clear empties the store', () => {
    const c = new LRU<string, number>(3);
    c.set('a', 1);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });
});
