import { reverseGeocode, searchPlaces, CATEGORIES, type Place } from './api';
import { distance, type LngLat } from './geo';
import { myPlaceToPlace, type MyPlace } from './models';
import { covers, dedupe, loadPlaces, nearbyInGroup, placeAt, scoreName, searchIndex, type Hit } from './places';

type Category = (typeof CATEGORIES)[number];

interface FindArgs {
  query: string;
  category: Category | null;
  near: LngLat | null;
  mine: MyPlace[];
  signal: AbortSignal;
}

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
 * list (Overture + OpenStreetMap); elsewhere, or if nothing in Sabah matches,
 * it asks the Photon server. Places the user added come first.
 */
export async function findPlaces(args: FindArgs): Promise<Place[]> {
  const { query, category, near, signal } = args;
  const mine = searchMine(args);
  const ix = await loadPlaces();
  abortIfStale(signal);

  const local = ix != null && (near == null || covers(ix, near));
  if (local) {
    const hits = category ? nearbyInGroup(ix, category.group, near) : searchIndex(ix, query, near);
    if (hits.length > 0 || mine.length > 0) return dedupe([...mine, ...hits]).map((h) => h.place).slice(0, 10);
  }
  try {
    const remote = await searchPlaces(category ? category.query : query, near, signal, category?.osmTag);
    return [...mine.map((h) => h.place), ...remote];
  } catch (e) {
    // Offline but the Sabah list was searched: "nothing found" is the honest answer.
    if (local && (e as Error).name !== 'AbortError') return mine.map((h) => h.place);
    throw e;
  }
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
