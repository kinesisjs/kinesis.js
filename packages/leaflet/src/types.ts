import type { DivIcon, Icon, LayerGroup } from 'leaflet';
import type { TrailPoint } from '@kinesisjs/core';

/**
 * Either a pre-built Leaflet icon or a `(vehicle, id) => icon` factory.
 * When a function is provided it is re-evaluated on every `updatePosition`
 * (dynamic icon — useful for speed-banded colouring, heading rotation,
 * state-driven markers). A static icon is applied once at `addVehicle` and is
 * not re-evaluated (so it does not rotate — mirror of a static OpenLayers
 * `Style`).
 *
 * The {@link createVehicleStyle} helper produces a heading-aware factory.
 */
export type VehicleStyleProvider =
  | Icon
  | DivIcon
  | ((vehicle: TrailPoint, vehicleId: string) => Icon | DivIcon);

export interface LeafletAdapterOptions {
  /** Static icon or per-vehicle icon factory. Defaults to a built-in rotatable marker. */
  style?: VehicleStyleProvider;

  /**
   * Add markers to an existing `LayerGroup` / `FeatureGroup` rather than
   * creating (and adding to the map) a new one. When paired with
   * `managedFeatureIds`, other layers in that group are left untouched.
   *
   * Requires `map` to be omitted-friendly: the existing group is assumed to be
   * already added to a map.
   */
  existingLayer?: LayerGroup;

  /**
   * Manage only vehicles whose ids appear in this set. Critical for the
   * `existingLayer` mode — anything not listed here is never touched, and
   * `destroy()` only removes the listed markers. Updatable at runtime via
   * `setManagedIds(...)`. If omitted, the adapter owns every marker it creates.
   */
  managedFeatureIds?: Set<string> | string[];

  /**
   * Per-vehicle trail rendering (a fading polyline behind each marker).
   * Defaults off; pass `{ enabled: true }` to opt in. Polylines live in
   * Leaflet's `overlayPane`, which sits below the `markerPane`, so trails
   * render under their vehicles without extra z-index work.
   */
  trail?: TrailRenderOptions;

  /**
   * Opacity (0–1) applied when a vehicle enters the `warning` state. Restored
   * to 1 on recovery to `active`. If omitted, opacity is never touched on
   * state transitions (gap visualisation stays opt-out). Typical value: 0.5–0.7.
   */
  warningOpacity?: number;
}

/**
 * Trail rendering options. The adapter keeps a per-vehicle bounded ring buffer
 * of recent positions and draws each as an `L.Polyline`.
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
   * tick runs at ~60 Hz; without throttling the buffer fills in under a second.
   * Default: 100 (≈10 Hz). `0` samples on every tick.
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
  /**
   * Optional pane z-index for the trail. By default trails use the standard
   * `overlayPane` (below markers); set this only to place trails at a specific
   * z relative to other custom panes.
   */
  zIndex?: number;
}

export interface SpeedColorBand {
  /** Speeds at or below this value (km/h) get the band's colour. */
  max: number;
  /** CSS colour (hex, rgb, named). */
  color: string;
}

export interface VehicleStyleOptions {
  /** Icon image URL. If supplied, a rotatable image marker is produced; otherwise an SVG dot. */
  icon?: string;
  /** Marker size in pixels (square). Default: 24. */
  iconSize?: number;
  /** Heading rotation offset in degrees (e.g. if the icon already points east). Default: 0. */
  rotationOffset?: number;
  /** Default dot colour. Default: '#3b82f6'. */
  defaultColor?: string;
  /**
   * Speed-band colouring. The first band whose `max` covers the speed wins.
   * Bands must be supplied in ascending order. Empty list falls back to
   * `defaultColor`.
   */
  speedColorBands?: SpeedColorBand[];
  /** SVG dot radius in pixels (ignored when `icon` is set). Default: 6. */
  circleRadius?: number;
}
