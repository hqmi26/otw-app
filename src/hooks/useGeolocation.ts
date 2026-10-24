import { useEffect, useState } from 'react';
import type { LngLat } from '../lib/geo';

export interface Fix {
  coord: LngLat;
  accuracy: number;
  /** Degrees from north, or null when standing still. */
  heading: number | null;
  /** metres per second, or null if unknown */
  speed: number | null;
}

/** Watches the phone's GPS. `error` is a message ready to show the user. */
export function useGeolocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('This browser can’t share your location.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setFix({
          coord: [p.coords.longitude, p.coords.latitude],
          accuracy: p.coords.accuracy,
          heading: p.coords.heading != null && !Number.isNaN(p.coords.heading) ? p.coords.heading : null,
          speed: p.coords.speed,
        });
      },
      (e) => {
        setError(
          e.code === e.PERMISSION_DENIED
            ? 'Location is off. Allow it in your browser to see where you are.'
            : 'Can’t find your location right now.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { fix, error };
}
