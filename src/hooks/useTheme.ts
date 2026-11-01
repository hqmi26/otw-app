import { useEffect, useRef, useState } from 'react';
import { sunIsDown, type LngLat } from '../lib/geo';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'otw-theme';
const AUTO_KEY = 'otw-theme-auto';
const media = window.matchMedia('(prefers-color-scheme: dark)');

/** Used for the sun until the phone's location comes in. */
const KOTA_KINABALU: LngLat = [116.0762, 5.9836];
const SUN_CHECK_MS = 60_000;

function readSaved(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Follows the phone's light/dark setting until the user picks one. With Auto
 * day and night on, it follows the sun at `near` instead.
 */
export function useTheme(near: LngLat | null) {
  const [saved, setSaved] = useState<Theme | null>(readSaved);
  const [systemDark, setSystemDark] = useState(media.matches);
  const [auto, setAutoOn] = useState(readAuto);
  const here = useRef(near ?? KOTA_KINABALU);
  here.current = near ?? here.current;
  const [night, setNight] = useState(() => sunIsDown(new Date(), here.current));

  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const check = () => setNight(sunIsDown(new Date(), here.current));
    check();
    const timer = window.setInterval(check, SUN_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [auto]);

  const theme: Theme = auto ? (night ? 'dark' : 'light') : (saved ?? (systemDark ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0F1513' : '#0B5F52');
  }, [theme]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice just won't be remembered.
    }
  };

  const setAuto = (on: boolean) => {
    setAutoOn(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
    } catch {
      // Private mode: the choice just won't be remembered.
    }
  };

  return { theme, toggle, auto, setAuto };
}
