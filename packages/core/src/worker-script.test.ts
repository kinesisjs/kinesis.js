import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainToWorkerMessage, WorkerToMainMessage } from './worker-protocol';

/**
 * worker-script runs in a DedicatedWorkerGlobalScope. We emulate that by
 * stubbing `self` before importing the module (it binds `self.onmessage` at
 * import time), then drive it by invoking the captured handler.
 */
let posted: WorkerToMainMessage[];
let handler: ((e: MessageEvent<MainToWorkerMessage>) => void) | null;

const send = (msg: MainToWorkerMessage): void => {
  if (!handler) throw new Error('worker has no onmessage handler');
  handler({ data: msg } as MessageEvent<MainToWorkerMessage>);
};

beforeEach(async () => {
  vi.resetModules();
  posted = [];
  handler = null;
  vi.stubGlobal('self', {
    set onmessage(h: typeof handler) {
      handler = h;
    },
    get onmessage() {
      return handler;
    },
    postMessage: (m: WorkerToMainMessage) => void posted.push(m),
  });
  await import('./worker-script');
});

describe('worker-script', () => {
  it('binds an onmessage handler at import time', () => {
    expect(handler).toBeTypeOf('function');
  });

  it('init posts a ready handshake', () => {
    send({ type: 'init', options: {} });
    expect(posted).toContainEqual({ type: 'ready' });
  });

  it('ingest of a new vehicle emits an addVehicle adapter call', () => {
    send({ type: 'init', options: { initialPositionBehavior: 'show-immediately' } });
    posted.length = 0;
    send({ type: 'ingest', positions: [{ id: 'v1', lng: 29, lat: 41 }] });

    const adapterMsg = posted.find((m) => m.type === 'adapter');
    expect(adapterMsg).toBeDefined();
    if (adapterMsg?.type === 'adapter') {
      expect(adapterMsg.calls[0]).toMatchObject({ call: 'addVehicle', id: 'v1' });
    }
  });

  it('forwards the ingest event back to the main thread', () => {
    send({ type: 'init', options: {} });
    posted.length = 0;
    send({ type: 'ingest', positions: [{ id: 'v1', lng: 29, lat: 41 }] });

    const ingestEvent = posted.find((m) => m.type === 'event' && m.name === 'ingest');
    expect(ingestEvent).toBeDefined();
  });

  it('does nothing for commands received before init (no tracker yet)', () => {
    // start/stop/ingest before init should not throw
    expect(() => {
      send({ type: 'start' });
      send({ type: 'ingest', positions: [{ id: 'v1', lng: 29, lat: 41 }] });
      send({ type: 'stop' });
    }).not.toThrow();
  });

  it('start then stop run without error after init', () => {
    send({ type: 'init', options: {} });
    expect(() => {
      send({ type: 'start' });
      send({ type: 'stop' });
    }).not.toThrow();
  });

  it('markCompleted removes the vehicle and flushes a removeVehicle adapter call', () => {
    send({ type: 'init', options: { initialPositionBehavior: 'show-immediately' } });
    send({ type: 'ingest', positions: [{ id: 'v1', lng: 29, lat: 41 }] });
    posted.length = 0;
    send({ type: 'markCompleted', vehicleId: 'v1' });

    const adapterMsg = posted.find((m) => m.type === 'adapter');
    expect(adapterMsg).toBeDefined();
    if (adapterMsg?.type === 'adapter') {
      expect(adapterMsg.calls).toContainEqual({ call: 'removeVehicle', id: 'v1' });
    }
  });

  it('removeVehicle flushes a removeVehicle adapter call', () => {
    send({ type: 'init', options: { initialPositionBehavior: 'show-immediately' } });
    send({ type: 'ingest', positions: [{ id: 'v1', lng: 29, lat: 41 }] });
    posted.length = 0;
    send({ type: 'removeVehicle', vehicleId: 'v1' });

    const adapterMsg = posted.find((m) => m.type === 'adapter');
    expect(adapterMsg).toBeDefined();
    if (adapterMsg?.type === 'adapter') {
      expect(adapterMsg.calls).toContainEqual({ call: 'removeVehicle', id: 'v1' });
    }
  });

  it('destroy tears down and ignores subsequent ingest', () => {
    send({ type: 'init', options: {} });
    send({ type: 'ingest', positions: [{ id: 'v1', lng: 29, lat: 41 }] });
    send({ type: 'destroy' });
    posted.length = 0;
    // after destroy, tracker is null — ingest is a no-op, no adapter calls
    send({ type: 'ingest', positions: [{ id: 'v2', lng: 29, lat: 41 }] });
    expect(posted.find((m) => m.type === 'adapter')).toBeUndefined();
  });
});
