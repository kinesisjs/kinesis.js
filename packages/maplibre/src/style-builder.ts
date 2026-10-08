import type { TrailPoint } from '@kinesisjs/core';
import type { SpeedColorBand, VehicleStyle, VehicleStyleOptions } from './types';

/** Sprite id the adapter registers its built-in arrow under. */
export const DEFAULT_ICON_ID = 'kinesis-arrow';

/** Native pixel size of the generated arrow sprite. */
export const ARROW_SPRITE_SIZE = 64;

/**
 * Arrow outline, normalised to the unit square, pointing north (y grows down).
 * Flat `x, y, x, y…` so the inner loops never index a tuple.
 */
const ARROW_PATH = Object.freeze([0.5, 0.04, 0.94, 0.95, 0.5, 0.71, 0.06, 0.95]);

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
 * Build a heading-aware style factory. Returns a `(vehicle, id) => VehicleStyle`
 * suitable for `MapLibreAdapterOptions.style`.
 *
 * Unlike the Leaflet helper this does not build an icon — it produces the plain
 * values (`color`, `rotation`, `size`) that the adapter writes onto the feature
 * and the layer reads back through data-driven expressions. Rotation is applied
 * by the GPU via `icon-rotate`, so it costs nothing per vehicle.
 *
 * @example
 * ```ts
 * new MapLibreAdapter(map, {
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
): (vehicle: TrailPoint) => VehicleStyle {
  // Numeric options are coerced to finite numbers: an untyped JS caller must
  // not be able to push NaN into a paint expression, which would blank the
  // layer rather than fail loudly.
  const iconSize = toFinite(options.iconSize, 24);
  const rotationOffset = toFinite(options.rotationOffset, 0);
  const defaultColor = options.defaultColor ?? '#3b82f6';
  const bands = options.speedColorBands ?? [];
  const customIcon = options.icon;

  // `icon-size` is a multiplier over the sprite's native size. For the built-in
  // arrow that size is known, so a pixel request converts exactly. For a custom
  // sprite it is not, so `iconScale` is passed through untouched.
  const size = customIcon ? toFinite(options.iconScale, 1) : iconSize / ARROW_SPRITE_SIZE;

  return (vehicle: TrailPoint): VehicleStyle => {
    const speed = toFinite(vehicle.speed, 0);
    const color = bands.length > 0 ? colorForSpeed(speed, bands, defaultColor) : defaultColor;
    // `heading` comes from the (untrusted) position feed and is not
    // number-validated by core.
    const rotation = toFinite(vehicle.heading, 0) + rotationOffset;

    const style: VehicleStyle = { color, rotation, size };
    if (customIcon) style.icon = customIcon;
    return style;
  };
}

/** Coerce an unknown value to a finite number, or `fallback` if it isn't one. */
function toFinite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Generate the built-in arrow as an **SDF** sprite, as raw RGBA bytes.
 *
 * MapLibre resolves icons from the style's sprite sheet, which a headless or
 * minimal style may not provide. Rather than ship a PNG and a fetch, the arrow
 * is computed: for each pixel the signed distance to the arrow outline is
 * encoded into the alpha channel (128 = exactly on the edge, higher inside).
 *
 * Registering it with `{ sdf: true }` is what makes `icon-color` work, so one
 * sprite serves every vehicle colour — no per-colour sprite sheet, and no
 * canvas or DOM, which keeps the whole thing testable under Node.
 */
export function createArrowImage(size: number = ARROW_SPRITE_SIZE): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const n = ARROW_PATH.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (ARROW_PATH[i * 2] as number) * size;
    ys[i] = (ARROW_PATH[i * 2 + 1] as number) * size;
  }

  // How many pixels the distance ramp spans either side of the edge. Too tight
  // and the edge aliases; too wide and the shape softens.
  const spread = size / 8;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // One pass over the edges yields both the nearest-edge distance and the
      // ray-crossing parity that gives it a sign.
      let nearestSq = Infinity;
      let inside = false;

      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = xs[i] as number;
        const yi = ys[i] as number;
        const xj = xs[j] as number;
        const yj = ys[j] as number;

        const vx = xj - xi;
        const vy = yj - yi;
        const lenSq = vx * vx + vy * vy;
        let t = lenSq === 0 ? 0 : ((px - xi) * vx + (py - yi) * vy) / lenSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - (xi + t * vx);
        const dy = py - (yi + t * vy);
        const dSq = dx * dx + dy * dy;
        if (dSq < nearestSq) nearestSq = dSq;

        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }

      const signed = (inside ? 1 : -1) * Math.sqrt(nearestSq);
      let alpha = Math.round(128 + (signed / spread) * 128);
      alpha = alpha < 0 ? 0 : alpha > 255 ? 255 : alpha;

      const o = (y * size + x) * 4;
      // SDF sprites are tinted by `icon-color`; RGB is ignored, alpha carries
      // the field.
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = alpha;
    }
  }

  return { width: size, height: size, data };
}
