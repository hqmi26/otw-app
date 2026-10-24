import { useEffect, useState } from 'react';

/** Keeps a screen mounted for a moment after it closes, so it can animate out. */
export function usePresence(open: boolean, ms = 300) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, leaving: !open && mounted };
}
