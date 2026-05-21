import type Style from 'ol/style/Style';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type { TrailPoint } from '@kinesisjs/core';

/**
 * Either a pre-built `Style` or a `(vehicle, id) => Style` factory.
 * When a function is provided it is re-evaluated on every `updatePosition`
 * (dynamic style — useful for speed-banded coloring, state-driven icons, etc.).
 */
export type VehicleStyleProvider = Style | ((vehicle: TrailPoint, vehicleId: string) => Style);

export interface OpenLayersAdapterOptions {
  /** Layer name (debugging aid). Default: 'kinesis-vehicles'. */
  layerName?: string;

  /** Static `Style` or per-vehicle style factory. */
  style?: VehicleStyleProvider;

  /**
   * Attach to an existing VectorLayer rather than creating a new one.
   * When paired with `managedFeatureIds`, other features on that layer are
   * left untouched.
   */
  existingLayer?: VectorLayer<VectorSource>;

  /** Map projection. Default: 'EPSG:3857'. */
  projection?: string;

  /**
   * Manage only features whose ids appear in this set.
   *
   * Critical for the `existingLayer` mode: if the existing layer also holds
   * geofence polygons, custom markers, or any other features, the adapter
   * will not touch them. `destroy()` only removes the features listed here.
   *
   * If omitted, the adapter assumes ownership of every feature in the layer
   * (the correct behavior when it creates the layer itself).
   *
   * Can be updated at runtime via `setManagedIds(...)`.
   */
  managedFeatureIds?: Set<string> | string[];

  /**
   * Per-vehicle trail rendering (fading polyline behind each marker).
   * Defaults off; pass `{ enabled: true }` to opt in.
   */
  trail?: TrailRenderOptions;

  /**
   * Opacity (0–1) applied when a vehicle transitions to the `warning` state.
   * The sweeper triggers the dim; the next ingest (or a sweeper-detected
   * recovery to `active`) restores opacity to 1.
   *
   * If omitted, the marker's opacity is never touched on state transitions
   * — gap visualization stays opt-out. Typical value: 0.5–0.7.
   */
  warningOpacity?: number;
}

/**
 * Trail rendering options. The `OpenLayersAdapter` keeps a per-vehicle ring
 * buffer of recent positions and draws each as a `Feature<LineString>` on a
 * separate VectorLayer that sits behind the marker layer.
 *
 * Color resolution order: explicit `color` → `TrailPoint.meta.color` (string) →
 * `defaultColor` → `'#3b82f6'`. This is how fleet-level color schemes (one
 * color per vehicle, attached via `Position.meta`) flow automatically into
 * the trails.
 */
export interface TrailRenderOptions {
  /** Enable trail rendering. Required `true` to opt in. */
  enabled: boolean;
  /** Ring buffer capacity per vehicle. Default: 60. */
  maxPoints?: number;
  /**
   * Minimum interval (ms) between successive trail samples per vehicle.
   * The tick runs at ~60 Hz; without throttling, the buffer would fill in
   * under a second. Default: 100 (≈10 Hz). Setting 0 samples on every tick.
   */
  intervalMs?: number;
  /** Line width in pixels. Default: 3. */
  width?: number;
  /** Line alpha channel, 0–1. Default: 0.5. */
  opacity?: number;
  /**
   * Fixed trail color (CSS hex / rgb / named). Overrides `meta.color` when
   * set. The `opacity` field is applied as alpha only for hex inputs
   * (`#rrggbb` or `#rgb`); other forms are passed through unchanged.
   */
  color?: string;
  /** Fallback when neither `color` nor `meta.color` is available. Default: '#3b82f6'. */
  defaultColor?: string;
  /**
   * Trail layer z-index — advanced override for `existingLayer` mode.
   *
   * Default: undefined. With default, the trail layer is added to the map BEFORE
   * the adapter's vehicle layer; OpenLayers' natural order (later-added on top)
   * places trails behind vehicles without explicit zIndex juggling.
   *
   * Set explicitly only when the trail must sit at a specific z relative to other
   * user-managed layers (e.g. behind a custom heatmap, above a base tile in
   * `existingLayer` mode where the trail-vs-vehicle add order alone doesn't reach).
   */
  zIndex?: number;
}

export interface SpeedColorBand {
  /** Speeds at or below this value (km/h) get the band's color. */
  max: number;
  /** CSS color (hex, rgb, named). */
  color: string;
}

export interface VehicleStyleOptions {
  /** Icon URL. If supplied, an Icon style is produced; otherwise a Circle style. */
  icon?: string;
  /** Icon scale. Default: 1. */
  iconScale?: number;
  /** Icon rotation offset in degrees. Default: 0. */
  rotationOffset?: number;
  /** Default Circle / Icon color. Default: '#3b82f6'. */
  defaultColor?: string;
  /**
   * Speed-band coloring. The first band whose `max` covers the speed wins.
   * Bands must be supplied in ascending order. Empty list falls back to
   * `defaultColor`.
   */
  speedColorBands?: SpeedColorBand[];
  /** Circle radius. Default: 6. */
  circleRadius?: number;
}
