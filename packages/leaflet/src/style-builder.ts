import { divIcon } from 'leaflet';
import type { DivIcon } from 'leaflet';
import type { TrailPoint } from '@kinesisjs/core';
import type { SpeedColorBand, VehicleStyleOptions } from './types';

/**
 * Resolve a colour for a speed (km/h) against ascending bands. The first band
 * whose `max` covers the speed wins; an empty list yields `fallback`.
 */
export function colorForSpeed(speed: number, bands: SpeedColorBand[], fallback: string): string {
  for (const band of bands) {
    if (speed <= band.max) return band.color;
  }
  return bands.length > 0 ? (bands[bands.length - 1]?.color ?? fallback) : fallback;
}

/**
 * Build a heading-aware Leaflet icon factory. Returns a
 * `(vehicle, id) => DivIcon` suitable for `LeafletAdapterOptions.style`.
 *
 * Leaflet has no native marker rotation, so rotation is baked into the icon
 * HTML (an inline `transform: rotate(...)`). Both the image-icon and SVG-dot
 * variants rotate to `heading + rotationOffset`.
 *
 * @example
 * ```ts
 * new LeafletAdapter(map, {
 *   style: createVehicleStyle({
 *     speedColorBands: [
 *       { max: 30, color: '#22c55e' },
 *       { max: 80, color: '#eab308' },
 *       { max: 130, color: '#ef4444' },
 *     ],
 *   }),
 * });
 * ```
 */
export function createVehicleStyle(
  options: VehicleStyleOptions = {},
): (vehicle: TrailPoint) => DivIcon {
  const size = options.iconSize ?? 24;
  const radius = options.circleRadius ?? 6;
  const rotationOffset = options.rotationOffset ?? 0;
  const defaultColor = options.defaultColor ?? '#3b82f6';
  const bands = options.speedColorBands ?? [];

  return (vehicle: TrailPoint): DivIcon => {
    const color =
      bands.length > 0 ? colorForSpeed(vehicle.speed ?? 0, bands, defaultColor) : defaultColor;
    const rotation = (vehicle.heading ?? 0) + rotationOffset;
    const html = options.icon
      ? imageHtml(options.icon, size, rotation)
      : dotHtml(color, size, radius, rotation, vehicle.heading !== undefined);

    return divIcon({
      className: 'kinesis-vehicle',
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };
}

function imageHtml(src: string, size: number, rotation: number): string {
  return `<img src="${src}" width="${size}" height="${size}" style="display:block;transform:rotate(${rotation}deg);transform-origin:center;" />`;
}

function dotHtml(
  color: string,
  size: number,
  radius: number,
  rotation: number,
  hasHeading: boolean,
): string {
  const c = size / 2;
  // Optional heading arrow above the dot — only drawn when a heading is known.
  const arrow = hasHeading
    ? `<polygon points="${c},${c - radius - 4} ${c - 4},${c - radius + 2} ${c + 4},${c - radius + 2}" fill="${color}" />`
    : '';
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ` +
    `style="transform:rotate(${rotation}deg);transform-origin:center;display:block;">` +
    `<circle cx="${c}" cy="${c}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="2" />` +
    arrow +
    `</svg>`
  );
}
