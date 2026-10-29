import type { Place, Route } from '../lib/api';
import { formatClock, formatDistance, formatDuration } from '../lib/geo';
import { useSheetHeight } from '../hooks/useSheetHeight';
import { BackIcon, CloseIcon, NavArrowIcon, PlusIcon, StarIcon, UsersIcon } from './icons';

interface Props {
  destination: Place;
  originLabel: string;
  /** Label the place is saved under, e.g. "Rumah Atuk". */
  savedAs: string | null;
  /** A stop on the way, e.g. the school. */
  stop: Place | null;
  routes: Route[] | null;
  error: string | null;
  selected: number;
  /** Rush-hour slow-down for leaving now (1 = normal traffic). */
  rush: number;
  /** "Share live trip with family" switch; null hides it (no family, or on Private). */
  shareLive: boolean | null;
  onToggleShareLive: () => void;
  onSelect: (index: number) => void;
  onStart: () => void;
  onRetry: () => void;
  onSave: () => void;
  onShowSteps: () => void;
  onAddStop: () => void;
  onRemoveStop: () => void;
  /** For a dropped pin: turn it into a named place search can find. */
  onAddMissing?: () => void;
  /** For a place the user added: take it off the map again. */
  onRemoveMine?: () => void;
  onBack: () => void;
}

/** Route preview (design screen 3). */
export default function RouteSheet(p: Props) {
  const sheet = useSheetHeight<HTMLElement>();
  const fastest = p.routes ? p.routes.reduce((best, r, i, all) => (r.duration < all[best].duration ? i : best), 0) : -1;

  return (
    <>
      <button type="button" className="round-btn floating-back" onClick={p.onBack} aria-label="Back">
        <BackIcon />
      </button>

      <section ref={sheet} className="sheet sheet-route" aria-labelledby="route-title">
        <div className="handle" />
        <div className="sheet-row-head">
          <div className="sheet-head">
            <span className="row-sub">From {p.originLabel} to</span>
            <h2 id="route-title" className="sheet-title big">
              {p.savedAs ?? p.destination.name}
            </h2>
          </div>
          <button
            type="button"
            className={`save-btn${p.savedAs ? ' is-saved' : ''}`}
            onClick={p.onSave}
            aria-label={p.savedAs ? `Saved as ${p.savedAs}. Change` : 'Save this place'}
          >
            <StarIcon size={22} filled={!!p.savedAs} />
          </button>
        </div>
        {p.onAddMissing && (
          <button type="button" className="text-btn inline-link" onClick={p.onAddMissing}>
            + Add this as a missing place
          </button>
        )}
        {p.onRemoveMine && (
          <button type="button" className="text-btn inline-link danger" onClick={p.onRemoveMine}>
            Remove this place
          </button>
        )}

        {p.stop ? (
          <div className="stop-row">
            <span className="stop-dot" aria-hidden="true" />
            <span className="row-text">
              <span className="row-sub">Stop on the way</span>
              <span className="row-title">{p.stop.name}</span>
            </span>
            <button type="button" className="icon-btn" onClick={p.onRemoveStop} aria-label={`Remove the stop at ${p.stop.name}`}>
              <CloseIcon size={20} />
            </button>
          </div>
        ) : (
          <button type="button" className="text-btn add-stop" onClick={p.onAddStop}>
            <PlusIcon size={18} />
            Add a stop
          </button>
        )}

        {!p.routes && !p.error && (
          <div className="route-cards" aria-busy="true">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {p.error && (
          <div className="error-box" role="alert">
            <span>{p.error}</span>
            <button type="button" className="text-btn" onClick={p.onRetry}>
              Try again
            </button>
          </div>
        )}

        {p.routes && (
          <div className="route-cards">
            {p.routes.map((r, i) => (
              <button
                type="button"
                key={i}
                className={`route-card${i === p.selected ? ' is-selected' : ''}`}
                aria-pressed={i === p.selected}
                onClick={() => p.onSelect(i)}
              >
                <span className="row-text">
                  <span className="route-time">
                    {formatDuration(r.duration * p.rush)}
                    {i === fastest && p.routes!.length > 1 && <span className="badge">Fastest</span>}
                  </span>
                  <span className="row-sub">
                    {formatDistance(r.distance)}
                    {r.via ? ` · via ${r.via}` : ''}
                  </span>
                </span>
                <span className="row-meta">
                  arrive {formatClock(new Date(Date.now() + r.duration * p.rush * 1000))}
                </span>
              </button>
            ))}
          </div>
        )}

        {p.routes && (
          <div className="route-extras">
            <span className="row-sub wrap">{p.rush > 1 ? 'Includes usual rush-hour traffic' : ' '}</span>
            <button type="button" className="text-btn" onClick={p.onShowSteps}>
              All turns ›
            </button>
          </div>
        )}

        {p.shareLive != null && (
          <div className="setting-row share-live">
            <UsersIcon size={20} className="muted" />
            <span className="row-text">
              <span id="share-live" className="row-title">
                Share live trip with family
              </span>
              <span className="row-sub wrap">They see your car move. Off when you arrive.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={p.shareLive}
              aria-labelledby="share-live"
              className={`switch${p.shareLive ? ' is-on' : ''}`}
              onClick={p.onToggleShareLive}
            >
              <span className="switch-knob" />
            </button>
          </div>
        )}

        <button type="button" className="primary-btn" disabled={!p.routes} onClick={p.onStart}>
          <NavArrowIcon />
          Start
        </button>
      </section>
    </>
  );
}
