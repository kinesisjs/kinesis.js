# First map — Angular

A working live-tracking map inside an Angular 17+ project, in five minutes.

## 1. Install

```bash
pnpm add @kinesisjs/core @kinesisjs/openlayers @kinesisjs/angular ol
```

## 2. Component

```ts
import { Component, inject } from '@angular/core';
import { KinesisMapDirective } from '@kinesisjs/angular';
import { PositionsService } from './positions.service';

@Component({
  selector: 'app-live-map',
  standalone: true,
  imports: [KinesisMapDirective],
  template: `
    <div
      kinesisMap
      [positions]="positions"
      [center]="[29.0, 41.0]"
      [zoom]="11"
      [interpolation]="'adaptive'"
      class="map-container"
    ></div>
  `,
  styles: [
    `
      .map-container {
        width: 100%;
        height: 600px;
      }
    `,
  ],
})
export class LiveMapComponent {
  positions = inject(PositionsService).positions; // Signal<Position[]>
}
```

## 3. Positions service (example)

```ts
import { Injectable, signal } from '@angular/core';
import { webSocket } from 'rxjs/webSocket';
import type { Position } from '@kinesisjs/core';

@Injectable({ providedIn: 'root' })
export class PositionsService {
  readonly positions = signal<Position[]>([]);

  constructor() {
    const ws = webSocket<Position[]>('wss://your-backend/vehicles');
    ws.subscribe((batch) => this.positions.set(batch));
  }
}
```

## 4. Run it

If the backend pushes `Position[]` arrays, vehicles will glide on the map smoothly. Even when the WebSocket emits once every 5 seconds, the visual update runs at 60fps.

## Custom styles

Speed-banded markers:

```ts
import { createVehicleStyle } from '@kinesisjs/openlayers';

const style = createVehicleStyle({
  speedColorBands: [
    { max: 30, color: '#22c55e' }, // slow → green
    { max: 80, color: '#eab308' }, // medium → yellow
    { max: 130, color: '#ef4444' }, // fast → red
  ],
});
```

Pass it to the directive:

```html
<div kinesisMap [positions]="positions" [vehicleStyle]="style"></div>
```

## Accessing the tracker

Use a template reference variable or `@ViewChild` to reach the directive instance and the underlying tracker:

```html
<div #map="kinesisMap" kinesisMap [positions]="positions"></div>
```

```ts
@ViewChild('map') directive!: KinesisMapDirective;

ngAfterViewInit() {
  const tracker = this.directive.getTracker()!;

  tracker.on('vehiclewarning', ({ vehicleId }) => {
    console.warn(`${vehicleId} has been silent for more than 60 seconds`);
  });

  tracker.on('vehiclestale', ({ vehicleId }) => {
    console.log(`${vehicleId} marked stale and removed from the map`);
  });
}
```

## Programmatic factory

For use outside a template — typically in a service or route resolver — call `kinesisTracker(...)`:

```ts
import { Injectable, inject } from '@angular/core';
import { kinesisTracker } from '@kinesisjs/angular';
import { MapService } from './map.service';
import { PositionsService } from './positions.service';

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly map = inject(MapService).map; // your OpenLayers Map
  private readonly positions = inject(PositionsService).positions;

  readonly tracker = kinesisTracker({
    map: this.map,
    positions: this.positions,
    trackerOptions: { interpolation: 'adaptive' },
  });
}
```

## Next steps

- [Architecture](/concepts/architecture)
- [Limitations](/concepts/limitations)
