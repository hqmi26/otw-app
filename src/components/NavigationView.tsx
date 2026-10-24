import type { Place, Route } from '../lib/api';
import { formatClock, formatDistance, formatDuration } from '../lib/geo';
import { arrowRotation } from '../lib/instructions';
import type { Progress } from '../hooks/useNavigation';
import { useSheetHeight } from '../hooks/useSheetHeight';
import { AlertIcon, FlagIcon, MutedIcon, RoundaboutIcon, SoundIcon, TurnArrowIcon } from './icons';

interface Props {
  route: Route;
  progress: Progress | null;
  destination: Place;
  muted: boolean;
  rerouting: boolean;
  /** Set when the car is simulated (no GPS); shows the speed control. */
  demoSpeed: number | null;
  onToggleMute: () => void;
  onDemoSpeed: () => void;
  onReport: () => void;
  onEnd: () => void;
}

function ManeuverIcon({ type, modifier }: { type: string; modifier?: string }) {
  if (type === 'arrive') return <FlagIcon size={44} />;
  if (type === 'roundabout' || type === 'rotary') return <RoundaboutIcon size={44} />;
  return <TurnArrowIcon size={44} style={{ transform: `rotate(${arrowRotation(modifier)}deg)` }} />;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export default function NavigationView(p: Props) {
  const sheet = useSheetHeight<HTMLElement>();
  const step = p.progress ? p.route.steps[p.progress.stepIndex] : p.route.steps[0];
  const then = p.progress ? p.route.steps[p.progress.stepIndex + 1] : undefined;
  const remainingTime = p.progress?.remainingTime ?? p.route.duration;
  const remaining = p.progress?.remaining ?? p.route.distance;

  return (
    <>
      <div className="nav-card" role="status" aria-live="polite">
        <div className="nav-main">
          <ManeuverIcon type={step.type} modifier={step.modifier} />
          <div className="nav-text">
            {p.progress && step.type !== 'arrive' && (
              <span className="nav-dist">{formatDistance(p.progress.toManeuver)}</span>
            )}
            <span className="nav-instruction">{step.instruction}</span>
          </div>
        </div>
        {then && then.type !== 'arrive' && <div className="nav-then">Then {lowerFirst(then.instruction)}</div>}
      </div>

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
