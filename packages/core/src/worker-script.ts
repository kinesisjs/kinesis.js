import { Tracker } from './tracker';
import type { TrackAdapter, TrailPoint, VehicleState, TrackerEventMap } from './types';
import type { AdapterCall, MainToWorkerMessage, WorkerToMainMessage } from './worker-protocol';

/**
 * Worker-thread entry point. Hosts a real Tracker driven by a ProxyAdapter
 * that forwards every adapter call back to the main thread, where the real
 * map adapter lives. This file is bundled separately (IIFE) and either
 * inlined as a Blob (worker: true) or loaded from a URL (worker: { url }).
 *
 * It must run only inside a Worker — the top-level `self.onmessage` assignment
 * is a no-op (and harmless) anywhere `self` is undefined.
 */

// The DOM lib types the global `self` as Window, but this file runs in a
// DedicatedWorkerGlobalScope. Cast to the minimal worker-message surface we
// use rather than pulling in the "webworker" lib (which conflicts with DOM).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<MainToWorkerMessage>) => void) | null;
  postMessage(message: WorkerToMainMessage): void;
};

const STATS_EVERY_N_TICKS = 30;

/**
 * Buffers adapter calls produced during a tick (or ingest) and hands them off
 * in a single postMessage. `updateOpacity` and `getMemoryEstimate` are
 * intentionally not implemented: the former is an rAF-driven animation that
 * belongs on the main thread (worker mode degrades fade → snap), the latter
 * would need a synchronous round-trip we don't support.
 */
class ProxyAdapter implements TrackAdapter {
  private buffer: AdapterCall[] = [];

  addVehicle(id: string, point: TrailPoint): void {
    this.buffer.push({ call: 'addVehicle', id, point });
  }

  updatePosition(id: string, point: TrailPoint): void {
    this.buffer.push({ call: 'updatePosition', id, point });
  }

  removeVehicle(id: string): void {
    this.buffer.push({ call: 'removeVehicle', id });
  }

  setVehicleState(id: string, state: VehicleState): void {
    this.buffer.push({ call: 'setVehicleState', id, state });
  }

  destroy(): void {
    // Real teardown happens on the main thread's adapter.
  }

  drain(): AdapterCall[] {
    if (this.buffer.length === 0) return [];
    const calls = this.buffer;
    this.buffer = [];
    return calls;
  }
}

const FORWARDED_EVENTS: (keyof TrackerEventMap)[] = [
  'tick',
  'vehicleadded',
  'vehiclewarning',
  'vehiclestale',
  'vehiclecompleted',
  'vehicleremoved',
  'ingest',
  'error',
  'start',
  'stop',
  'destroy',
];

const adapter = new ProxyAdapter();
let tracker: Tracker | null = null;
let tickCount = 0;

const post = (message: WorkerToMainMessage): void => ctx.postMessage(message);

const flush = (): void => {
  const calls = adapter.drain();
  if (calls.length) post({ type: 'adapter', calls });
};

ctx.onmessage = (e: MessageEvent<MainToWorkerMessage>): void => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      tracker = new Tracker({ ...msg.options, adapter });
      for (const name of FORWARDED_EVENTS) {
        tracker.on(name, (payload) => {
          if (name === 'tick') {
            // Flush adapter calls produced during this tick BEFORE the tick
            // notification, so the main thread applies position updates first.
            flush();
            post({ type: 'event', name, payload });
            if (++tickCount % STATS_EVERY_N_TICKS === 0 && tracker) {
              post({ type: 'stats', stats: tracker.getStats() });
            }
          } else {
            post({ type: 'event', name, payload });
          }
        });
      }
      post({ type: 'ready' });
      break;
    }
    case 'ingest':
      tracker?.ingest(msg.positions);
      flush(); // emit any addVehicle calls triggered by first-sight slots
      break;
    case 'start':
      tracker?.start();
      break;
    case 'stop':
      tracker?.stop();
      break;
    case 'markCompleted':
      tracker?.markCompleted(msg.vehicleId);
      flush();
      break;
    case 'removeVehicle':
      tracker?.removeVehicle(msg.vehicleId);
      flush();
      break;
    case 'destroy':
      tracker?.destroy();
      flush();
      tracker = null;
      break;
  }
};
