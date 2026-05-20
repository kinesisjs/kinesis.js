// @vitest-environment jsdom
import 'zone.js';
import 'zone.js/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the OL classes the directive instantiates directly — they need canvas + ResizeObserver
// inside a real browser, which jsdom doesn't ship. OpenLayersAdapter's internals
// (VectorLayer, VectorSource, Feature, Point) work fine in node and are NOT mocked.
vi.mock('ol/Map', () => ({
  default: class FakeOLMap {
    private readonly _layers: unknown[] = [];
    constructor(opts: { target?: unknown; layers?: unknown[]; view?: unknown }) {
      if (opts.layers) this._layers.push(...opts.layers);
    }
    addLayer(layer: unknown): void {
      this._layers.push(layer);
    }
    removeLayer(layer: unknown): void {
      const idx = this._layers.indexOf(layer);
      if (idx !== -1) this._layers.splice(idx, 1);
    }
    dispose(): void {}
    getLayers(): { getArray(): unknown[] } {
      return { getArray: () => this._layers };
    }
  },
}));

vi.mock('ol/View', () => ({
  default: class FakeView {
    constructor(_opts: unknown) {}
  },
}));

vi.mock('ol/layer/Tile', () => ({
  default: class FakeTileLayer {
    constructor(_opts: unknown) {}
  },
}));

vi.mock('ol/source/OSM', () => ({
  default: class FakeOSM {
    constructor() {}
  },
}));

// Imports below MUST come after vi.mock calls — vitest hoists mocks but explicit ordering is clearer.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { BehaviorSubject } from 'rxjs';
import { Tracker } from '@kinesisjs/core';
import { KinesisMapDirective } from './kinesis-map.directive';
import type { Position } from '@kinesisjs/core';

let envInitialized = false;
beforeAll(() => {
  if (!envInitialized) {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
      teardown: { destroyAfterEach: true },
    });
    envInitialized = true;
  }
});

@Component({
  standalone: true,
  imports: [KinesisMapDirective],
  template: `<div
    kinesisMap
    [positions]="positions"
    #ref="kinesisMap"
    style="width:200px;height:200px"
  ></div>`,
})
class SignalHostComponent {
  positions = signal<Position[]>([]);
}

@Component({
  standalone: true,
  imports: [KinesisMapDirective],
  template: `<div
    kinesisMap
    [positions]="positions"
    [interpolation]="'adaptive'"
    [ingestThrottle]="0"
    style="width:200px;height:200px"
  ></div>`,
})
class ObservableHostComponent {
  positions = new BehaviorSubject<Position[]>([]);
}

@Component({
  standalone: true,
  imports: [KinesisMapDirective],
  template: `<div
    kinesisMap
    [positions]="positions"
    [interpolation]="'adaptive'"
    [renderLagMs]="0"
    [adaptive]="{ minPeriodMs: 200, maxPeriodMs: 5000 }"
    [fadeAnimation]="{ duration: 400, easing: 'linear' }"
    [initialPositionBehavior]="'wait-for-second'"
    [ingestThrottle]="0"
    #ref="kinesisMap"
    style="width:200px;height:200px"
  ></div>`,
})
class FullyConfiguredHostComponent {
  positions = signal<Position[]>([]);
}

describe('KinesisMapDirective', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('creates a directive instance on the host element', () => {
    TestBed.configureTestingModule({ imports: [SignalHostComponent] });
    const fixture = TestBed.createComponent(SignalHostComponent);
    fixture.detectChanges();

    const directive = fixture.debugElement.children[0]!.references['ref'] as
      | KinesisMapDirective
      | undefined;
    expect(directive).toBeDefined();
    expect(directive?.getMap()).toBeDefined();
    expect(directive?.getTracker()).toBeInstanceOf(Tracker);
  });

  it('forwards Signal updates into the Tracker', () => {
    TestBed.configureTestingModule({ imports: [SignalHostComponent] });
    const fixture = TestBed.createComponent(SignalHostComponent);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const directive = fixture.debugElement.children[0]!.references['ref'] as KinesisMapDirective;
    const tracker = directive.getTracker()!;

    host.positions.set([{ id: 'v1', lng: 29, lat: 41 }]);
    fixture.detectChanges();

    expect(tracker.getStats().vehicleCount).toBe(1);
  });

  it('forwards Observable emissions into the Tracker', () => {
    TestBed.configureTestingModule({ imports: [ObservableHostComponent] });
    const fixture = TestBed.createComponent(ObservableHostComponent);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const directive = fixture.debugElement.children[0]!.injector.get(KinesisMapDirective);
    const tracker = directive.getTracker()!;

    host.positions.next([
      { id: 'v1', lng: 29, lat: 41 },
      { id: 'v2', lng: 30, lat: 42 },
    ]);
    expect(tracker.getStats().vehicleCount).toBe(2);
  });

  it('destroys the Tracker when the host component is torn down', () => {
    TestBed.configureTestingModule({ imports: [SignalHostComponent] });
    const fixture = TestBed.createComponent(SignalHostComponent);
    fixture.detectChanges();
    const directive = fixture.debugElement.children[0]!.injector.get(KinesisMapDirective);
    const tracker = directive.getTracker()!;
    const destroyHandler = vi.fn();
    tracker.on('destroy', destroyHandler);

    fixture.destroy();

    expect(destroyHandler).toHaveBeenCalledTimes(1);
    expect(directive.getTracker()).toBeUndefined();
    expect(directive.getMap()).toBeUndefined();
  });

  it('accepts all advanced @Inputs (renderLagMs, adaptive, fadeAnimation, initialPositionBehavior)', () => {
    TestBed.configureTestingModule({ imports: [FullyConfiguredHostComponent] });
    const fixture = TestBed.createComponent(FullyConfiguredHostComponent);
    fixture.detectChanges();

    const directive = fixture.debugElement.children[0]!.references['ref'] as KinesisMapDirective;
    expect(directive.getTracker()).toBeInstanceOf(Tracker);

    // initialPositionBehavior='wait-for-second': first ingest should NOT add the
    // vehicle to the adapter (i.e. it's tracked internally but not visible yet).
    const host = fixture.componentInstance;
    host.positions.set([{ id: 'v1', lng: 29, lat: 41 }]);
    fixture.detectChanges();
    const stats = directive.getTracker()!.getStats();
    expect(stats.vehicleCount).toBe(1);
  });
});
