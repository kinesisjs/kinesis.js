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
      // Internal-only: cross-adapter parity harness. Resolved at test time;
      // never bundled or published. See packages/core/src/test-utils/.
      '@kinesisjs/test-utils': pkgSrc('./packages/core/src/test-utils/index.ts'),
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
        // Internal test harness — exercised through the adapter parity
        // tests; counting it in coverage would skew the runtime-code metric.
        '**/test-utils/**',
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
