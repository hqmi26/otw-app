import { useState } from 'react';
import type { Place } from '../lib/api';

const STORAGE_KEY = 'otw-recents';
const MAX = 6;

function load(): Place[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Place[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && p.name && Array.isArray(p.coord)) : [];
  } catch {
    return [];
  }
}

/** Places the user went to recently, newest first, kept on this phone only. */
export function useRecents() {
  const [recents, setRecents] = useState<Place[]>(load);

  const add = (place: Place) => {
    setRecents((prev) => {
      const next = [place, ...prev.filter((p) => p.id !== place.id)].slice(0, MAX);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full or blocked: keep it for this session only.
      }
      return next;
    });
  };

  return { recents, add };
}
