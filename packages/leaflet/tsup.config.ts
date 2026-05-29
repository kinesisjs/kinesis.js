import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  treeshake: true,
  minify: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  external: ['leaflet', '@kinesisjs/core'],
});
