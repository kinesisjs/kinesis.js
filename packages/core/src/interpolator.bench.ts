import { bench, describe } from 'vitest';
import { AdaptiveInterpolator } from './adaptive-interpolator';
import { Interpolator } from './interpolator';
import { haversineDistance, linearLerp, shortestArcDiff } from './math-utils';
import type { TrailPoint } from './types';

const from: TrailPoint = {
  lng: 29.0,
  lat: 41.0,
  ts: 0,
  receivedAt: 0,
  speed: 50,
  heading: 90,
};
const to: TrailPoint = {
  lng: 29.001,
  lat: 41.001,
  ts: 1000,
  receivedAt: 1000,
  speed: 55,
  heading: 95,
};

describe('Interpolator.compute (allocation-az tek-tick path)', () => {
  const linear = new Interpolator('linear');
  const cubic = new Interpolator('cubic');
  const geodesic = new Interpolator('geodesic');
  const adaptive = new AdaptiveInterpolator();

  bench('linear', () => {
    linear.compute(from, to, 0.5);
  });

  bench('cubic', () => {
    cubic.compute(from, to, 0.5);
  });

  bench('geodesic', () => {
    geodesic.compute(from, to, 0.5);
  });

  bench('adaptive (linear zone)', () => {
    adaptive.compute(from, to, 0.5);
  });

  bench('linear with forceCubic flag', () => {
    linear.compute(from, to, 0.5, true, true);
  });
});

describe('math-utils — helpers (route-aware + predict paketleri tarafından da kullanılır)', () => {
  bench('haversineDistance (yakın noktalar ~140m)', () => {
    haversineDistance(from, to);
  });

  bench('shortestArcDiff (350→10° crossover)', () => {
    shortestArcDiff(350, 10);
  });

  bench('linearLerp standalone (CustomInterpolator async fallback path)', () => {
    linearLerp(from, to, 0.5, true);
  });
});
