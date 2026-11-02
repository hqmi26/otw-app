import type { Place, Route, RouteStep } from './api';
import { distance, type LngLat } from './geo';
import { ask as askService } from './net';

/*
 * GrabMaps, through our own /api/geo server (functions/api/geo). It holds the
 * Amazon key. When it isn't set up, api.ts and search.ts use the free services.
 *
 * Amazon's rules: a GrabMaps result may only be kept (saved places, recents, the
 * trip name on the family server) if it was asked for as Storage, so those go
 * through keepPlace first. Routes can't be cached at all.
 */

/** A slow or hung call gives up after this, so the free services can take over. */
const GEO_TIMEOUT_MS = 8000;

export interface GeoStatus {
  grab: boolean;
  traffic: boolean;
}

const OFF: GeoStatus = { grab: false, traffic: false };
let status: Promise<GeoStatus> | null = null;

/** What the server has keys for. Asked once; a failed ask (e.g. offline) is tried again next time. */
export function geoStatus(): Promise<GeoStatus> {
  status ??= askService('grab', '/api/geo/status', { timeoutMs: GEO_TIMEOUT_MS })
    .then((res) => (res.ok ? (res.json() as Promise<GeoStatus>) : OFF))
    .catch(() => {
      status = null;
      return OFF;
    });
  return status;
}

async function ask<T>(action: string, body: object, signal?: AbortSignal): Promise<T> {
  const res = await askService('grab', `/api/geo/${action}`, {
    signal,
    timeoutMs: GEO_TIMEOUT_MS,
    init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  });
  if (!res.ok) throw new Error(`GrabMaps failed (${res.status})`);
  return (await res.json()) as T;
}

interface AwsPlace {
  PlaceId?: string;
  Title?: string;
  Position?: LngLat;
  Address?: {
    Label?: string;
    Street?: string;
    District?: string;
    Locality?: string;
    Region?: { Name?: string };
  };
}

const GRAB_ID = 'grab:';

function toPlace(p: AwsPlace, title = p.Title): Place | null {
  if (!p.PlaceId || !title || !p.Position) return null;
  const a = p.Address;
  const parts = [a?.Street, a?.District ?? a?.Locality, a?.Region?.Name].filter((s) => s && s !== title);
  return {
    id: `${GRAB_ID}${p.PlaceId}`,
    name: title,
    subtitle: parts.length > 0 ? parts.join(', ') : (a?.Label ?? ''),
    coord: p.Position,
  };
}

const isPlace = (p: Place | null): p is Place => p != null;

export async function grabSuggest(query: string, near: LngLat, signal: AbortSignal): Promise<Place[]> {
  type Item = { Title?: string; Place?: AwsPlace };
  const data = await ask<{ ResultItems?: Item[] }>('suggest', { query, near }, signal);
  // The rest are suggested search words, which have no place.
  return (data.ResultItems ?? []).map((r) => (r.Place ? toPlace(r.Place, r.Title ?? r.Place.Title) : null)).filter(isPlace);
}

export async function grabNearby(near: LngLat, categories: readonly string[], signal: AbortSignal): Promise<Place[]> {
  const data = await ask<{ ResultItems?: AwsPlace[] }>('nearby', { near, categories }, signal);
  return (data.ResultItems ?? []).map((p) => toPlace(p)).filter(isPlace);
}

/** The name for a dropped pin. It goes into recents, so the server asks for it as Storage. */
export async function grabReverse(coord: LngLat): Promise<Place | null> {
  const data = await ask<{ ResultItems?: AwsPlace[] }>('reverse', { near: coord });
  const found = data.ResultItems?.[0];
  return found ? toPlace(found) : null;
}

/** A place whose name may be kept as it is: our own, or already asked for as Storage. */
export const canKeep = (place: Place) => !place.id.startsWith(GRAB_ID) || place.stored === true;

/** How close a Storage result must be to count as the same place. */
const SAME_PLACE_M = 300;

/**
 * The version of a place that may be kept on the phone. Our own places need
 * nothing; a GrabMaps result is asked for again as Storage. Null: it can't be kept.
 */
export async function keepPlace(place: Place): Promise<Place | null> {
  if (canKeep(place)) return place;
  const data = await ask<{ ResultItems?: AwsPlace[] }>('keep', { name: place.name, near: place.coord });
  const found = (data.ResultItems ?? [])
    .map((p) => toPlace(p))
    .filter(isPlace)
    .find((p) => distance(p.coord, place.coord) <= SAME_PLACE_M);
  return found ? { ...found, id: place.id, stored: true } : null;
}

interface StepDetails {
  SteeringDirection?: string;
  TurnAngle?: number;
  RelativeExit?: number;
}

interface AwsRoad {
  RoadName?: { Value?: string }[];
  RouteNumber?: { Value?: string }[];
}

type AwsStep = {
  Type: string;
  Distance?: number;
  Duration?: number;
  GeometryOffset?: number;
  CurrentRoad?: AwsRoad;
  NextRoad?: AwsRoad;
} & { [details: `${string}StepDetails`]: StepDetails | undefined };

interface AwsLeg {
  Geometry?: { LineString?: LngLat[] };
  VehicleLegDetails?: { TravelSteps?: AwsStep[] };
  FerryLegDetails?: { TravelSteps?: AwsStep[] };
}

interface AwsRoute {
  Legs?: AwsLeg[];
  Summary?: { Distance?: number; Duration?: number };
}

