import { useCallback, useEffect, useState } from 'react';
import type { LngLat } from '../lib/geo';

export interface Fix {
  coord: LngLat;
  accuracy: number;
  /** Degrees from north, or null when standing still. */
  heading: number | null;
  /** metres per second, or null if unknown */
  speed: number | null;
}

/** Why there's no location: blocked for this site, GPS can't get a fix, or no GPS in this browser at all. */
export type LocationProblem = 'denied' | 'unavailable' | 'unsupported';

/** Watches the phone's GPS. `error` is a message ready to show the user. */
export function useGeolocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setProblem('unsupported');
      setError('This browser can’t share your location.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setProblem(null);
        setFix({
          coord: [p.coords.longitude, p.coords.latitude],
          accuracy: p.coords.accuracy,
          heading: p.coords.heading != null && !Number.isNaN(p.coords.heading) ? p.coords.heading : null,
          speed: p.coords.speed,
        });
      },
      (e) => {
        const denied = e.code === e.PERMISSION_DENIED;
        setProblem(denied ? 'denied' : 'unavailable');
        setError(
          denied
            ? 'Location is off. Allow it in your browser to see where you are.'
            : 'Can’t find your location right now.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  // Start again by itself when the user allows location in the browser's settings.
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === 'granted') setAttempt((n) => n + 1);
    };
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => {
        // Older browsers can't tell us; the Try again button still works.
      });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, []);

  const retry = useCallback(() => {
    setProblem(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { fix, error, problem, retry };
}
