import { layerGroup, marker, polyline } from 'leaflet';
import type {
  DivIcon,
  Icon,
  LayerGroup,
  Map as LeafletMap,
  Marker,
  Polyline,
  LatLngTuple,
} from 'leaflet';
import type { TrackAdapter, TrailPoint, VehicleState } from '@kinesisjs/core';
import { createVehicleStyle } from './style-builder';
import type { LeafletAdapterOptions, TrailRenderOptions, VehicleStyleProvider } from './types';

interface ResolvedTrailOptions {
  maxPoints: number;
  intervalMs: number;
  width: number;
  opacity: number;
  color?: string;
  defaultColor: string;
  zIndex?: number;
}

interface TrailEntry {
  line: Polyline;
  coords: LatLngTuple[];
  lastSampledAt: number;
}

const TRAIL_PANE = 'kinesis-trail';

/**
 * Leaflet implementation of the Kinesis.js Core `TrackAdapter` interface.
 *
 * Responsibilities:
 *   - Per-vehicle `L.Marker` lifecycle (create / update / remove).
 *   - Static, dynamic (factory), or built-in heading-aware icons.
 *   - Optional opacity updates (fade behavior) and `warning`-state dimming.
 *   - Optional trail rendering (`L.Polyline` per vehicle on a separate group).
 *   - Respect for `managedFeatureIds` — leaves unrelated layers in a shared
 *     `existingLayer` untouched.
 *
 * Coordinate note: Leaflet is **`[lat, lng]`** (the opposite of OpenLayers and
 * GeoJSON). Core hands over `TrailPoint{ lng, lat }`; the single `project()`
 * helper performs the swap.
 *
 * Not its responsibility: interpolation, data source, user interaction.
 */
export class LeafletAdapter implements TrackAdapter {
  private readonly features = new Map<string, Marker>();
  private readonly layer: LayerGroup;
  private readonly ownedLayer: boolean;
  private managedIds: Set<string> | null = null;

  // Icon resolution: a static icon (set once), a factory (re-run per update),
  // or the built-in heading-aware default (cheap rotation-only updates).
  private readonly staticIcon: Icon | DivIcon | null;
  private readonly styleFn: ((vehicle: TrailPoint, vehicleId: string) => Icon | DivIcon) | null;
  private readonly usingDefault: boolean;
  private readonly defaultFactory = createVehicleStyle();

  private readonly trail: {
    opts: ResolvedTrailOptions;
    group: LayerGroup;
    entries: Map<string, TrailEntry>;
  } | null;

  constructor(
    private readonly map: LeafletMap,
    private readonly options: LeafletAdapterOptions = {},
  ) {
    const style: VehicleStyleProvider | undefined = options.style;
    if (typeof style === 'function') {
      this.styleFn = style;
      this.staticIcon = null;
      this.usingDefault = false;
    } else if (style) {
      this.staticIcon = style;
      this.styleFn = null;
      this.usingDefault = false;
    } else {
      this.staticIcon = null;
      this.styleFn = null;
      this.usingDefault = true;
    }

    if (options.managedFeatureIds) {
      this.managedIds = new Set(options.managedFeatureIds);
    }

    if (options.existingLayer) {
      this.layer = options.existingLayer;
      this.ownedLayer = false;
    } else {
      this.layer = layerGroup().addTo(map);
      this.ownedLayer = true;
    }

    if (options.trail?.enabled) {
      const opts = resolveTrailOptions(options.trail);
      if (opts.zIndex !== undefined) {
        const pane = map.getPane(TRAIL_PANE) ?? map.createPane(TRAIL_PANE);
        pane.style.zIndex = String(opts.zIndex);
      }
      this.trail = { opts, group: layerGroup().addTo(map), entries: new Map() };
    } else {
      this.trail = null;
    }
  }

  // ─── TrackAdapter contract ────────────────────────────────────────────

  addVehicle(id: string, initialPoint: TrailPoint): void {
    if (this.managedIds && !this.managedIds.has(id)) return;

    const m = marker(this.project(initialPoint), {
      icon: this.resolveIcon(initialPoint, id),
      opacity: 1,
    });
    this.features.set(id, m);
    this.layer.addLayer(m);

    if (this.trail) this.initTrail(id, initialPoint);
  }

  updatePosition(id: string, point: TrailPoint): void {
    const m = this.features.get(id);
    if (!m) return;

    m.setLatLng(this.project(point));

    if (this.styleFn) {
      // Dynamic provider — re-evaluate the full icon (colour + rotation).
      m.setIcon(this.styleFn(point, id));
    } else if (this.usingDefault) {
      // Built-in marker: rotate the rendered SVG cheaply; fall back to a full
      // icon rebuild only when the element isn't in the DOM yet.
      const rotation = point.heading ?? 0;
      if (!applyRotation(m, rotation)) {
        m.setIcon(this.defaultFactory(point));
      }
    }
    // staticIcon: set once at add — no per-update restyle (matches a static
    // OpenLayers Style; it does not rotate).

    if (this.trail) this.appendToTrail(id, point);
  }