const roadName = (road?: AwsRoad) => road?.RoadName?.[0]?.Value ?? road?.RouteNumber?.[0]?.Value ?? '';

/** Turns tighter or gentler than these aren't called plain left or right. */
const SLIGHT_TURN_DEG = 40;
const SHARP_TURN_DEG = 130;

/**
 * "Left" at 30° becomes "slight left", the words instructions.ts works with.
 * The angle decides, because GrabMaps' own TurnIntensity calls an ordinary 90° turn "Sharp".
 */
function modifier(d?: StepDetails): string | undefined {
  const dir = d?.SteeringDirection?.toLowerCase();
  if (!dir || dir === 'straight' || d?.TurnAngle == null) return dir;
  const angle = Math.abs(d.TurnAngle);
  if (angle < SLIGHT_TURN_DEG) return `slight ${dir}`;
  if (angle > SHARP_TURN_DEG) return `sharp ${dir}`;
  return dir;
}

/** Amazon's step types in the words instructions.ts works with. Roundabouts are handled apart. */
const STEP_TYPES: Record<string, string> = {
  Depart: 'depart',
  Arrive: 'arrive',
  Turn: 'turn',
  UTurn: 'turn',
  Continue: 'continue',
  ContinueHighway: 'continue',
  Keep: 'continue',
  EnterHighway: 'on ramp',
  Ramp: 'on ramp',
  Exit: 'off ramp',
};

function toSteps(legs: AwsLeg[], stop: Place | null): RouteStep[] {
  const steps: RouteStep[] = [];
  legs.forEach((leg, legIndex) => {
    const line = leg.Geometry?.LineString ?? [];
    for (const s of leg.VehicleLegDetails?.TravelSteps ?? leg.FerryLegDetails?.TravelSteps ?? []) {
      const metres = s.Distance ?? 0;
      const prev = steps[steps.length - 1];
      const inRoundabout = prev?.type === 'roundabout' && !prev.exit;
      // One roundabout comes as enter, pass, pass, exit. OTW says it once, with the exit number.
      if (s.Type === 'RoundaboutPass' && inRoundabout) {
        prev.distance += metres;
        continue;
      }
      if (s.Type === 'RoundaboutExit' && inRoundabout) {
        prev.exit = s.RoundaboutExitStepDetails?.RelativeExit;
        prev.modifier = modifier(s.RoundaboutExitStepDetails) ?? prev.modifier;
        prev.road = roadName(s.NextRoad) || prev.road;
        prev.distance += metres;
        continue;
      }
      const road = roadName(s.NextRoad) || roadName(s.CurrentRoad);
      // Carrying on along the same road is nothing to announce.
      if (s.Type === 'Continue' && prev && prev.road === road) {
        prev.distance += metres;
        continue;
      }
      const round = s.Type.startsWith('Roundabout');
      const atStop = stop != null && legIndex < legs.length - 1 && s.Type === 'Arrive';
      steps.push({
        type: atStop ? 'stop' : round ? 'roundabout' : (STEP_TYPES[s.Type] ?? 'continue'),
        modifier: s.Type === 'UTurn' ? 'uturn' : modifier(s[`${s.Type}StepDetails`]),
        exit: s.RoundaboutExitStepDetails?.RelativeExit,
        road: atStop ? stop.name : road,
        location: line[s.GeometryOffset ?? 0] ?? line[0],
        distance: metres,
      });
    }
  });
  return steps;
}

/** The named roads of a route, the ones it uses most first. Bare route numbers ("1") are left out. */
function longestRoads(steps: RouteStep[]): string[] {
  const metres = new Map<string, number>();
  for (const s of steps) {
    if (/[a-z]/i.test(s.road) && s.type !== 'stop') metres.set(s.road, (metres.get(s.road) ?? 0) + s.distance);
  }
  return [...metres].sort((a, b) => b[1] - a[1]).map(([road]) => road);
}

/**
 * The roads to name on a route's card. Choices often share most of the way, so the
 * road only this route uses comes first: otherwise two cards can read the same.
 */
function viaRoads(steps: RouteStep[], others: RouteStep[][]): string {
  const roads = longestRoads(steps);
  const shared = new Set(others.flatMap(longestRoads));
  const own = roads.find((road) => !shared.has(road));
  return [...(own ? [own] : []), ...roads.filter((road) => road !== own)].slice(0, 2).join(', ');
}

export function toRoutes(data: { Routes?: AwsRoute[] }, stop: Place | null): Route[] {
  const list = (data.Routes ?? []).slice(0, 3);
  const steps = list.map((r) => toSteps(r.Legs ?? [], stop));
  return list.map((r, i) => ({
    coords: (r.Legs ?? []).flatMap((leg) => leg.Geometry?.LineString ?? []),
    distance: r.Summary?.Distance ?? steps[i].reduce((sum, s) => sum + s.distance, 0),
    duration: r.Summary?.Duration ?? 0,
    via: viaRoads(steps[i], steps.filter((_, k) => k !== i)),
    steps: steps[i],
    traffic: true,
  }));
}

/** Driving routes with GrabMaps' traffic in the times. `choices`: also look for other routes. */
export async function grabRoutes(
  points: LngLat[],
  choices: boolean,
  stop: Place | null,
  signal?: AbortSignal,
): Promise<Route[]> {
  const routes = toRoutes(await ask<{ Routes?: AwsRoute[] }>('routes', { points, choices }, signal), stop);
  if (!routes.length || routes.some((r) => r.coords.length < 2 || r.duration <= 0)) throw new Error('No route found');
  return routes;
}
