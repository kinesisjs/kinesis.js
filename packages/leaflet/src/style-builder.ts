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
  // Numeric options are coerced to finite numbers: the result is interpolated
  // into HTML attributes, so a non-numeric value (e.g. from an untyped JS
  // caller) must never reach the markup.
  const size = toFinite(options.iconSize, 24);
  const radius = toFinite(options.circleRadius, 6);
  const rotationOffset = toFinite(options.rotationOffset, 0);
  const defaultColor = options.defaultColor ?? '#3b82f6';
  const bands = options.speedColorBands ?? [];

  return (vehicle: TrailPoint): DivIcon => {
    const speed = toFinite(vehicle.speed, 0);
    const color = bands.length > 0 ? colorForSpeed(speed, bands, defaultColor) : defaultColor;
    // `heading` arrives from the (untrusted) position feed and is NOT
    // number-validated by core — coerce it so a string payload can't break
    // out of the `style="transform:rotate(…)"` attribute.
    const rotation = toFinite(vehicle.heading, 0) + rotationOffset;
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

/** Coerce an unknown value to a finite number, or `fallback` if it isn't one. */
function toFinite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Escape a string for safe interpolation into a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function imageHtml(src: string, size: number, rotation: number): string {
  return `<img src="${escapeAttr(src)}" width="${size}" height="${size}" style="display:block;transform:rotate(${rotation}deg);transform-origin:center;" />`;
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
  const fill = escapeAttr(color);
  const arrow = hasHeading
    ? `<polygon points="${c},${c - radius - 4} ${c - 4},${c - radius + 2} ${c + 4},${c - radius + 2}" fill="${fill}" />`
    : '';
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ` +
    `style="transform:rotate(${rotation}deg);transform-origin:center;display:block;">` +
    `<circle cx="${c}" cy="${c}" r="${radius}" fill="${fill}" stroke="#fff" stroke-width="2" />` +
    arrow +
    `</svg>`
  );
}
