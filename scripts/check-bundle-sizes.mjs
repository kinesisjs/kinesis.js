#!/usr/bin/env node
/**
 * Hard bundle-size guard for published @kinesisjs/* artifacts.
 * Measures gzip(file) and fails CI if any package exceeds its budget.
 *
 * Tighten budgets as the library matures. Loosen only with a real reason.
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGETS = [
  {
    // Bumped from 7 → 9 KB in v0.3.0: worker mode inlines the bundled
    // worker-script as a string (so `worker: true` needs zero consumer setup),
    // which adds ~2.4 KB gzip. Consumers who don't use worker mode still carry
    // it today; a future tree-shakeable split could reclaim it.
    name: '@kinesisjs/core (ESM)',
    path: 'packages/core/dist/index.js',
    limitKB: 9,
  },
  {
    name: '@kinesisjs/openlayers (ESM)',
    path: 'packages/openlayers/dist/index.js',
    limitKB: 2.5,
  },
  {
    name: '@kinesisjs/leaflet (ESM)',
    path: 'packages/leaflet/dist/index.js',
    limitKB: 2.5,
  },
  {
    name: '@kinesisjs/route-aware (ESM)',
    path: 'packages/route-aware/dist/index.js',
    limitKB: 2.5,
  },
  {
    name: '@kinesisjs/angular (FESM2022)',
    path: 'packages/angular/dist/fesm2022/kinesisjs-angular.mjs',
    limitKB: 4,
  },
];

const fmt = (n) => `${(n / 1024).toFixed(2)} KB`;

let failed = false;
for (const b of BUDGETS) {
  try {
    statSync(b.path);
  } catch {
    console.error(
      `✗ ${b.name}: missing dist file at ${b.path} — did you run \`pnpm build\` first?`,
    );
    failed = true;
    continue;
  }

  const raw = readFileSync(b.path);
  const gz = gzipSync(raw);
  const overBudget = gz.length / 1024 > b.limitKB;
  const marker = overBudget ? '✗' : '✓';

  console.log(
    `${marker} ${b.name.padEnd(34)} raw ${fmt(raw.length).padStart(8)}  gz ${fmt(gz.length).padStart(8)}  ` +
      `(limit ${b.limitKB} KB gz, ` +
      `${overBudget ? `OVER by ${(gz.length / 1024 - b.limitKB).toFixed(2)} KB` : `${((1 - gz.length / 1024 / b.limitKB) * 100).toFixed(0)}% headroom`})`,
  );

  if (overBudget) failed = true;
}

if (failed) {
  console.error('\nOne or more packages exceeded their gzip-budget. Investigate before merging.');
  process.exit(1);
}
console.log('\nAll bundles within budget.');