  removeVehicle(id: string): void {
    const m = this.features.get(id);
    if (m) {
      this.layer.removeLayer(m);
      this.features.delete(id);
    }
    if (this.trail) {
      const entry = this.trail.entries.get(id);
      if (entry) {
        this.trail.group.removeLayer(entry.line);
        this.trail.entries.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.managedIds) {
      for (const id of this.managedIds) {
        const m = this.features.get(id);
        if (m) this.layer.removeLayer(m);
      }
    } else {
      for (const m of this.features.values()) this.layer.removeLayer(m);
    }
    this.features.clear();
    if (this.ownedLayer) this.map.removeLayer(this.layer);

    if (this.trail) {
      for (const entry of this.trail.entries.values()) {
        this.trail.group.removeLayer(entry.line);
      }
      this.trail.entries.clear();
      this.map.removeLayer(this.trail.group);
    }
  }

  /** Optional TrackAdapter method — used by the Tracker's fade behavior. */
  updateOpacity(id: string, opacity: number): void {
    this.features.get(id)?.setOpacity(opacity);
  }

  /**
   * Optional TrackAdapter method — invoked when a vehicle's lifecycle state
   * changes. When `warningOpacity` is configured, the marker dims on entering
   * `warning` and restores to 1 on recovery to `active`. `stale` / `completed`
   * are no-ops (both are immediately followed by `removeVehicle`).
   */
  setVehicleState(id: string, state: VehicleState): void {
    const dim = this.options.warningOpacity;
    if (dim === undefined) return;
    if (state === 'warning') this.updateOpacity(id, dim);
    else if (state === 'active') this.updateOpacity(id, 1);
  }

  /**
   * Optional TrackAdapter method — per-adapter byte estimate surfaced in
   * `Tracker.getStats().memoryBreakdown`. ~256 B per marker, ~64 B + 16 B per
   * trail coordinate.
   */
  getMemoryEstimate(): number {
    let bytes = this.features.size * 256;
    if (this.trail) {
      for (const entry of this.trail.entries.values()) {
        bytes += 64 + entry.coords.length * 16;
      }
    }
    return bytes;
  }

  // ─── Public utilities ─────────────────────────────────────────────────

  /** Look up a marker by id — handy for click handlers and custom interactions. */
  getFeature(vehicleId: string): Marker | undefined {
    return this.features.get(vehicleId);
  }

  /** Shallow copy of every managed marker. */
  getAllFeatures(): Map<string, Marker> {
    return new Map(this.features);
  }

  /** Update the managed-id allow-list at runtime. */
  setManagedIds(ids: Set<string> | string[] | null): void {
    this.managedIds = ids === null ? null : new Set(ids);
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private resolveIcon(point: TrailPoint, id: string): Icon | DivIcon {
    if (this.staticIcon) return this.staticIcon;
    if (this.styleFn) return this.styleFn(point, id);
    return this.defaultFactory(point);
  }

  private project(point: { lng: number; lat: number }): LatLngTuple {
    return [point.lat, point.lng];
  }

  private initTrail(id: string, point: TrailPoint): void {
    if (!this.trail) return;
    const coord = this.project(point);
    const opts = this.trail.opts;
    const line = polyline([coord], {
      color: trailColor(point, opts),
      weight: opts.width,
      opacity: opts.opacity,
      ...(opts.zIndex !== undefined ? { pane: TRAIL_PANE } : {}),
    });
    this.trail.group.addLayer(line);
    this.trail.entries.set(id, { line, coords: [coord], lastSampledAt: 0 });
  }

  private appendToTrail(id: string, point: TrailPoint): void {
    if (!this.trail) return;
    const opts = this.trail.opts;
    const entry = this.trail.entries.get(id);
    if (!entry) {
      this.initTrail(id, point);
      return;
    }
    if (opts.intervalMs > 0) {
      const now = Date.now();
      if (now - entry.lastSampledAt < opts.intervalMs) return;
      entry.lastSampledAt = now;
    }
    entry.coords.push(this.project(point));
    if (entry.coords.length > opts.maxPoints) {
      entry.coords.splice(0, entry.coords.length - opts.maxPoints);
    }
    entry.line.setLatLngs(entry.coords);
    entry.line.setStyle({ color: trailColor(point, opts) });
  }
}

function resolveTrailOptions(opts: TrailRenderOptions): ResolvedTrailOptions {
  return {
    maxPoints: opts.maxPoints ?? 60,
    intervalMs: opts.intervalMs ?? 100,
    width: opts.width ?? 3,
    opacity: opts.opacity ?? 0.5,
    color: opts.color,
    defaultColor: opts.defaultColor ?? '#3b82f6',
    zIndex: opts.zIndex,
  };
}

function trailColor(point: TrailPoint, opts: ResolvedTrailOptions): string {
  const fromMeta =
    typeof point.meta?.['color'] === 'string' ? (point.meta['color'] as string) : undefined;
  return opts.color ?? fromMeta ?? opts.defaultColor;
}

/**
 * Rotate the marker's rendered inner element (the SVG/img inside the divIcon)
 * without rebuilding the icon. Returns `false` when the marker isn't in the
 * DOM yet (caller then rebuilds the icon so the rotation isn't lost).
 */
function applyRotation(m: Marker, degrees: number): boolean {
  const el = m.getElement();
  const inner = el?.firstElementChild as HTMLElement | null | undefined;
  if (!inner) return false;
  inner.style.transform = `rotate(${degrees}deg)`;
  inner.style.transformOrigin = 'center';
  return true;
}
