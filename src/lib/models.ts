import type { Place } from './api';
import type { LngLat } from './geo';
import type { PlaceGroup } from './places';

/** Shown in Account → About and added to feedback emails. */
export const APP_VERSION = '0.4 · family sharing';

export interface Profile {
  name: string;
  /** Digits after +60, as typed. Empty for family who joined from an invite link. */
  phone: string;
}

export type SavedKind = 'home' | 'family' | 'school' | 'work' | 'other';

export interface SavedPlace {
  label: string;
  kind: SavedKind;
  place: Place;
}

/** A place the user added because search couldn't find it. Kept on this phone for now. */
export interface MyPlace {
  id: string;
  name: string;
  group: PlaceGroup;
  coord: LngLat;
  /** ms since epoch */
  at: number;
}

/** Kinds offered when adding a missing place, in order. */
export const MY_PLACE_KINDS: { group: PlaceGroup; label: string }[] = [
  { group: 'surau', label: 'Surau / masjid' },
  { group: 'food', label: 'Food' },
  { group: 'shop', label: 'Shop' },
  { group: 'fuel', label: 'Petrol' },
  { group: '', label: 'Other' },
];

export function myPlaceToPlace(p: MyPlace): Place {
  const kind = MY_PLACE_KINDS.find((k) => k.group === p.group)?.label ?? 'Place';
  return { id: p.id, name: p.name, subtitle: `${kind} · Added by you`, coord: p.coord };
}

/** The labels offered when saving a place, in order. */
export const SAVED_PRESETS: { label: string; kind: SavedKind }[] = [
  { label: 'Rumah', kind: 'home' },
  { label: 'Rumah Atuk', kind: 'family' },
  { label: 'Sekolah', kind: 'school' },
  { label: 'Office', kind: 'work' },
];

export type HazardType = 'accident' | 'jam' | 'flood' | 'roadblock' | 'hazard' | 'pothole' | 'camera';

export const HAZARDS: { type: HazardType; label: string }[] = [
  { type: 'accident', label: 'Accident' },
  { type: 'jam', label: 'Traffic jam' },
  { type: 'flood', label: 'Flood' },
  { type: 'roadblock', label: 'Roadblock' },
  { type: 'hazard', label: 'Object on road' },
  { type: 'pothole', label: 'Pothole' },
  { type: 'camera', label: 'Speed camera' },
];

export interface HazardReport {
  id: string;
  type: HazardType;
  coord: LngLat;
  note: string;
  /** ms since epoch */
  at: number;
  /** Last time someone said it's still there (ms); it lasts from then. */
  seenAt?: number;
  /** How many drivers said it's still there. */
  ups?: number;
  /** From the OTW server, so everyone nearby sees it (false: only on this phone). */
  shared?: boolean;
}

/** Reports disappear after this long. */
export const REPORT_LIFETIME_MS = 2 * 60 * 60 * 1000;
/** Speed cameras stay put, so they're kept much longer. */
export const CAMERA_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function reportLifetime(type: HazardType): number {
  return type === 'camera' ? CAMERA_LIFETIME_MS : REPORT_LIFETIME_MS;
}

export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return letters || 'You';
}
