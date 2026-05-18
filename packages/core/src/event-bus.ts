/**
 * Tipli, minimal allocation event emitter. Mitt benzeri; bağımlılık yok.
 */
export class EventBus<TEventMap extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof TEventMap, Set<(payload: unknown) => void>>();

  /**
   * Dinleyici ekle. Dönen fonksiyon çağrıldığında unsubscribe yapılır.
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
   * Event yayınla. void-payload event'ler için payload omit edilebilir.
   */
  emit<K extends keyof TEventMap>(event: K, payload?: TEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }

  /** Tüm listener'ları kaldır. `destroy()` akışında çağrılır. */
  removeAllListeners(): void {
    this.handlers.clear();
  }

  /** Bir event için kayıtlı handler sayısı (debug + test). */
  listenerCount<K extends keyof TEventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
