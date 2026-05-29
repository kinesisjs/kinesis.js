import { defineConfig } from 'vite';

export default defineConfig({
  // Dedupe so OpenLayers / Leaflet resolve to a single instance shared with the
  // adapter packages (avoids "instanceof" mismatches across copies).
  resolve: {
    dedupe: ['ol', 'leaflet', '@kinesisjs/core'],
  },
});
