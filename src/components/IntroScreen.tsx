import { useEffect } from 'react';
import { OtwMark } from './brand';

const INTRO_MS = 2300;

/** App icon on black, then the teal OTW splash, like the design (screen 0a). Tap to skip. */
export default function IntroScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, INTRO_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <button type="button" className="intro" onClick={onDone} aria-label="OTW, Aplikasi trip anda. Tap to continue.">
      <span className="intro-icon">
        <span className="intro-tile">
          <OtwMark size={58} color="#0B5F52" />
        </span>
      </span>
      <span className="intro-splash">
        <span className="intro-brand">
          <OtwMark size={84} color="#FFFFFF" />
          <span className="intro-name">OTW</span>
          <span className="intro-tag">“Aplikasi trip anda”</span>
        </span>
      </span>
    </button>
  );
}
