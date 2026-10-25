import type { Place, Route } from '../lib/api';
import { formatClock, formatDistance, formatDuration } from '../lib/geo';
import { instruction, thenText, type Lang } from '../lib/instructions';
import type { Progress } from '../hooks/useNavigation';
import { useSheetHeight } from '../hooks/useSheetHeight';
import { ManeuverIcon } from './brand';
import { AlertIcon, MutedIcon, NavArrowIcon, SoundIcon } from './icons';

interface Props {
  route: Route;
  progress: Progress | null;
  /** Seconds left, already adjusted for rush hour and the real pace. */
  remainingTime: number | null;
  destination: Place;
  lang: Lang;
  muted: boolean;
  rerouting: boolean;
  /** Set when the car is simulated (no GPS); shows the speed control. */
  demoSpeed: number | null;
  /** False after the user drags the map; shows the Re-centre button. */
  following: boolean;
  onRecenter: () => void;
  onToggleMute: () => void;
  onDemoSpeed: () => void;
  onShowSteps: () => void;
  onReport: () => void;
  onEnd: () => void;
}

export default function NavigationView(p: Props) {
  const sheet = useSheetHeight<HTMLElement>();
  const step = p.progress ? p.route.steps[p.progress.stepIndex] : p.route.steps[0];
  const then = p.progress ? p.route.steps[p.progress.stepIndex + 1] : undefined;
  const remainingTime = p.remainingTime ?? p.route.duration;
  const remaining = p.progress?.remaining ?? p.route.distance;

  return (
    <>
      <button
        type="button"
        className="nav-card"
        onClick={p.onShowSteps}
        aria-label={`${instruction(step, p.lang)}. Show all turns`}
      >
        <span className="nav-main">
          <ManeuverIcon type={step.type} modifier={step.modifier} />
          <span className="nav-text" role="status" aria-live="polite">
            {p.progress && step.type !== 'arrive' && (
              <span className="nav-dist">{formatDistance(p.progress.toManeuver)}</span>
            )}
            <span className="nav-instruction">{instruction(step, p.lang)}</span>
          </span>
        </span>
        <span className="nav-then">
          <span>{then && then.type !== 'arrive' ? thenText(then, p.lang) : ' '}</span>
          <span className="nav-steps-hint">{p.lang === 'ms' ? 'Semua belokan' : 'All turns'} ›</span>
        </span>
      </button>

      <div className="chips">
        {p.rerouting && <span className="chip">Finding a new route…</span>}
        {p.demoSpeed != null && (
          <button type="button" className="chip chip-btn" onClick={p.onDemoSpeed}>
            Demo drive ×{p.demoSpeed}
          </button>
        )}
      </div>

      <div className="fab-stack fab-nav">
        <button
          type="button"
          className="round-btn"
          onClick={p.onToggleMute}
          aria-label={p.muted ? 'Turn voice on' : 'Mute voice'}
          aria-pressed={p.muted}
        >
          {p.muted ? <MutedIcon /> : <SoundIcon />}
        </button>
        <button type="button" className="round-btn is-report" onClick={p.onReport} aria-label="Report a hazard">
          <AlertIcon />
        </button>
      </div>

      {!p.following && (
        <button type="button" className="recenter-btn" onClick={p.onRecenter}>
          <NavArrowIcon size={18} />
          Re-centre
        </button>
      )}

      <section ref={sheet} className="sheet sheet-nav" aria-label="Trip">
        <div className="nav-summary">
          <div className="row-text">
            <span className="nav-eta">{formatDuration(remainingTime)}</span>
            <span className="row-sub">
              {formatDistance(remaining)} · arrive {formatClock(new Date(Date.now() + remainingTime * 1000))}
            </span>
          </div>
          <button type="button" className="danger-btn" onClick={p.onEnd}>
            End
          </button>
        </div>
      </section>

      {p.progress?.arrived && (
        <div className="overlay">
          <section className="sheet sheet-arrive" role="dialog" aria-labelledby="arrive-title">
            <div className="handle" />
            <h2 id="arrive-title" className="sheet-title big">
              Dah sampai!
            </h2>
            <p className="row-sub">You’ve arrived at {p.destination.name}.</p>
            <button type="button" className="primary-btn" onClick={p.onEnd}>
              Done
            </button>
          </section>
        </div>
      )}
    </>
  );
}
