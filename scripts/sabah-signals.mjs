/**
 * Makes public/map/sabah-signals.json: where the traffic lights are in Sabah,
 * for the little traffic-light icons on the map, from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL).
 *
 *   node scripts/sabah-signals.mjs            downloads fresh data from Overpass
 *   node scripts/sabah-signals.mjs file.json  uses an Overpass download you already have
 *
 * OpenStreetMap often has one point per direction at a junction, so points
 * closer than MERGE_M are joined into one light per junction. These are mapped
 * locations only: there's no live red/green.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const QUERY = '[out:json][timeout:90];area["ISO3166-2"="MY-12"]->.sabah;node[highway=traffic_signals](area.sabah);out;';
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const MERGE_M = 50;

async function download() {
  for (const server of SERVERS) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: { 'user-agent': 'OTW family app traffic lights' },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) return await res.json();
      console.warn(`${server}: ${res.status}`);
    } catch (e) {
      console.warn(`${server}: ${e.message}`);
    }
  }
  throw new Error('Every Overpass server is busy; try again later');
}

const data = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : await download();

const metres = (a, b) =>
  Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360), b[1] - a[1]) * 111_320;

/** Joined points: the middle of each group of nearby points. */
const groups = [];
for (const e of data.elements) {
  if (e.type !== 'node') continue;
  const p = [e.lon, e.lat];
  const near = groups.find((g) => metres(g.centre, p) < MERGE_M);
  if (near) {
    near.points.push(p);
    near.centre = [0, 1].map((k) => near.points.reduce((s, q) => s + q[k], 0) / near.points.length);
  } else {
    groups.push({ centre: p, points: [p] });
  }
}

const points = groups
  .map((g) => g.centre.map((v) => Math.round(v * 1e5) / 1e5))
  .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const out = {
  source: '© OpenStreetMap contributors',
  license: 'ODbL-1.0',
  dataThrough: data.osm3s?.timestamp_osm_base ?? null,
  points,
};
mkdirSync(new URL('../public/map/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/map/sabah-signals.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`Saved ${points.length} traffic lights (from ${data.elements.length} points)`);
