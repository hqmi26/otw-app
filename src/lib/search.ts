import { reverseGeocode, searchPlaces, CATEGORIES, type Place } from './api';
import { distance, type LngLat } from './geo';
import { geoStatus, grabNearby, grabReverse, grabSuggest } from './grab';
import { myPlaceToPlace, type MyPlace } from './models';
import { covers, dedupe, loadPlaces, nearbyInGroup, placeAt, scoreName, searchIndex, type Hit } from './places';

type Category = (typeof CATEGORIES)[number];

interface FindArgs {
  query: string;
  category: Category | null;
  near: LngLat | null;
  mine: MyPlace[];
  signal: AbortSignal;
  /** Gets the Sabah results straight away, while other states are still being asked. */
  onFirst?: (places: Place[]) => void;
}

/** Sabah results further than this come after places in other states ("Mid Valley" is in KL, not Tawau). */
const FAR = 50_000;
/** The same name this close together is one place, listed twice. */
const SAME_PLACE_M = 300;
const MAX_RESULTS = 10;
/** Room kept for places only our own list has, so GrabMaps can't push them all off the end. */
const KEEP_FOR_OURS = 3;

function abortIfStale(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Search replaced by a newer one', 'AbortError');
}

/** The user's own added places that match, best first. */
function searchMine({ query, category, near, mine }: FindArgs): Hit[] {
  return mine
    .map((p) => {
      const score = category ? (p.group === category.group ? 1 : 0) : scoreName(p.name, query);
      const away = near ? distance(near, p.coord) / 1000 : 0;
      return { place: myPlaceToPlace(p), score: score > 0 ? score + 2 - Math.log10(1 + away) : 0 };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
}

const samePlace = (a: Place, b: Place) =>
  a.name.toLowerCase() === b.name.toLowerCase() && distance(a.coord, b.coord) <= SAME_PLACE_M;

/**
 * GrabMaps' answer joined with what we already found: the user's own places
 * first, then GrabMaps, then anything only our own list has. The chips want
 * what's closest, so there the whole list goes by distance.
 */
async function askGrab(args: FindArgs, near: LngLat, first: Place[], ownCount: number): Promise<Place[]> {
  const { query, category, signal } = args;
  const grab = await (category ? grabNearby(near, category.grab, signal) : grabSuggest(query, near, signal));
  const own = first.slice(0, ownCount);
  const ours = first.slice(ownCount).filter((p) => !grab.some((g) => samePlace(g, p)));
  const theirs = grab.filter((g) => !own.some((p) => samePlace(g, p)));
  if (category) {
    const away = (p: Place) => distance(near, p.coord);
    return [...own, ...theirs, ...ours].sort((a, b) => away(a) - away(b)).slice(0, MAX_RESULTS);
  }
  const room = MAX_RESULTS - own.length - Math.min(KEEP_FOR_OURS, ours.length);
  return [...own, ...theirs.slice(0, room), ...ours].slice(0, MAX_RESULTS);
}

/**
 * Search for the search screen. Sabah is searched on the phone from our own
 * list (Overture + OpenStreetMap) and shown at once. Then GrabMaps is asked,
 * or the Photon server when it isn't set up, for the rest of Malaysia and what
 * our list misses. Places the user added come first.
 */
export async function findPlaces(args: FindArgs): Promise<Place[]> {
  const { query, category, near, signal } = args;
  const mine = searchMine(args);
  const ix = await loadPlaces();
  abortIfStale(signal);

  const local = ix != null && (near == null || covers(ix, near));
  const first = local
    ? dedupe([...mine, ...(category ? nearbyInGroup(ix, category.group, near) : searchIndex(ix, query, near))])
        .map((h) => h.place)
        .slice(0, MAX_RESULTS)
    : [];
  if (first.length > 0) args.onFirst?.(first);

  if (near && (await geoStatus()).grab) {
    abortIfStale(signal);
    try {
      return await askGrab(args, near, first, mine.length);
    } catch (e) {
      // GrabMaps failed: carry on as if it weren't set up.
      if ((e as Error).name === 'AbortError') throw e;
    }
  }

  // The chips want what's closest, and the Sabah list has that.
  if (category && first.length > 0) return first;

  let remote: Place[];
  try {
    remote = await searchPlaces(category ? category.query : query, near, signal, category?.osmTag);
  } catch (e) {
    // Offline but the Sabah list was searched: its results are the honest answer.
    if (local && (e as Error).name !== 'AbortError') return first;
    throw e;
  }
  if (first.length === 0) return [...mine.map((h) => h.place), ...remote];

  // Close-by Sabah places, then other states, then far-away Sabah places,
  // then anything Photon has in Sabah that the list doesn't.
  const names = new Set(first.map((p) => p.name.toLowerCase()));
  const inSabah = (p: Place) => covers(ix!, p.coord);
  const close = first.filter((p) => near == null || distance(near, p.coord) <= FAR);
  const far = first.filter((p) => !close.includes(p));
  const extra = remote.filter((p) => inSabah(p) && !names.has(p.name.toLowerCase()));
  return [...close, ...remote.filter((p) => !inSabah(p)), ...far, ...extra].slice(0, 10);
}

/** Name for a dropped pin: the user's own place, then GrabMaps, then the Sabah list, then Photon. */
export async function whatIsHere(coord: LngLat, mine: MyPlace[]): Promise<{ name: string; subtitle: string } | null> {
  const own = mine.find((p) => distance(p.coord, coord) <= 40);
  if (own) return myPlaceToPlace(own);
  if ((await geoStatus()).grab) {
    const found = await grabReverse(coord).catch(() => null);
    if (found) return found;
  }
  const ix = await loadPlaces();
  if (ix && covers(ix, coord)) {
    const found = placeAt(ix, coord);
    if (found) return found;
  }
  return reverseGeocode(coord);
}
