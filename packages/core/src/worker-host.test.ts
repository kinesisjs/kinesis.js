import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tracker } from './tracker';
import type { TrackAdapter, TrackerStats } from './types';
import type { MainToWorkerMessage, WorkerToMainMessage } from './worker-protocol';
import { WorkerTracker } from './worker-host';

/** In-memory Worker stand-in: records posted messages, lets tests drive replies. */
class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerToMainMessage>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: MainToWorkerMessage[] = [];
  terminated = false;

  constructor(
    public url: string | URL,
    public opts?: unknown,
  ) {
    MockWorker.instances.push(this);
  }

  postMessage(msg: MainToWorkerMessage): void {
    this.posted.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulate a message arriving from the worker thread. */
  fromWorker(msg: WorkerToMainMessage): void {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerToMainMessage>);
  }

  /** Simulate an uncaught worker error. */
  crash(message: string): void {
    this.onerror?.({ message, filename: 'worker.js', lineno: 1 } as ErrorEvent);
  }
}

const makeAdapter = (): { adapter: TrackAdapter; calls: string[] } => {
  const calls: string[] = [];
  const adapter: TrackAdapter = {
    addVehicle: (id) => void calls.push(`add:${id}`),
    updatePosition: (id) => void calls.push(`update:${id}`),
    removeVehicle: (id) => void calls.push(`remove:${id}`),
    setVehicleState: (id, s) => void calls.push(`state:${id}:${s}`),
    destroy: () => void calls.push('destroy'),
  };
  return { adapter, calls };
};

const lastWorker = (): MockWorker => {
  const w = MockWorker.instances.at(-1);
  if (!w) throw new Error('no worker spawned');
  return w;
};

