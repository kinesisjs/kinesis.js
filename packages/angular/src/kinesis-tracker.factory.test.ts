// @vitest-environment jsdom
import 'zone.js';
import 'zone.js/testing';

import { Component, Injector, inject, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import { Tracker } from '@kinesisjs/core';
import { kinesisTracker } from './kinesis-tracker.factory';
import type OLMap from 'ol/Map';
import type { Position } from '@kinesisjs/core';

class FakeMap {
  layers: VectorLayer<VectorSource>[] = [];
  addLayer(layer: VectorLayer<VectorSource>): void {
    this.layers.push(layer);
  }
  removeLayer(layer: VectorLayer<VectorSource>): void {
    this.layers = this.layers.filter((l) => l !== layer);
  }
}

const makeMap = (): OLMap => new FakeMap() as unknown as OLMap;

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
  template: '',
})
class HostComponent {
  private readonly injector = inject(Injector);
  readonly map = makeMap();
  positionsSignal = signal<Position[]>([]);
  positionsObservable = new BehaviorSubject<Position[]>([]);
  tracker: Tracker | null = null;

  createWithSignal(): void {
    runInInjectionContext(this.injector, () => {
      this.tracker = kinesisTracker({
        map: this.map,
        positions: this.positionsSignal,
      });
    });
  }

  createWithObservable(): void {
    runInInjectionContext(this.injector, () => {
      this.tracker = kinesisTracker({
        map: this.map,
        positions: this.positionsObservable,
      });
    });
  }
}

describe('kinesisTracker factory', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('returns a started Tracker bound to a Signal source', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.createWithSignal();

    expect(host.tracker).toBeInstanceOf(Tracker);
    host.positionsSignal.set([{ id: 'v1', lng: 29, lat: 41 }]);
    fixture.detectChanges(); // effects run
    expect(host.tracker?.getStats().vehicleCount).toBe(1);
  });

  it('subscribes to Observable positions and ingests on emit', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.createWithObservable();

    host.positionsObservable.next([
      { id: 'v1', lng: 29, lat: 41 },
      { id: 'v2', lng: 30, lat: 42 },
    ]);
    expect(host.tracker?.getStats().vehicleCount).toBe(2);
  });

  it('passes trackerOptions through to Tracker', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    const map = host.map;

    TestBed.runInInjectionContext(() => {
      host.tracker = kinesisTracker({
        map,
        positions: signal<Position[]>([]),
        trackerOptions: { interpolation: 'adaptive', ingestThrottle: 0 },
      });
    });

    expect(host.tracker).toBeInstanceOf(Tracker);
  });

  it('destroys tracker when host component is destroyed', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.createWithSignal();
    const tracker = host.tracker!;

    const destroyHandler = vi.fn();
    tracker.on('destroy', destroyHandler);

    fixture.destroy();
    expect(destroyHandler).toHaveBeenCalledTimes(1);
  });
});
