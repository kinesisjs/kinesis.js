/**
 * Bounded LRU cache built on a single `Map`. Relies on Map preserving
 * insertion order: a `get`-then-reinsert pattern moves entries to the
 * "most recently used" end; eviction removes the oldest key. No linked-list
 * bookkeeping, no extra allocations beyond what Map itself does.
 */
export class LRU<K, V> {
  private readonly store = new Map<K, V>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('LRU capacity must be >= 1');
    }
  }

  get(key: K): V | undefined {
    const v = this.store.get(key);
    if (v === undefined) return undefined;
    // Touch: delete + set moves the entry to "most recent" (the tail).
    this.store.delete(key);
    this.store.set(key, v);
    return v;
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.capacity) {
      const oldest = this.store.keys().next().value as K;
      this.store.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
