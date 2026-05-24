#!/usr/bin/env node
// Fetch a single OSRM driving route and emit it as a TypeScript RawRoute
// literal (the shape used by demos like istanbul-fleet.ts). Output goes to
// stdout — pipe it into a file, or copy-paste into a fleet definition.
//
// Usage:
//   node scripts/fetch-osrm-route.mjs \
//     --id r1 \
//     --label "Galata Tower → Hagia Sophia" \
//     --from 28.973926,41.025803 \
//     --to 28.978493,41.009688
//
// Optional:
//   --waypoints "28.97,41.02;28.975,41.018"   semicolon-separated
//   --profile driving|walking|cycling          default: driving
//   --server https://router.project-osrm.org   default: public OSRM demo server
//
// The public OSRM demo server is rate-limited and not for production use.
// Self-host (https://github.com/Project-OSRM/osrm-backend) if you need
// reliability or bulk fetching.

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    label: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    waypoints: { type: 'string' },
    profile: { type: 'string', default: 'driving' },
    server: { type: 'string', default: 'https://router.project-osrm.org' },
  },
});

if (!values.id || !values.label || !values.from || !values.to) {
  console.error('Missing required args. Run with --id, --label, --from, --to.');
  console.error('See script header for full usage.');
  process.exit(1);
}

const parseCoord = (raw, name) => {
  const [lng, lat] = raw.split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    console.error(`Invalid coordinate for --${name}: "${raw}" (expected "lng,lat")`);
    process.exit(1);
  }
  return [lng, lat];
};

const coords = [parseCoord(values.from, 'from')];
if (values.waypoints) {
  for (const w of values.waypoints.split(';')) {
    coords.push(parseCoord(w, 'waypoints'));
  }
}
coords.push(parseCoord(values.to, 'to'));

const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
const url = `${values.server}/route/v1/${values.profile}/${path}?overview=full&geometries=geojson`;

const response = await fetch(url);
if (!response.ok) {
  console.error(`OSRM request failed: ${response.status} ${response.statusText}`);
  console.error(`URL: ${url}`);
  process.exit(1);
}

const data = await response.json();
const route = data?.routes?.[0];
if (!route) {
  console.error('OSRM response had no routes. Full response:');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const polyline = route.geometry.coordinates;
const distanceM = Number(route.distance.toFixed(1));
const durationS = Number(route.duration.toFixed(1));

// Format polyline as a TS literal with 4 tuples per line (matches the
// hand-formatted style of demo/data/istanbul-fleet.ts so diffs stay clean).
const tuples = polyline.map(([lng, lat]) => `[${lng}, ${lat}]`);
const lines = [];
for (let i = 0; i < tuples.length; i += 4) {
  lines.push('      ' + tuples.slice(i, i + 4).join(', ') + ',');
}

const labelEscaped = values.label.replace(/'/g, "\\'");
process.stdout.write(`  {
    id: '${values.id}',
    label: '${labelEscaped}',
    distanceM: ${distanceM},
    durationS: ${durationS},
    polyline: [
${lines.join('\n')}
    ],
  },
`);
