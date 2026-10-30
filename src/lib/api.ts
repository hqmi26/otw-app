import type { LngLat } from './geo';
import { ask, shortMemory } from './net';
import type { PlaceGroup } from './places';

/*
 * Free public services, no API keys:
 *  - Photon (komoot) for place search outside Sabah (Sabah is searched on the phone, see places.ts)
 *    and for the area names family see, sent only a spot rounded to about 1 km
 *  - Valhalla (FOSSGIS) for driving routes: it offers 2–3 different routes, where
 *    the OSRM demo server finds only one in KK. OSRM stays as the backup.
 * All are fine for family testing (Valhalla allows one request a second). For a
 * public launch, self-host them on a server in Malaysia (see README) so nobody's
 * location leaves the country. net.ts keeps a rush of users from hanging on them.
 */
const PHOTON_URL = 'https://photon.komoot.io/api/';
const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';
const MALAYSIA_BBOX = '99.6,0.85,119.3,7.4';

export interface Place {
  id: string;
  name: string;
  subtitle: string;
  coord: LngLat;
}

interface PhotonFeature {
  geometry: { coordinates: LngLat };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
  };
}

/** Quick category searches for the chips on the search screen. */
export const CATEGORIES: readonly { label: string; query: string; osmTag: string; group: PlaceGroup }[] = [
  { label: 'Petrol', query: 'petrol', osmTag: 'amenity:fuel', group: 'fuel' },
  { label: 'Food', query: 'restoran', osmTag: 'amenity:restaurant', group: 'food' },
  { label: 'Surau', query: 'surau', osmTag: 'amenity:place_of_worship', group: 'surau' },
  { label: 'Parking', query: 'parking', osmTag: 'amenity:parking', group: 'parking' },
];

/** The same search again (typing back over a word, reopening search) isn't asked twice. */
const searchMemory = shortMemory<Place[]>(5 * 60_000);

