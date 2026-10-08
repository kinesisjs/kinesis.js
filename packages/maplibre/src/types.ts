import type { TrailPoint } from '@kinesisjs/core';

/**
 * Per-vehicle visual state. Unlike the Leaflet/OpenLayers adapters — which hand
 * the map library a fully-built icon or `Style` object per vehicle — MapLibre
 * renders every vehicle from a single GeoJSON source through one GPU layer. So
 * a "style" here is plain data written into the feature's properties, and the
 * layer's data-driven expressions turn it into pixels.
 *
 * That is what keeps the cost flat: 1000 vehicles are one `setData` call and
 * one draw call, not 1000 DOM nodes.
 */
export interface VehicleStyle {
  /** Symbol colour (CSS hex / rgb / named). Applied via `icon-color`. */
  color: string;
  /** Rotation in degrees, clockwise from north. */
  rotation: number;
  /** Scale multiplier applied to the icon. `1` renders it at its native size. */
  size: number;
  /**
   * Id of a sprite already registered on the map (`map.addImage(...)`) or
   * present in the map style. Overrides the built-in arrow.
   *
   * Note: `icon-color` only tints **SDF** images. A plain raster sprite is
   * drawn as-is and `color` is ignored for it.
   */
  icon?: string;
}

/**
 * Either a fixed style applied to every vehicle, or a `(vehicle, id) => style`
 * factory re-evaluated on each `updatePosition` (speed-banded colouring,
 * heading rotation, state-driven symbols).
 *
 * The {@link createVehicleStyle} helper produces a heading-aware factory.
 */
export type VehicleStyleProvider =
  VehicleStyle | ((vehicle: TrailPoint, vehicleId: string) => VehicleStyle);

export interface MapLibreAdapterOptions {
  /** Fixed style or per-vehicle style factory. Defaults to a heading-aware arrow. */
  style?: VehicleStyleProvider;

  /**
   * Source id for the vehicle GeoJSON. Default: `'kinesis-vehicles'`. Override
   * when running two adapters against one map, or to avoid a clash with a
   * source the host style already defines.
   */
  sourceId?: string;

  /** Layer id for the vehicle symbols. Default: `'kinesis-vehicles'`. */
  layerId?: string;

  /**
   * Insert the adapter's layers *below* this existing layer id (MapLibre's
   * `beforeId`). Omit to append on top of everything.
   */
  beforeId?: string;

  /**
   * Manage only vehicles whose ids appear in this set. Anything not listed is
   * never added, and `destroy()` only clears the listed features. Updatable at
   * runtime via `setManagedIds(...)`. If omitted, the adapter owns every
   * feature it creates.
   */
  managedFeatureIds?: Set<string> | string[];

  /**
   * Per-vehicle trail rendering (a line behind each vehicle). Defaults off;
   * pass `{ enabled: true }` to opt in. The trail layer is always inserted
   * before the vehicle layer, so trails render underneath their vehicles.
   */
  trail?: TrailRenderOptions;

  /**
   * Opacity (0–1) applied when a vehicle enters the `warning` state. Restored
   * to 1 on recovery to `active`. If omitted, opacity is never touched on state
   * transitions (gap visualisation stays opt-in). Typical value: 0.5–0.7.
   */
  warningOpacity?: number;
}

/**
 * Trail rendering options. The adapter keeps a per-vehicle bounded ring buffer
 * of recent coordinates and renders them as one `LineString` feature each, all
 * sharing a single line layer.
 *
 * Colour resolution order: explicit `color` → `TrailPoint.meta.color` (string)
 * → `defaultColor` → `'#3b82f6'`.
 */
export interface TrailRenderOptions {
  /** Enable trail rendering. Required `true` to opt in. */
  enabled: boolean;
  /** Ring-buffer capacity per vehicle. Default: 60. */
  maxPoints?: number;
  /**
   * Minimum interval (ms) between successive trail samples per vehicle. The
   * tick runs at the display refresh rate; without throttling the buffer fills
   * in under a second. Default: 100 (≈10 Hz). `0` samples on every tick.
   */
  intervalMs?: number;
  /** Line width in pixels. Default: 3. */
  width?: number;
  /** Line opacity, 0–1. Default: 0.5. */
  opacity?: number;
  /** Fixed trail colour (CSS hex / rgb / named). Overrides `meta.color` when set. */
  color?: string;
  /** Fallback when neither `color` nor `meta.color` is available. Default: '#3b82f6'. */
  defaultColor?: string;
  /** Source id for the trail GeoJSON. Default: `'kinesis-trails'`. */
  sourceId?: string;
  /** Layer id for the trail lines. Default: `'kinesis-trails'`. */
  layerId?: string;
}

export interface SpeedColorBand {
  /** Speeds at or below this value (km/h) get the band's colour. */
  max: number;
  /** CSS colour (hex, rgb, named). */
  color: string;
}

export interface VehicleStyleOptions {
  /**
   * Id of a sprite registered on the map via `map.addImage(id, ...)`, or one
   * present in the map style. Unlike the Leaflet adapter this is **not a URL** —
   * MapLibre resolves icons by sprite id. Omit to use the built-in arrow.
   */
  icon?: string;
  /**
   * Rendered size in pixels. Applies to the built-in arrow only, whose native
   * sprite size is known; ignored when `icon` is set. Default: 24.
   */
  iconSize?: number;
  /**
   * Scale multiplier for a custom `icon`, in MapLibre's `icon-size` terms
   * (1 = the sprite's native size). Ignored for the built-in arrow, which is
   * sized by `iconSize`. Default: 1.
   */
  iconScale?: number;
  /** Heading rotation offset in degrees (e.g. if the sprite already points east). Default: 0. */
  rotationOffset?: number;
  /** Default colour. Default: '#3b82f6'. */
  defaultColor?: string;
  /**
   * Speed-band colouring. The first band whose `max` covers the speed wins.
   * Bands must be supplied in ascending order. Empty list falls back to
   * `defaultColor`.
   */
  speedColorBands?: SpeedColorBand[];
}
