import 'ol/ol.css';
import 'leaflet/dist/leaflet.css';
import './style.css';

import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import * as L from 'leaflet';

import { Tracker } from '@kinesisjs/core';
import type { TrackAdapter, TrackerOptions } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle as olVehicleStyle } from '@kinesisjs/openlayers';
import { LeafletAdapter, createVehicleStyle as lfVehicleStyle } from '@kinesisjs/leaflet';

import { FleetSimulator } from './simulator';

const CENTER: [number, number] = [29.0, 41.0]; // Istanbul (lng, lat)
const SPEED_BANDS = [
  { max: 30, color: '#22c55e' },
  { max: 60, color: '#eab308' },
  { max: 90, color: '#f59e0b' },
  { max: 1000, color: '#ef4444' },
];

type AdapterKind = 'openlayers' | 'leaflet';

interface Config {
  adapter: AdapterKind;
  interpolation: NonNullable<TrackerOptions['interpolation']>;
  count: number;
  periodMs: number;
  worker: boolean;
  trail: boolean;
  speed: boolean;
  gapViz: boolean;
}

interface Scene {
  tracker: Tracker;
  sim: FleetSimulator;
  dispose: () => void;
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

function readConfig(): Config {
  const adapter =
    document.querySelector<HTMLInputElement>('input[name="adapter"]:checked')?.value === 'leaflet'
      ? 'leaflet'
      : 'openlayers';
  return {
    adapter,
    interpolation: byId<HTMLSelectElement>('interpolation').value as Config['interpolation'],
    count: Number(byId<HTMLInputElement>('count').value),
    periodMs: Number(byId<HTMLInputElement>('period').value),
    worker: byId<HTMLInputElement>('worker').checked,
    trail: byId<HTMLInputElement>('trail').checked,
    speed: byId<HTMLInputElement>('speed').checked,
    gapViz: byId<HTMLInputElement>('gapviz').checked,
  };
}

function buildOpenLayers(
  el: HTMLElement,
  cfg: Config,
): { adapter: TrackAdapter; dispose: () => void } {
  const map = new OLMap({
    target: el,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({ center: fromLonLat(CENTER), zoom: 12 }),
  });
  const adapter = new OpenLayersAdapter(map, {
    style: olVehicleStyle(cfg.speed ? { speedColorBands: SPEED_BANDS } : {}),
    ...(cfg.trail ? { trail: { enabled: true } } : {}),
    ...(cfg.gapViz ? { warningOpacity: 0.35 } : {}),
  });
  return {
    adapter,
    dispose: () => {
      map.setTarget(undefined);
      map.dispose();
    },
  };
}

function buildLeaflet(
  el: HTMLElement,
  cfg: Config,
): { adapter: TrackAdapter; dispose: () => void } {
  const map = L.map(el).setView([CENTER[1], CENTER[0]], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  const adapter = new LeafletAdapter(map, {
    style: lfVehicleStyle(cfg.speed ? { speedColorBands: SPEED_BANDS } : {}),
    ...(cfg.trail ? { trail: { enabled: true } } : {}),
    ...(cfg.gapViz ? { warningOpacity: 0.35 } : {}),
  });
  return { adapter, dispose: () => map.remove() };
}

let scene: Scene | null = null;
let feedTimer: number | undefined;
let statsTimer: number | undefined;
let paused = false;

function teardown(): void {
  if (feedTimer !== undefined) clearInterval(feedTimer);
  if (statsTimer !== undefined) clearInterval(statsTimer);
  feedTimer = undefined;
  statsTimer = undefined;
  if (scene) {
    scene.tracker.destroy();
    scene.dispose();
    scene = null;
  }
  byId('map').innerHTML = '';
}

function build(): void {
  teardown();
  const cfg = readConfig();
  const mapEl = byId('map');

  const built = cfg.adapter === 'leaflet' ? buildLeaflet(mapEl, cfg) : buildOpenLayers(mapEl, cfg);

  const tracker = new Tracker({
    adapter: built.adapter,
    interpolation: cfg.interpolation,
    // Match the render-lag buffer to the feed period so interpolation spans
    // exactly one update interval (see TrackerOptions.renderLagMs).
    renderLagMs: cfg.periodMs,
    // Short thresholds so the gap scenario is observable in seconds.
    warningThreshold: 4000,
    staleThreshold: 12000,
    staleCheckInterval: 1000,
    ...(cfg.worker ? { worker: true } : {}),
  });

  const sim = new FleetSimulator(CENTER);
  sim.reset(cfg.count);
  tracker.start();
  tracker.ingest(sim.step(0)); // initial placement

  feedTimer = window.setInterval(() => {
    if (!paused) tracker.ingest(sim.step(cfg.periodMs));
  }, cfg.periodMs);

  statsTimer = window.setInterval(() => renderStats(tracker), 500);

  scene = { tracker, sim, dispose: built.dispose };
}

function renderStats(tracker: Tracker): void {
  const s = tracker.getStats();
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
  byId('stats').textContent = [
    `vehicles : ${s.vehicleCount}`,
    `fps      : ${s.fps.toFixed(0)}`,
    `tick last: ${s.lastTickDurationMs.toFixed(2)} ms`,
    `p50/95/99: ${s.performanceMetrics.tickHistoryP50.toFixed(2)} / ${s.performanceMetrics.tickHistoryP95.toFixed(2)} / ${s.performanceMetrics.tickHistoryP99.toFixed(2)} ms`,
    `dropped  : ${s.performanceMetrics.droppedTicksLast60s} (60s)`,
    `ingest/s : ${s.performanceMetrics.ingestRate.toFixed(1)}`,
    `memory   : ${kb(s.memoryEstimateBytes)}`,
  ].join('\n');
}

// ─── Wiring ──────────────────────────────────────────────────────────────

function wireControls(): void {
  const rebuildOn = ['interpolation', 'count', 'period', 'worker', 'trail', 'speed', 'gapviz'];
  for (const id of rebuildOn) byId(id).addEventListener('change', build);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="adapter"]')) {
    radio.addEventListener('change', build);
  }

  byId('count').addEventListener('input', () => {
    byId('countOut').textContent = byId<HTMLInputElement>('count').value;
  });
  byId('period').addEventListener('input', () => {
    byId('periodOut').textContent = byId<HTMLInputElement>('period').value;
  });

  byId('btnGap').addEventListener('click', () => {
    const id = scene?.sim.ids()[0];
    if (id) scene?.sim.suspend(id); // stops feeding → warning → stale
  });
  byId('btnJump').addEventListener('click', () => {
    const id = scene?.sim.ids()[1];
    if (!id || !scene) return;
    const jumped = scene.sim.teleport(id, 0.25, 0.25);
    if (jumped) scene.tracker.ingest([jumped]);
  });
  byId('btnComplete').addEventListener('click', () => {
    const id = scene?.sim.ids()[2];
    if (!id || !scene) return;
    scene.tracker.markCompleted(id);
    scene.sim.suspend(id);
  });
  byId('btnToggleRun').addEventListener('click', () => {
    paused = !paused;
    byId('btnToggleRun').textContent = paused ? 'Resume feed' : 'Pause feed';
  });
}

wireControls();
build();