export async function searchPlaces(
  query: string,
  near: LngLat | null,
  signal: AbortSignal,
  osmTag?: string,
): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '8', bbox: MALAYSIA_BBOX });
  if (osmTag) params.set('osm_tag', osmTag);
  if (near) {
    params.set('lon', near[0].toFixed(4));
    params.set('lat', near[1].toFixed(4));
  }
  // Nearby ranking only needs roughly where you are, so ~1 km apart counts as the same search.
  const memoryKey = `${query.trim().toLowerCase()}|${osmTag ?? ''}|${near ? near.map((v) => v.toFixed(2)).join(',') : ''}`;
  const remembered = searchMemory.get(memoryKey);
  if (remembered) return remembered;
  const res = await ask('photon', `${PHOTON_URL}?${params}`, { signal, timeoutMs: 6000 });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as { features: PhotonFeature[] };

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const f of data.features) {
    const place = toPlace(f, places.length);
    if (!place) continue;
    const key = `${place.name}|${place.subtitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
  }
  searchMemory.set(memoryKey, places);
  return places;
}

function toPlace(f: PhotonFeature, fallbackId: number): Place | null {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name || street;
  if (!name) return null;
  const subtitle = [p.name ? street : '', p.district || p.city || p.county, p.state].filter(Boolean).join(', ');
  return { id: `${p.osm_type ?? 'X'}${p.osm_id ?? fallbackId}`, name, subtitle, coord: f.geometry.coordinates };
}

/** What's at a spot on the map (for long-press pins): nearest named place or street. */
export async function reverseGeocode(coord: LngLat, signal?: AbortSignal): Promise<{ name: string; subtitle: string } | null> {
  const params = new URLSearchParams({ lon: coord[0].toFixed(6), lat: coord[1].toFixed(6), limit: '1' });
  const res = await ask('photon', `${PHOTON_URL.replace('/api/', '/reverse')}?${params}`, { signal, timeoutMs: 6000 });
  if (!res.ok) return null;
  const data = (await res.json()) as { features: PhotonFeature[] };
  const place = data.features[0] ? toPlace(data.features[0], 0) : null;
  return place ? { name: place.name, subtitle: place.subtitle } : null;
}

/** The names of where a spot is, smallest first. Any of them can be missing. */
export interface AreaNames {
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
}

/** Areas don't move, so each square of about 1 km is only asked about once an hour. */
const areaMemory = shortMemory<AreaNames>(60 * 60_000);

/** What the area around a spot is called. The spot is rounded to about 1 km before it's sent. */
export async function areaNames(coord: LngLat): Promise<AreaNames | null> {
  const [lon, lat] = coord.map((v) => v.toFixed(2));
  const memoryKey = `${lon},${lat}`;
  const remembered = areaMemory.get(memoryKey);
  if (remembered) return remembered;
  const params = new URLSearchParams({ lon, lat, limit: '1' });
  const res = await ask('photon', `${PHOTON_URL.replace('/api/', '/reverse')}?${params}`, { timeoutMs: 6000 });
  if (!res.ok) return null;
  const data = (await res.json()) as { features: PhotonFeature[] };
  const p = data.features[0]?.properties;
  if (!p) return null;
  const names: AreaNames = { locality: p.locality, district: p.district, city: p.city, county: p.county };
  areaMemory.set(memoryKey, names);
  return names;
}

/** One manoeuvre. Text is made from these at display time, in the chosen language. */
export interface RouteStep {
  type: string;
  modifier?: string;
  /** Roundabout exit number. */
  exit?: number;
  /** Road name or number after the manoeuvre ('' if unnamed). For a 'stop', the stop's name. */
  road: string;
  location: LngLat;
  /** Metres from this manoeuvre to the next one. */
  distance: number;
}

export interface Route {
  coords: LngLat[];
  /** metres */
  distance: number;
  /** seconds */
  duration: number;
  /** Main roads on the route, e.g. "Jalan Ampang, MRR2". */
  via: string;
  steps: RouteStep[];
}

interface OsrmStep {
  name: string;
  ref?: string;
  distance: number;
  maneuver: { type: string; modifier?: string; location: LngLat; exit?: number };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: LngLat[] };
  legs: { summary: string; steps: OsrmStep[] }[];
}

/** The main roads of the whole trip, e.g. "Jalan Lintas, Jalan Tuaran". Bare route numbers ("1") are left out. */
function mainRoads(legs: OsrmRoute['legs']): string {
  const names = legs.flatMap((leg) => leg.summary.split(', ')).filter((n) => /[a-z]/i.test(n));
  return [...new Set(names)].slice(0, 2).join(', ');
}

type OsrmAnswer = { code: string; routes?: OsrmRoute[] };

/** Valhalla, asked to answer in OSRM's format. `choices`: also look for other routes. */
async function valhalla(points: LngLat[], choices: boolean, signal?: AbortSignal): Promise<OsrmAnswer> {
  const json = JSON.stringify({
    locations: points.map(([lon, lat]) => ({ lon, lat })),
    costing: 'auto',
    ...(choices && { alternates: 2 }),
    format: 'osrm',
    shape_format: 'geojson',
  });
  // A GET with the request in the address needs no CORS preflight.
  const res = await ask('valhalla', `${VALHALLA_URL}?${new URLSearchParams({ json })}`, { signal, timeoutMs: 8000 });
  const data = (await res.json()) as OsrmAnswer;
  if (res.status === 400 && (data.code === 'NoRoute' || data.code === 'NoSegment')) throw new Error('No route found');
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return data;
}

async function osrm(points: LngLat[], signal?: AbortSignal): Promise<OsrmAnswer> {
  const url =
    OSRM_URL +
    points.map((c) => `${c[0]},${c[1]}`).join(';') +
    '?overview=full&geometries=geojson&alternatives=true&steps=true';
  const res = await ask('osrm', url, { signal, timeoutMs: 10_000 });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return (await res.json()) as OsrmAnswer;
}

/** Opening the same trip again within a minute (back, then forward) reuses the routes. */
const routeMemory = shortMemory<Route[]>(60_000, 10);
const spot = (c: LngLat) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`; // ~10 m

/**
 * Driving routes, best first: up to three to choose from. With a stop the route
 * goes through it (and there's only one route). `choices: false` for a reroute,
 * which only needs the best one.
 */
export async function getRoutes(
  from: LngLat,
  to: LngLat,
  signal?: AbortSignal,
  stop?: Place | null,
  choices = true,
): Promise<Route[]> {
  const points = stop ? [from, stop.coord, to] : [from, to];
  const memoryKey = points.map(spot).join(';') + (choices ? '+' : '');
  const remembered = routeMemory.get(memoryKey);
  if (remembered) return remembered;
  let data: OsrmAnswer;
  try {
    data = await valhalla(points, choices && !stop, signal);
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError' || err.message === 'No route found') throw err;
    data = await osrm(points, signal); // Valhalla is down or busy; if OSRM is too, that's a BusyError
  }
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');

  const routes = data.routes.slice(0, 3).map((r) => ({
    coords: r.geometry.coordinates,
    distance: r.distance,
    duration: r.duration,
    via: mainRoads(r.legs),
    steps: toSteps(r, stop),
  }));
  routeMemory.set(memoryKey, routes);
  return routes;
}

function toSteps(r: OsrmRoute, stop?: Place | null): RouteStep[] {
  const steps: RouteStep[] = [];
  r.legs.forEach((leg, legIndex) => {
    for (const s of leg.steps) {
      const type = s.maneuver.type;
      // Valhalla adds a step for leaving a roundabout. The roundabout step already
      // says which exit to take, so it just runs on to the next turn.
      const prev = steps[steps.length - 1];
      if (prev && (type === 'exit roundabout' || type === 'exit rotary')) {
        prev.distance += s.distance;
        continue;
      }
      // Every leg but the last ends at the stop: "Stop at …", not "You have arrived".
      const atStop = stop != null && legIndex < r.legs.length - 1 && type === 'arrive';
      steps.push({
        type: atStop ? 'stop' : type,
        modifier: s.maneuver.modifier,
        exit: s.maneuver.exit,
        road: atStop ? stop.name : s.name || s.ref || '',
        location: s.maneuver.location,
        distance: s.distance,
      });
    }
  });
  return steps;
}
