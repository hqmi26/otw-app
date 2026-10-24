import type { LngLat } from './geo';
import { describeStep } from './instructions';

/*
 * Free public services, no API keys:
 *  - Photon (komoot) for place search
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
export const CATEGORIES = [
  { label: 'Petrol', query: 'petrol', osmTag: 'amenity:fuel' },
  { label: 'Food', query: 'restoran', osmTag: 'amenity:restaurant' },
  { label: 'Surau', query: 'surau', osmTag: 'amenity:place_of_worship' },
  { label: 'Parking', query: 'parking', osmTag: 'amenity:parking' },
] as const;

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
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const name = p.name || street;
    if (!name) continue;
    const subtitle = [p.name ? street : '', p.district || p.city || p.county, p.state]
      .filter(Boolean)
      .join(', ');
    const key = `${name}|${subtitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `${p.osm_type ?? 'X'}${p.osm_id ?? places.length}`,
      name,
      subtitle,
      coord: f.geometry.coordinates,
    });
  }
  return places;
}

export interface RouteStep {
  instruction: string;
  type: string;
  modifier?: string;
  location: LngLat;
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
        instruction: describeStep(s),
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
        location: s.maneuver.location,
      })),
    ),
  }));
}
