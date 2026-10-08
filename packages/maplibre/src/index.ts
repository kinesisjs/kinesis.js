export { MapLibreAdapter } from './maplibre-adapter';
export {
  createVehicleStyle,
  colorForSpeed,
  createArrowImage,
  DEFAULT_ICON_ID,
  ARROW_SPRITE_SIZE,
} from './style-builder';

export type {
  MapLibreAdapterOptions,
  TrailRenderOptions,
  VehicleStyle,
  VehicleStyleOptions,
  VehicleStyleProvider,
  SpeedColorBand,
} from './types';

export const VERSION = '0.1.0' as const;
