import { bench, describe } from 'vitest';
import { Tracker } from './tracker';
import type { Position, TrackAdapter, TrailPoint } from './types';

/**
 * Mock adapter — no-op'lar, sadece çağrı sayısını kaydeder.
 * Benchmark'ta adapter işi pure overhead olmamalı; biz sadece core'u ölçüyoruz.
 */
class NoopAdapter implements TrackAdapter {
  addVehicle(_id: string, _p: TrailPoint): void {}
  updatePosition(_id: string, _p: TrailPoint): void {}
  removeVehicle(_id: string): void {}
  destroy(): void {}
}

const generatePositions = (count: number, baseLng = 29, baseLat = 41): Position[] => {
  const positions: Position[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      id: `v${i}`,
      lng: baseLng + (Math.random() - 0.5) * 0.1,
      lat: baseLat + (Math.random() - 0.5) * 0.1,
      speed: 30 + Math.random() * 50,
      heading: Math.random() * 360,
    });
  }
  return positions;
};

const movePositions = (positions: Position[]): Position[] =>
  positions.map((p) => ({
    ...p,
    lng: p.lng + (Math.random() - 0.5) * 0.001,
    lat: p.lat + (Math.random() - 0.5) * 0.001,
  }));

describe('Tracker.ingest — ilk pozisyon (slot yaratma + adapter.addVehicle)', () => {
  bench('100 araç', () => {
    const tracker = new Tracker({ adapter: new NoopAdapter(), ingestThrottle: 0 });
    tracker.ingest(generatePositions(100));
  });

  bench('500 araç', () => {
    const tracker = new Tracker({ adapter: new NoopAdapter(), ingestThrottle: 0 });
    tracker.ingest(generatePositions(500));
  });

  bench('1000 araç', () => {
    const tracker = new Tracker({ adapter: new NoopAdapter(), ingestThrottle: 0 });
    tracker.ingest(generatePositions(1000));
  });
});

describe('Tracker.ingest — ikinci pozisyon (slot shift, allocation-free path)', () => {
  bench('100 araç', () => {
    const tracker = new Tracker({ adapter: new NoopAdapter(), ingestThrottle: 0 });
    const first = generatePositions(100);
    tracker.ingest(first);
    tracker.ingest(movePositions(first));
  });

  bench('500 araç', () => {
    const tracker = new Tracker({ adapter: new NoopAdapter(), ingestThrottle: 0 });
    const first = generatePositions(500);
    tracker.ingest(first);
    tracker.ingest(movePositions(first));
  });

  bench('1000 araç', () => {
    const tracker = new Tracker({ adapter: new NoopAdapter(), ingestThrottle: 0 });
    const first = generatePositions(1000);
    tracker.ingest(first);
    tracker.ingest(movePositions(first));
  });
});

describe('Tracker.tick — interpolation + sanity checks + adapter dispatch', () => {
  const setup = (count: number, interpolation: 'linear' | 'cubic' | 'adaptive' = 'linear') => {
    const tracker = new Tracker({
      adapter: new NoopAdapter(),
      ingestThrottle: 0,
      interpolation,
    });
    const first = generatePositions(count);
    tracker.ingest(first);
    tracker.ingest(movePositions(first));
    return tracker;
  };

  bench('100 araç (linear)', () => {
    const tracker = setup(100, 'linear');
    tracker.tickOnce();
  });

  bench('500 araç (linear)', () => {
    const tracker = setup(500, 'linear');
    tracker.tickOnce();
  });

  bench('1000 araç (linear)', () => {
    const tracker = setup(1000, 'linear');
    tracker.tickOnce();
  });

  bench('1000 araç (cubic)', () => {
    const tracker = setup(1000, 'cubic');
    tracker.tickOnce();
  });

  bench('1000 araç (adaptive)', () => {
    const tracker = setup(1000, 'adaptive');
    tracker.tickOnce();
  });
});
