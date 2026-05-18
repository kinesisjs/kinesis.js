# First map — vanilla TypeScript

No framework required — just OpenLayers and the Kinesis.js core.

## 1. Install

```bash
pnpm add @kinesisjs/core @kinesisjs/openlayers ol
```

## 2. HTML

```html
<div id="map" style="width: 100%; height: 600px"></div>
```

## 3. Setup

```ts
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';

import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle } from '@kinesisjs/openlayers';
import type { Position } from '@kinesisjs/core';

// 1. Set up the OpenLayers map.
const map = new Map({
  target: 'map',
  layers: [new TileLayer({ source: new OSM() })],
  view: new View({ center: fromLonLat([29, 41]), zoom: 11 }),
});

// 2. Adapter and style.
const adapter = new OpenLayersAdapter(map, {
  style: createVehicleStyle({ icon: '/car.png' }),
});

// 3. Tracker.
const tracker = new Tracker({
  adapter,
  interpolation: 'adaptive',
  ingestThrottle: 100,
  warningThreshold: 60_000,
  staleThreshold: 600_000,
});

tracker.start();

// 4. Feed positions from your data source.
const ws = new WebSocket('wss://your-backend/vehicles');
ws.onmessage = (event) => {
  const positions: Position[] = JSON.parse(event.data);
  tracker.ingest(positions);
};

// 5. Subscribe to lifecycle events (optional).
tracker.on('vehiclewarning', ({ vehicleId }) => {
  console.warn(`${vehicleId} has been silent for more than 60 seconds`);
});

tracker.on('error', (err) => {
  console.warn(`[kinesis ${err.code}]`, err.message);
});

// 6. Clean up on SPA navigation or page unload.
window.addEventListener('beforeunload', () => {
  tracker.destroy();
  map.dispose();
});
```

## Speed-banded colours

```ts
const style = createVehicleStyle({
  speedColorBands: [
    { max: 30, color: '#22c55e' },
    { max: 80, color: '#eab308' },
    { max: 130, color: '#ef4444' },
  ],
});
```

## Co-existing with non-vehicle features in a shared layer

If your map already has a `VectorLayer` with geofences or custom markers, add vehicle features to it without touching the others:

```ts
const adapter = new OpenLayersAdapter(map, {
  existingLayer: yourExistingVectorLayer,
  managedFeatureIds: new Set(vehicleIds), // only these are managed
});

// Update the managed set at runtime:
adapter.setManagedIds(newVehicleIds);
```

The adapter only adds, updates, removes, or destroys features whose IDs are in the managed set. Everything else in the layer is left alone.

## Next steps

- [Architecture](/concepts/architecture)
- [Limitations](/concepts/limitations)
