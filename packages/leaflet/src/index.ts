export { LeafletAdapter } from './leaflet-adapter';
export { createVehicleStyle, colorForSpeed } from './style-builder';

export type {
  LeafletAdapterOptions,
  TrailRenderOptions,
  VehicleStyleOptions,
  VehicleStyleProvider,
  SpeedColorBand,
} from './types';

export const VERSION = '0.1.0' as const;
