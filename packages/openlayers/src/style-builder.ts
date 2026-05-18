import Circle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Icon from 'ol/style/Icon';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import type { TrailPoint } from '@kinesisjs/core';
import type { SpeedColorBand, VehicleStyleOptions } from './types';

const DEFAULT_COLOR = '#3b82f6';

/**
 * Yaygın vehicle styling pattern'ları için fabrika. Dönen fn'i
 * `OpenLayersAdapter({ style: ... })`'a verirsin.
 *
 * - `icon` verilirse Icon style (heading'e göre rotate, opsiyonel offset).
 * - Yoksa Circle style; `speedColorBands` varsa hıza göre renk, yoksa `defaultColor`.
 */
export function createVehicleStyle(
  options: VehicleStyleOptions = {},
): (vehicle: TrailPoint) => Style {
  return (vehicle: TrailPoint): Style => {
    const color = options.speedColorBands
      ? colorForSpeed(vehicle.speed ?? 0, options.speedColorBands, options.defaultColor)
      : (options.defaultColor ?? DEFAULT_COLOR);

    if (options.icon) {
      return new Style({
        image: new Icon({
          src: options.icon,
          scale: options.iconScale ?? 1,
          rotation: degToRad((vehicle.heading ?? 0) + (options.rotationOffset ?? 0)),
          rotateWithView: true,
        }),
      });
    }

    return new Style({
      image: new Circle({
        radius: options.circleRadius ?? 6,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    });
  };
}

/**
 * Hıza göre renk bandı seç. Bantlar artan `max` sırasında olmalı.
 * Hız hiçbir banda denk gelmezse son bandın rengi (max'ten büyükler) veya defaultColor.
 */
export function colorForSpeed(speed: number, bands: SpeedColorBand[], fallback?: string): string {
  for (const band of bands) {
    if (speed <= band.max) return band.color;
  }
  return bands[bands.length - 1]?.color ?? fallback ?? DEFAULT_COLOR;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
