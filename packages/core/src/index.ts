// Classes
export { Tracker } from './tracker';
export { Clock } from './clock';
export { Interpolator } from './interpolator';
export { AdaptiveInterpolator } from './adaptive-interpolator';
export { EventBus } from './event-bus';
export { Sweeper } from './sweeper';

// Utilities — public for authors of route-aware, predict, and custom interpolators.
export { haversineDistance, shortestArcDiff, linearLerp } from './math-utils';

// Types
export type {
  // Core data
  Position,
  TrailPoint,
  VehicleSlot,
  VehicleState,
  SweepResult,
  InitialPositionBehavior,

  // Tracker config + state
  TrackerOptions,
  TrackerStats,
  TrackerEventMap,
  FadeAnimationOptions,

  // Adapter contract
  TrackAdapter,

  // Interpolation
  InterpolationMode,
  CustomInterpolator,
  InterpolationOptions,
  AdaptiveOptions,
  AdaptiveBehavior,

  // Errors
  TrackerError,
  TrackerErrorCode,
} from './types';

export const VERSION = '0.1.0' as const;
