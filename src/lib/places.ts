import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { Place } from './api';
import { distance, type LngLat } from './geo';

/*
 * Sabah's places, searched on the phone itself. public/places/sabah.json is
 * rebuilt every month from Overture Maps and OpenStreetMap by
 * scripts/build_places.py. Typing a search sends nothing over the internet,
 * and once the list has loaded it works with a weak signal too.
 */

/** Which search chip a place belongs to ('' = none). */
export type PlaceGroup = 'surau' | 'food' | 'fuel' | 'parking' | 'shop' | 'area' | 'street' | '';

interface PlaceFile {
  region: string;
  release: string;
  bbox: [west: number, south: number, east: number, north: number];
  border: Polygon | MultiPolygon;
  credit: string;
  cats: [label: string, group: PlaceGroup][];
  subtitles: string[];
  /** Coordinates are × 100 000; sub is an index into subtitles, or -1. */
  places: [name: string, cat: number, lon: number, lat: number, sub: number][];
}

export interface PlacesIndex {
  file: PlaceFile;
  /** Every word in the file, sorted, so words starting with what's typed sit together. */
  vocab: string[];
  vocabId: Map<string, number>;
  /** Place → its word ids: wordIds[wordStart[i] .. wordStart[i + 1]). */
  wordStart: Int32Array;
  wordIds: Int32Array;
  /** Word → places containing it. */
  postStart: Int32Array;
  posts: Int32Array;
  /** Subtitle ("Taman Indah Permai, Telipok") → its word ids, and word → subtitles. */
  subWords: Int32Array[];
  subsByWord: Map<number, number[]>;
  /** Subtitle → places that have it. */
  placesBySub: number[][];
  byGroup: Map<PlaceGroup, number[]>;
}

/** A search hit from the Sabah list or the user's own places. */
export interface Hit {
  place: Place;
  score: number;
}

/** Short forms people type, mapped to the word used in place names. */
const SHORT: Record<string, string[]> = {
  jln: ['jalan'],
  jl: ['jalan'],
  lrg: ['lorong'],
  lor: ['lorong'],
  tmn: ['taman'],
  kg: ['kampung'],
  kpg: ['kampung'],
  kampong: ['kampung'],
  sg: ['sungai'],
  bkt: ['bukit'],
  sri: ['seri'],
  mosque: ['masjid'],
  hosp: ['hospital'],
  kk: ['kota', 'kinabalu'],
  qe: ['queen', 'elizabeth'],
};
/** "Al-Amin" is also findable as "alamin". */
const ARTICLES = new Set(['al', 'ar', 'as', 'an', 'at', 'ad', 'asy', 'ash', 'az']);
/** Words people add that the place's own name may leave out: "surau TAMAN indah permai". */
const OPTIONAL = new Set(['taman', 'kampung', 'jalan', 'lorong', 'di', 'dekat', 'kat', 'near', 'the', 'of']);
/** Shown first when the same score: areas, then places, then streets. */
const GROUP_BONUS: Partial<Record<PlaceGroup, number>> = { area: 0.8, street: 0 };

export function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => SHORT[w] ?? [w]);
}

function nameWords(name: string): string[] {
  const w = words(name);
  const out = new Set(w);
  for (let i = 0; i < w.length - 1; i++) if (ARTICLES.has(w[i])) out.add(w[i] + w[i + 1]);
  return [...out];
}

/** True if a and b differ by at most one letter added, dropped or changed. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** First index in the sorted list whose word is >= w. */
function lowerBound(list: string[], w: string): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < w) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function buildIndex(file: PlaceFile): PlacesIndex {
  const rows = file.places;
  const perPlace = rows.map((r) => nameWords(r[0]));
  const perSub = file.subtitles.map((s) => [...new Set(words(s))]);
  const all = new Set<string>();
  for (const list of [...perPlace, ...perSub]) for (const w of list) all.add(w);
  const vocab = [...all].sort();
  const vocabId = new Map(vocab.map((w, i) => [w, i]));

  const wordStart = new Int32Array(rows.length + 1);
  for (let i = 0; i < rows.length; i++) wordStart[i + 1] = wordStart[i] + perPlace[i].length;
  const wordIds = new Int32Array(wordStart[rows.length]);
  const counts = new Int32Array(vocab.length);
  perPlace.forEach((list, i) =>
    list.forEach((w, j) => {
      const id = vocabId.get(w)!;
      wordIds[wordStart[i] + j] = id;
      counts[id]++;
    }),
  );
  const postStart = new Int32Array(vocab.length + 1);
  for (let w = 0; w < vocab.length; w++) postStart[w + 1] = postStart[w] + counts[w];
  const posts = new Int32Array(postStart[vocab.length]);
  const fill = postStart.slice(0, vocab.length);
  for (let i = 0; i < rows.length; i++) {
    for (let k = wordStart[i]; k < wordStart[i + 1]; k++) posts[fill[wordIds[k]]++] = i;
  }

  const pushTo = <K>(map: Map<K, number[]>, key: K, value: number) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  const subWords = perSub.map((list) => Int32Array.from(list, (w) => vocabId.get(w)!));
  const subsByWord = new Map<number, number[]>();
  subWords.forEach((ids, s) => ids.forEach((id) => pushTo(subsByWord, id, s)));
  const placesBySub: number[][] = file.subtitles.map(() => []);
  const byGroup = new Map<PlaceGroup, number[]>();
  rows.forEach(([, cat, , , sub], i) => {
    if (sub >= 0) placesBySub[sub].push(i);
    pushTo(byGroup, file.cats[cat][1], i);
  });
  return { file, vocab, vocabId, wordStart, wordIds, postStart, posts, subWords, subsByWord, placesBySub, byGroup };
}

