/**
 * Makes src/lib/sabahAreas.json: the area names (kawasan) the Family screen
 * shows, like Likas or Inanam, from OpenStreetMap (© OpenStreetMap contributors, ODbL).
 *
 *   node scripts/sabah-areas.mjs            downloads fresh data from Overpass
 *   node scripts/sabah-areas.mjs file.json  uses an Overpass download you already have
 *
 * Towns, suburbs and villages are kept; neighbourhoods and housing estates
 * ("Taman ...") are left out because they'd show family where someone is far
 * too precisely.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SABAH = '4.0,115.3,7.4,119.3';
const PLACES = ['city', 'town', 'suburb', 'quarter', 'village'];
const QUERY = `[out:json][timeout:80];node["place"~"^(${PLACES.join('|')})$"](${SABAH});out;`;
/** Shopping centres and housing projects that OSM tags as places. */
const SKIP = new Set(['Api-Api Centre', 'Park Residence', 'Kampung Air', 'Kampung Setinggan Sembulan']);
/** The names people in KK actually say. */
const RENAME = {
  'Kampung Penampang Proper': 'Penampang',
  'Kampung Sembulan Lama': 'Sembulan',
  'Taman Kingfisher': 'Kingfisher',
};
/** Companies, mills and logging blocks that OSM tags as places. */
const NOT_AN_AREA = /sdn\.? bhd|syarikat|coupe|kompartment|kilang|quarry|factory|mill\b|ditinggalkan|\d{5}/i;

/** "KAMPUNG MANGGIS" → "Kampung Manggis"; names already in mixed case stay as they are. */
const tidy = (name) =>
  name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s(-])\p{L}/gu, (m) => m.toUpperCase()) : name;

const data = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], 'utf8'))
  : await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'user-agent': 'OTW family app area list' },
      body: new URLSearchParams({ data: QUERY }),
    }).then((r) => r.json());

const areas = data.elements
  .filter((e) => {
    const name = e.tags?.name;
    return name && PLACES.includes(e.tags.place) && !SKIP.has(name) && !NOT_AN_AREA.test(name);
  })
  .map((e) => [RENAME[e.tags.name] ?? tidy(e.tags.name), Math.round(e.lat * 1e4) / 1e4, Math.round(e.lon * 1e4) / 1e4])
  .sort((a, b) => a[0].localeCompare(b[0]));

writeFileSync(new URL('../src/lib/sabahAreas.json', import.meta.url), JSON.stringify(areas) + '\n');
console.log(`Saved ${areas.length} areas`);
