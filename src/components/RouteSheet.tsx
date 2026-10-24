import type { Place, Route } from '../lib/api';
import { formatClock, formatDistance, formatDuration } from '../lib/geo';
import { useSheetHeight } from '../hooks/useSheetHeight';
import { BackIcon, NavArrowIcon, StarIcon } from './icons';

interface Props {
  destination: Place;
  originLabel: string;
  /** Label the place is saved under, e.g. "Rumah Atuk". */
  savedAs: string | null;
  routes: Route[] | null;
  error: string | null;
  selected: number;
  onSelect: (index: number) => void;
  onStart: () => void;
  onRetry: () => void;
  onSave: () => void;
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
                    {formatDuration(r.duration)}
                    {i === fastest && p.routes!.length > 1 && <span className="badge">Fastest</span>}
                  </span>
                  <span className="row-sub">
                    {formatDistance(r.distance)}
                    {r.via ? ` · via ${r.via}` : ''}
                  </span>
                </span>
                <span className="row-meta">arrive {formatClock(new Date(Date.now() + r.duration * 1000))}</span>
              </button>
            ))}
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