let loading: Promise<PlacesIndex | null> | null = null;

/** Downloads and indexes the Sabah list once; null if it can't be fetched (try again later). */
export function loadPlaces(): Promise<PlacesIndex | null> {
  loading ??= fetch(`${import.meta.env.BASE_URL}places/sabah.json`)
    .then((r) => (r.ok ? (r.json() as Promise<PlaceFile>) : null))
    .then((file) => (file ? buildIndex(file) : null))
    .catch(() => null)
    .then((ix) => {
      if (!ix) loading = null;
      return ix;
    });
  return loading;
}

function inRing(ring: number[][], [x, y]: LngLat): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is this spot covered by the list (inside Sabah)? */
export function covers(ix: PlacesIndex, coord: LngLat): boolean {
  const [w, s, e, n] = ix.file.bbox;
  if (coord[0] < w || coord[0] > e || coord[1] < s || coord[1] > n) return false;
  const polys = ix.file.border.type === 'Polygon' ? [ix.file.border.coordinates] : ix.file.border.coordinates;
  return polys.some(([outer, ...holes]) => inRing(outer, coord) && !holes.some((h) => inRing(h, coord)));
}

export function toPlace(ix: PlacesIndex, i: number): Place {
  const [name, cat, x, y, sub] = ix.file.places[i];
  const area = sub >= 0 ? ix.file.subtitles[sub] : '';
  return {
    id: `l:${x},${y}:${name}`,
    name,
    subtitle: [ix.file.cats[cat][0], area].filter(Boolean).join(' · '),
    coord: [x / 1e5, y / 1e5],
  };
}

function groupOf(ix: PlacesIndex, i: number): PlaceGroup {
  return ix.file.cats[ix.file.places[i][1]][1];
}

/** How far away counts against a hit: 1 km ≈ −0.45, 10 km ≈ −1.6, 100 km ≈ −3. */
function distancePenalty(near: LngLat | null, coord: LngLat): number {
  return near ? 1.5 * Math.log10(1 + distance(near, coord) / 1000) : 0;
}

/** For each typed word: matching word ids and their weights (3 whole word, 2 start of word, 1.5 one letter off). */
function wordMatches(ix: PlacesIndex, q: string): Map<number, number> {
  const found = new Map<number, number>();
  const exact = ix.vocabId.get(q);
  if (exact != null) found.set(exact, 3);
  if (q.length >= 2) {
    for (let i = lowerBound(ix.vocab, q); i < ix.vocab.length && ix.vocab[i].startsWith(q); i++) {
      if (!found.has(i)) found.set(i, 2);
    }
  }
  if (q.length >= 4) {
    // Spelling slips: "munawarah" for "munawwarah", also while still typing the word.
    const end = lowerBound(ix.vocab, q[0] + '￿');
    for (let i = lowerBound(ix.vocab, q[0]); i < end; i++) {
      if (found.has(i)) continue;
      const w = ix.vocab[i];
      if (oneEditApart(q, w)) found.set(i, 1.5);
      else if (w.length > q.length && [q.length - 1, q.length, q.length + 1].some((n) => oneEditApart(q, w.slice(0, n)))) {
        found.set(i, 1.2);
      }
    }
  }
  return found;
}

