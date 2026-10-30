import { reverseGeocode, searchPlaces, CATEGORIES, type Place } from './api';
import { distance, type LngLat } from './geo';
import { myPlaceToPlace, type MyPlace } from './models';
import {
  alongRoute,
  covers,
  dedupe,
  loadPlaces,
  nearbyInGroup,
  placeAt,
  scoreName,
  searchIndex,
  type Hit,
  type RouteAhead,
} from './places';

type Category = (typeof CATEGORIES)[number];

interface FindArgs {
  query: string;
  category: Category | null;
  near: LngLat | null;
  mine: MyPlace[];
  signal: AbortSignal;
  /** Gets the Sabah results straight away, while other states are still being asked. */
  onFirst?: (places: Place[]) => void;
  /** Adding a stop: the chips find places along the road still ahead instead of near you. */
  route?: RouteAhead | null;
}

/** Sabah results further than this come after places in other states ("Mid Valley" is in KL, not Tawau). */
const FAR = 50_000;

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

/**
 * Search for the search screen. Sabah is searched on the phone from our own
 * list (Overture + OpenStreetMap) and shown at once; the Photon server is
 * asked too, for the rest of Malaysia. Places the user added come first.
 */
export async function findPlaces(args: FindArgs): Promise<Place[]> {
  const { query, category, near, signal, route } = args;
  const mine = searchMine(args);
  const ix = await loadPlaces();
  abortIfStale(signal);

  // "Petrol on the way": in the order you'll pass them (Sabah's list only).
  if (category && route && ix) return alongRoute(ix, category.group, route).map((h) => h.place);

  const local = ix != null && (near == null || covers(ix, near));
  const first = local
    ? dedupe([...mine, ...(category ? nearbyInGroup(ix, category.group, near) : searchIndex(ix, query, near))])
        .map((h) => h.place)
        .slice(0, 10)
    : [];
  // The chips want what's closest, and the Sabah list has that.
  if (category && first.length > 0) return first;
  if (first.length > 0) args.onFirst?.(first);

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

/** Name for a dropped pin: the user's own place, then the Sabah list, then Photon. */
export async function whatIsHere(coord: LngLat, mine: MyPlace[]): Promise<{ name: string; subtitle: string } | null> {
  const own = mine.find((p) => distance(p.coord, coord) <= 40);
  if (own) return myPlaceToPlace(own);
  const ix = await loadPlaces();
  if (ix && covers(ix, coord)) {
    const found = placeAt(ix, coord);
    if (found) return found;
  }
  return reverseGeocode(coord);
}
