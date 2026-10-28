import type { LngLat } from './geo';
import type { PlaceGroup } from './places';

/*
 * Free public services, no API keys:
 *  - Photon (komoot) for place search outside Sabah (Sabah is searched on the phone, see places.ts)
 *  - OSRM demo server for driving routes
 * Both are fine for family testing. For a public launch, self-host them on a
 * server in Malaysia (see README) so nobody's location leaves the country.
 */
const PHOTON_URL = 'https://photon.komoot.io/api/';
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
  const res = await fetch(`${PHOTON_URL}?${params}`, { signal });
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
  const res = await fetch(`${PHOTON_URL.replace('/api/', '/reverse')}?${params}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { features: PhotonFeature[] };
  const place = data.features[0] ? toPlace(data.features[0], 0) : null;
  return place ? { name: place.name, subtitle: place.subtitle } : null;
}

/** One manoeuvre. Text is made from these at display time, in the chosen language. */
export interface RouteStep {
  type: string;
  modifier?: string;
  /** Roundabout exit number. */
  exit?: number;
  /** Road name or number after the manoeuvre ('' if unnamed). */
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

export async function getRoutes(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route[]> {
  const url =
    `${OSRM_URL}${from[0]},${from[1]};${to[0]},${to[1]}` +
    '?overview=full&geometries=geojson&alternatives=true&steps=true';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = (await res.json()) as { code: string; routes?: OsrmRoute[] };
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');

  return data.routes.slice(0, 2).map((r) => ({
    coords: r.geometry.coordinates,
    distance: r.distance,
    duration: r.duration,
    via: r.legs[0]?.summary ?? '',
    steps: r.legs.flatMap((leg) =>
      leg.steps.map((s) => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
        exit: s.maneuver.exit,
        road: s.name || s.ref || '',
        location: s.maneuver.location,
        distance: s.distance,
      })),
    ),
  }));
}