/** Text search over the Sabah list. */
export function searchIndex(ix: PlacesIndex, query: string, near: LngLat | null, limit = 8): Hit[] {
  const qs = [...new Set(words(query))];
  if (qs.length === 0) return [];
  const matches = qs.map((q) => wordMatches(ix, q));
  // Subtitles that match a typed word (whole word or start of a word only).
  const subMatches = matches.map((m) => {
    const subs = new Set<number>();
    for (const [id, weight] of m) if (weight >= 2) ix.subsByWord.get(id)?.forEach((s) => subs.add(s));
    return subs;
  });
  const required = qs.map((q) => !OPTIONAL.has(q));
  if (!required.some(Boolean)) required.fill(true);

  // Start from the typed word that matches the fewest places, then check the rest.
  let seed = -1;
  let seedSize = Infinity;
  matches.forEach((m, k) => {
    if (!required[k]) return;
    let size = 0;
    for (const id of m.keys()) size += ix.postStart[id + 1] - ix.postStart[id];
    for (const s of subMatches[k]) size += ix.placesBySub[s].length;
    if (size < seedSize) {
      seed = k;
      seedSize = size;
    }
  });
  const candidates = new Set<number>();
  for (const id of matches[seed].keys()) {
    for (let p = ix.postStart[id]; p < ix.postStart[id + 1]; p++) candidates.add(ix.posts[p]);
  }
  for (const s of subMatches[seed]) ix.placesBySub[s].forEach((i) => candidates.add(i));

  const whole = qs.join(' ');
  const hits: { i: number; score: number }[] = [];
  for (const i of candidates) {
    let score = 0;
    let inName = 0;
    let ok = true;
    for (let k = 0; k < qs.length && ok; k++) {
      let best = 0;
      for (let w = ix.wordStart[i]; w < ix.wordStart[i + 1]; w++) best = Math.max(best, matches[k].get(ix.wordIds[w]) ?? 0);
      if (best > 0) {
        score += best;
        inName++;
      } else if (subMatches[k].has(ix.file.places[i][4])) {
        score += 1;
      } else if (required[k]) {
        ok = false;
      }
    }
    if (!ok || inName === 0) continue;
    const name = words(ix.file.places[i][0]).join(' ');
    if (name === whole) score += 2.5;
    else if (name.startsWith(whole)) score += 1.5;
    const [, , x, y] = ix.file.places[i];
    score += (GROUP_BONUS[groupOf(ix, i)] ?? 0.4) - distancePenalty(near, [x / 1e5, y / 1e5]);
    hits.push({ i, score });
  }
  // Ties keep the file's order, which puts Overture's most confident places first.
  hits.sort((a, b) => b.score - a.score || a.i - b.i);
  return dedupe(hits.slice(0, limit * 3).map((h) => ({ place: toPlace(ix, h.i), score: h.score }))).slice(0, limit);
}

/** The closest places of one kind, for the Petrol / Food / Surau / Parking chips. */
export function nearbyInGroup(ix: PlacesIndex, group: PlaceGroup, near: LngLat | null, limit = 10): Hit[] {
  const list = ix.byGroup.get(group) ?? [];
  if (!near) return list.slice(0, limit).map((i) => ({ place: toPlace(ix, i), score: 0 }));
  return list
    .map((i) => {
      const [, , x, y] = ix.file.places[i];
      return { i, d: distance(near, [x / 1e5, y / 1e5]) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ i, d }) => ({ place: toPlace(ix, i), score: -d }));
}

/** What's at a spot on the map: a place within ~40 m, else a street within ~120 m. */
export function placeAt(ix: PlacesIndex, coord: LngLat): Place | null {
  let best = -1;
  let bestD = Infinity;
  let street = -1;
  let streetD = Infinity;
  const rows = ix.file.places;
  for (let i = 0; i < rows.length; i++) {
    const dx = Math.abs(rows[i][2] / 1e5 - coord[0]);
    const dy = Math.abs(rows[i][3] / 1e5 - coord[1]);
    if (dx > 0.002 || dy > 0.002) continue; // quick skip: further than ~200 m
    const d = distance(coord, [rows[i][2] / 1e5, rows[i][3] / 1e5]);
    const group = groupOf(ix, i);
    if (group === 'street') {
      if (d < streetD) [street, streetD] = [i, d];
    } else if (group !== 'area' && d < bestD) {
      [best, bestD] = [i, d];
    }
  }
  if (best >= 0 && bestD <= 40) return toPlace(ix, best);
  if (street >= 0 && streetD <= 120) return toPlace(ix, street);
  return null;
}

/** Same place twice (e.g. a long road in two pieces nearby): keep the better one. */
export function dedupe(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  return hits.filter(({ place }) => {
    const key = `${place.name.toLowerCase()}|${place.subtitle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Points for the map's place labels: everything except streets and areas. */
export function mapFeatures(ix: PlacesIndex): FeatureCollection<Point> {
  const features: FeatureCollection<Point>['features'] = [];
  ix.file.places.forEach(([name, cat, x, y], i) => {
    const group = ix.file.cats[cat][1];
    if (group === 'street' || group === 'area') return;
    features.push({
      type: 'Feature',
      properties: { name, group, i },
      geometry: { type: 'Point', coordinates: [x / 1e5, y / 1e5] },
    });
  });
  return { type: 'FeatureCollection', features };
}

/** Score a short list directly (the user's own places), with the same weights as the index. */
export function scoreName(name: string, query: string): number {
  const qs = [...new Set(words(query))];
  const own = nameWords(name);
  let score = 0;
  for (const q of qs) {
    let best = 0;
    for (const w of own) {
      if (w === q) best = Math.max(best, 3);
      else if (q.length >= 2 && w.startsWith(q)) best = Math.max(best, 2);
      else if (q.length >= 4 && oneEditApart(q, w)) best = Math.max(best, 1.5);
    }
    if (best === 0 && !OPTIONAL.has(q)) return 0;
    score += best;
  }
  return score;
}
