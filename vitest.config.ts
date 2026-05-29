import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages resolve to their src/ during test — independent of dist.
// pnpm workspace symlinks expose package.json entries that point at dist/index.js,
// which doesn't exist on a fresh CI checkout before `pnpm build` runs.
const pkgSrc = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@kinesisjs/core': pkgSrc('./packages/core/src/index.ts'),
      '@kinesisjs/openlayers': pkgSrc('./packages/openlayers/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/src/**/*.{test,spec}.ts', 'packages/*/test/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.bench.ts',
        '**/index.ts',
        '**/types.ts',
        // Type-only module (postMessage protocol) — no executable statements.
        '**/worker-protocol.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
