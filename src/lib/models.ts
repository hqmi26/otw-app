import type { Place } from './api';
import type { LngLat } from './geo';

export interface Profile {
  name: string;
  /** Digits after +60, as typed. */
  phone: string;
}

export type SavedKind = 'home' | 'family' | 'school' | 'work' | 'other';

export interface SavedPlace {
  label: string;
  kind: SavedKind;
  place: Place;
}

/** The labels offered when saving a place, in order. */
export const SAVED_PRESETS: { label: string; kind: SavedKind }[] = [
  { label: 'Rumah', kind: 'home' },
  { label: 'Rumah Atuk', kind: 'family' },
  { label: 'Sekolah', kind: 'school' },
  { label: 'Office', kind: 'work' },
];

export type HazardType = 'accident' | 'jam' | 'flood' | 'roadblock' | 'hazard' | 'pothole';

export const HAZARDS: { type: HazardType; label: string }[] = [
  { type: 'accident', label: 'Accident' },
  { type: 'jam', label: 'Traffic jam' },
  { type: 'flood', label: 'Flood' },
  { type: 'roadblock', label: 'Roadblock' },
  { type: 'hazard', label: 'Object on road' },
  { type: 'pothole', label: 'Pothole' },
];

export interface HazardReport {
  id: string;
  type: HazardType;
  coord: LngLat;
  note: string;
  /** ms since epoch */
  at: number;
}

/** Reports disappear after this long. */
export const REPORT_LIFETIME_MS = 2 * 60 * 60 * 1000;

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
