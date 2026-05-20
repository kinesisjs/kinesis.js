export { OpenLayersAdapter } from './openlayers-adapter';
export { createVehicleStyle, colorForSpeed } from './style-builder';

export type {
  OpenLayersAdapterOptions,
  TrailRenderOptions,
  VehicleStyleOptions,
  VehicleStyleProvider,
  SpeedColorBand,
} from './types';

export const VERSION = '0.1.0' as const;
