/**
 * Typed, minimal-allocation event emitter. Similar to mitt; no dependencies.
 */
export class EventBus<TEventMap extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof TEventMap, Set<(payload: unknown) => void>>();

  /**
   * Register a listener. The returned function unsubscribes when called.
   */
  on<K extends keyof TEventMap>(event: K, handler: (payload: TEventMap[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => {
      set?.delete(handler as (payload: unknown) => void);
    };
  }

  /**
   * Emit an event. Payload is optional for void-payload events.
   */
  emit<K extends keyof TEventMap>(event: K, payload?: TEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }

  /** Drop every listener. Called from `Tracker.destroy()`. */
  removeAllListeners(): void {
    this.handlers.clear();
  }

  /** Listener count for an event (debug + tests). */
  listenerCount<K extends keyof TEventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