beforeEach(() => {
  MockWorker.instances = [];
  vi.stubGlobal('Worker', MockWorker);
  // Node has URL the constructor but not the object-URL helpers; add them.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'Blob',
    class {
      constructor(
        public parts: unknown[],
        public opts: unknown,
      ) {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { __KINESIS_WORKER_SOURCE__?: string }).__KINESIS_WORKER_SOURCE__;
});

describe('WorkerTracker — construction', () => {
  it('rejects a CustomInterpolator (cannot cross the worker boundary)', () => {
    const { adapter } = makeAdapter();
    expect(
      () =>
        new WorkerTracker({
          adapter,
          worker: true,
          interpolation: { compute: (_a, b) => b },
        }),
    ).toThrow(/CustomInterpolator/);
  });

  it('throws when the Web Worker API is unavailable', () => {
    const { adapter } = makeAdapter();
    vi.stubGlobal('Worker', undefined);
    expect(() => new WorkerTracker({ adapter, worker: true })).toThrow(/Web Worker API/);
  });

  it('throws on worker:true when inline source was not injected', () => {
    const { adapter } = makeAdapter();
    // __KINESIS_WORKER_SOURCE__ is undefined (only defined at build time).
    expect(() => new WorkerTracker({ adapter, worker: true })).toThrow(/inline worker source/);
  });

  it('spawns from an inline Blob when source is injected', () => {
    const { adapter } = makeAdapter();
    (globalThis as { __KINESIS_WORKER_SOURCE__?: string }).__KINESIS_WORKER_SOURCE__ =
      'self.onmessage=()=>{}';
    new WorkerTracker({ adapter, worker: true });
    expect(lastWorker().url).toBe('blob:mock');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('spawns from a URL when worker.url is provided', () => {
    const { adapter } = makeAdapter();
    new WorkerTracker({ adapter, worker: { url: 'https://example.test/w.js' } });
    expect(lastWorker().url).toBe('https://example.test/w.js');
  });

  it('sends an init message with serialized options (no adapter/function)', () => {
    const { adapter } = makeAdapter();
    new WorkerTracker({
      adapter,
      worker: { url: 'w.js' },
      interpolation: 'adaptive',
      renderLagMs: 500,
    });
    const init = lastWorker().posted[0];
    expect(init).toEqual({
      type: 'init',
      options: { interpolation: 'adaptive', renderLagMs: 500 },
    });
    // adapter must never be serialized into the message
    expect(JSON.stringify(init)).not.toContain('addVehicle');
  });
});

describe('WorkerTracker — command forwarding', () => {
  const setup = () => {
    const { adapter, calls } = makeAdapter();
    const tracker = new WorkerTracker({ adapter, worker: { url: 'w.js' } });
    const worker = lastWorker();
    worker.posted.length = 0; // drop the init message
    return { tracker, worker, calls };
  };

  it('forwards ingest/start/stop as messages', () => {
    const { tracker, worker } = setup();
    tracker.ingest([{ id: 'v1', lng: 29, lat: 41 }]);
    tracker.start();
    tracker.stop();
    expect(worker.posted.map((m) => m.type)).toEqual(['ingest', 'start', 'stop']);
  });

  it('markCompleted/removeVehicle forward and optimistically return true', () => {
    const { tracker, worker } = setup();
    expect(tracker.markCompleted('v1')).toBe(true);
    expect(tracker.removeVehicle('v2')).toBe(true);
    expect(worker.posted).toEqual([
      { type: 'markCompleted', vehicleId: 'v1' },
      { type: 'removeVehicle', vehicleId: 'v2' },
    ]);
  });

  it('destroy terminates the worker and is idempotent', () => {
    const { tracker, worker, calls } = setup();
    tracker.destroy();
    expect(worker.posted.at(-1)).toEqual({ type: 'destroy' });
    expect(worker.terminated).toBe(true);
    expect(calls).toContain('destroy');
    // second destroy is a no-op
    worker.posted.length = 0;
    tracker.destroy();
    expect(worker.posted).toEqual([]);
  });

  it('drops commands sent after destroy', () => {
    const { tracker, worker } = setup();
    tracker.destroy();
    worker.posted.length = 0;
    tracker.ingest([{ id: 'v1', lng: 29, lat: 41 }]);
    tracker.start();
    expect(worker.posted).toEqual([]);
  });
});

describe('WorkerTracker — worker → main', () => {
  const setup = () => {
    const { adapter, calls } = makeAdapter();
    const tracker = new WorkerTracker({ adapter, worker: { url: 'w.js' } });
    return { tracker, worker: lastWorker(), calls };
  };

  it('applies adapter calls onto the real adapter, in order', () => {
    const { tracker, worker, calls } = setup();
    const point = { lng: 29, lat: 41, ts: 0, receivedAt: 0 };
    worker.fromWorker({
      type: 'adapter',
      calls: [
        { call: 'addVehicle', id: 'v1', point },
        { call: 'updatePosition', id: 'v1', point },
        { call: 'setVehicleState', id: 'v1', state: 'warning' },
        { call: 'removeVehicle', id: 'v1' },
      ],
    });
    expect(calls).toEqual(['add:v1', 'update:v1', 'state:v1:warning', 'remove:v1']);
    void tracker;
  });

  it('re-emits worker events on the local bus', () => {
    const { tracker, worker } = setup();
    const ticks: number[] = [];
    tracker.on('tick', (p) => ticks.push(p.activeCount));
    worker.fromWorker({ type: 'event', name: 'tick', payload: { time: 1, activeCount: 3 } });
    expect(ticks).toEqual([3]);
  });

  it('caches the latest stats snapshot for getStats()', () => {
    const { tracker, worker } = setup();
    expect(tracker.getStats().vehicleCount).toBe(0); // empty before first snapshot
    const stats = { ...tracker.getStats(), vehicleCount: 7, fps: 60 } as TrackerStats;
    worker.fromWorker({ type: 'stats', stats });
    expect(tracker.getStats().vehicleCount).toBe(7);
    expect(tracker.getStats().fps).toBe(60);
  });

  it('surfaces an adapter exception as an error event', () => {
    const { adapter } = makeAdapter();
    adapter.updatePosition = () => {
      throw new Error('boom');
    };
    const tracker = new WorkerTracker({ adapter, worker: { url: 'w.js' } });
    const errors: string[] = [];
    tracker.on('error', (e) => errors.push(e.code));
    lastWorker().fromWorker({
      type: 'adapter',
      calls: [
        { call: 'updatePosition', id: 'v1', point: { lng: 0, lat: 0, ts: 0, receivedAt: 0 } },
      ],
    });
    expect(errors).toEqual(['ADAPTER_ERROR']);
  });

  it('surfaces a worker crash as a WORKER_ERROR event', () => {
    const { tracker, worker } = setup();
    const errors: { code: string; message: string }[] = [];
    tracker.on('error', (e) => errors.push({ code: e.code, message: e.message }));
    worker.crash('worker exploded');
    expect(errors).toEqual([{ code: 'WORKER_ERROR', message: 'worker exploded' }]);
  });
});

describe('Tracker → WorkerTracker delegation', () => {
  it('new Tracker({ worker: { url } }) returns a WorkerTracker transparently', () => {
    const { adapter } = makeAdapter();
    const tracker = new Tracker({ adapter, worker: { url: 'w.js' } });
    expect(tracker).toBeInstanceOf(WorkerTracker);
    // init message went to the spawned worker
    expect(lastWorker().posted[0]?.type).toBe('init');
  });

  it('new Tracker({}) without worker stays a real main-thread Tracker', () => {
    const { adapter } = makeAdapter();
    const tracker = new Tracker({ adapter });
    expect(tracker).toBeInstanceOf(Tracker);
    expect(tracker).not.toBeInstanceOf(WorkerTracker);
    expect(MockWorker.instances).toHaveLength(0);
  });
});
