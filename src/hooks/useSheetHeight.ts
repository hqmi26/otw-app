import { useEffect, useRef } from 'react';

/**
 * Measures a bottom sheet and publishes its height as --sheet-h on the app,
 * so floating buttons and the map credit sit just above it.
 */
export function useSheetHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const app = el?.closest<HTMLElement>('.app');
    if (!el || !app) return;
    const publish = () => app.style.setProperty('--sheet-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      app.style.removeProperty('--sheet-h');
    };
  }, []);
  return ref;
}
