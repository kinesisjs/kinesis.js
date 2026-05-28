import { build } from 'esbuild';
import { defineConfig } from 'tsup';

/**
 * Two-pass build:
 *   1. Bundle src/worker-script.ts into a standalone minified IIFE, in memory.
 *   2. Build the main entry, inlining that IIFE as the __KINESIS_WORKER_SOURCE__
 *      string so `new Tracker({ worker: true })` can spawn the worker from a
 *      Blob with zero consumer setup. Consumers who'd rather not pay the inline
 *      cost use `worker: { url }` instead.
 */
export default defineConfig(async () => {
  const worker = await build({
    entryPoints: ['src/worker-script.ts'],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    platform: 'browser',
    write: false,
  });
  const workerSource = worker.outputFiles[0]?.text ?? '';

  return {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    treeshake: true,
    minify: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    define: {
      __KINESIS_WORKER_SOURCE__: JSON.stringify(workerSource),
    },
  };
});
