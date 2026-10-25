import { useEffect, useState } from 'react';

/*
 * The phone's compass: which way the top of the phone points, 0–360° from north.
 * Android Chrome gives it through `deviceorientationabsolute`; iPhone Safari
 * through `webkitCompassHeading`, but only after the user allows motion access
 * (see requestCompassPermission, which must run inside a tap).
 */

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type IOSPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Ask iPhone for motion/compass access. Call from a tap handler. No-op elsewhere. */
export async function requestCompassPermission(): Promise<void> {
  const api = (window.DeviceOrientationEvent as unknown as IOSPermissionApi | undefined)?.requestPermission;
  if (!api) return;
  try {
    await api();
  } catch {
    // Declined or not allowed here: we fall back to GPS direction.
  }
}

/** Move `from` toward `to` by `amount` (0–1), going the short way round the circle. */
function blendAngle(from: number, to: number, amount: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * amount + 360) % 360;
}

const UPDATE_MS = 120;
const SMOOTHING = 0.3;

export function useCompass(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let smoothed: number | null = null;
    let lastPublish = 0;

    const apply = (raw: number) => {
      const screenAngle = window.screen.orientation?.angle ?? 0;
      const h = (raw + screenAngle + 360) % 360;
      smoothed = smoothed == null ? h : blendAngle(smoothed, h, SMOOTHING);
      const now = performance.now();
      if (now - lastPublish >= UPDATE_MS) {
        lastPublish = now;
        setHeading(Math.round(smoothed));
      }
    };

    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha != null) apply(360 - e.alpha);
    };
    const onIOS = (e: Event) => {
      const h = (e as IOSOrientationEvent).webkitCompassHeading;
      if (h != null && !Number.isNaN(h)) apply(h);
    };

    const hasAbsolute = 'ondeviceorientationabsolute' in window;
    if (hasAbsolute) window.addEventListener('deviceorientationabsolute', onAbsolute as EventListener);
    else window.addEventListener('deviceorientation', onIOS);
    return () => {
      if (hasAbsolute) window.removeEventListener('deviceorientationabsolute', onAbsolute as EventListener);
      else window.removeEventListener('deviceorientation', onIOS);
    };
  }, [enabled]);

  return enabled ? heading : null;
}
