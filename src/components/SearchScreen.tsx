import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, type Place } from '../lib/api';
import { distance, formatDistance, type LngLat } from '../lib/geo';
import type { MyPlace, SavedPlace } from '../lib/models';
import { findPlaces } from '../lib/search';
import { SavedIcon } from './brand';
import { BackIcon, ClockIcon, PinIcon, PlusIcon, SearchIcon } from './icons';

/** What the picked place is for: a trip, saving it (the "Add" chip), or a stop on the way. */
export type SearchPurpose = 'go' | 'save' | 'stop';

const PROMPTS: Record<SearchPurpose, string> = {
  go: 'Search places or addresses',
  save: 'Search the place to save',
  stop: 'Search a stop on the way',
};

interface Props {
  position: LngLat | null;
  recents: Place[];
  saved: SavedPlace[];
  /** Places the user added themselves; searched first. */
  myPlaces: MyPlace[];
  purpose: SearchPurpose;
  leaving: 'pop' | 'fade' | null;
  onPick: (place: Place) => void;
  /** "Can't find it?" – put a missing place on the map. */
  onAddMissing: () => void;
  onBack: () => void;
}

type Status = 'idle' | 'loading' | 'done' | 'error';
type Category = (typeof CATEGORIES)[number];

/** Search (design screen 2). */
export default function SearchScreen({
  position,
  recents,
  saved,
  myPlaces,
  purpose,
  leaving,
  onPick,
  onAddMissing,
  onBack,
}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const near = useRef(position);
  near.current = position;
  const mine = useRef(myPlaces);
  mine.current = myPlaces;
  const input = useRef<HTMLInputElement>(null);

  // Let the slide-in finish before the keyboard opens; doing both at once
  // makes the phone resize the page mid-animation and the screen stutters.
  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 320);
    return () => window.clearTimeout(t);
  }, []);

  // Phone back gesture: close the keyboard as the page starts leaving.
  useEffect(() => {
    if (leaving) input.current?.blur();
  }, [leaving]);

  // Drop the keyboard first so it closes while the page slides away.
  const back = () => {
    input.current?.blur();
    onBack();
  };

  useEffect(() => {
    const q = category ? category.query : query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    setStatus('loading');
    const timer = window.setTimeout(
      () => {
        findPlaces({ query: q, category, near: near.current, mine: mine.current, signal: ctrl.signal })
          .then((list) => {
            setResults(list);
            setStatus('done');
          })
          .catch((e: unknown) => {
            if ((e as Error).name !== 'AbortError') setStatus('error');
          });
      },
      // Sabah is searched on the phone, so a short pause is enough.
      category ? 0 : 200,
    );
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // myPlaces: search again after the user adds or removes one of their own places.
  }, [query, category, myPlaces]);

  const searching = category != null || query.trim().length >= 2;
  const distanceTo = (place: Place) =>
    position ? <span className="row-meta">{formatDistance(distance(position, place.coord))}</span> : null;

  return (
    <div className={`screen screen-push search-screen${leaving ? ` leave-${leaving}` : ''}`}>
      <div className="search-head">
        <button type="button" className="icon-btn" onClick={back} aria-label="Back to map">
          <BackIcon />
        </button>
        <label className="search-field">
          <SearchIcon size={18} className="muted" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            placeholder={PROMPTS[purpose]}
            aria-label={PROMPTS[purpose]}
            value={query}
            onChange={(e) => {
              setCategory(null);
              setQuery(e.target.value);
            }}
          />
        </label>
      </div>

      <div className="chip-row search-chips">
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.label}
            className={`filter-chip${category === c ? ' is-on' : ''}`}
            aria-pressed={category === c}
            onClick={() => {
              setQuery('');
              setCategory(category === c ? null : c);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="search-body">
        {searching ? (
          <>
            <h2 className="section-label">{category ? `${category.label} near you` : 'Results'}</h2>
            {status === 'loading' && results.length === 0 && <p className="hint">Searching…</p>}
            {status === 'error' && (
              <p className="hint">Search isn’t working right now. Check your internet and try again.</p>
            )}
            {status === 'done' && results.length === 0 && (
              <p className="hint">Nothing found. Try a shorter name or add the town.</p>
            )}
            <div className="list" aria-live="polite">
              {results.map((place) => (
                <button type="button" key={place.id} className="row" onClick={() => onPick(place)}>
                  <span className="row-icon tinted">
                    <PinIcon size={20} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">{place.name}</span>
                    {place.subtitle && <span className="row-sub">{place.subtitle}</span>}
                  </span>
                  {distanceTo(place)}
                </button>
              ))}
              {status === 'done' && purpose === 'go' && (
                <button type="button" className="row" onClick={onAddMissing}>
                  <span className="row-icon">
                    <PlusIcon size={20} />
                  </span>
                  <span className="row-text">
                    <span className="row-title accent">Can’t find it? Add a missing place</span>
                    <span className="row-sub">Put it on the map yourself – it shows up straight away</span>
                  </span>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {purpose !== 'save' && saved.length > 0 && (
              <>
                <h2 className="section-label">Saved places</h2>
                <div className="list">
                  {saved.map((s) => (
                    <button type="button" key={s.label} className="row" onClick={() => onPick(s.place)}>
                      <span className="row-icon tinted">
                        <SavedIcon kind={s.kind} size={20} />
                      </span>
                      <span className="row-text">
                        <span className="row-title">{s.label}</span>
                        <span className="row-sub">{s.place.name}</span>
                      </span>
                      {distanceTo(s.place)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <h2 className="section-label">Recent</h2>
            {recents.length === 0 ? (
              <p className="hint">Type a place, like “Mid Valley” or “Hospital Queen Elizabeth”.</p>
            ) : (
              <div className="list">
                {recents.map((place) => (
                  <button type="button" key={place.id} className="row" onClick={() => onPick(place)}>
                    <span className="row-icon">
                      <ClockIcon size={20} />
                    </span>
                    <span className="row-text">
                      <span className="row-title">{place.name}</span>
                      {place.subtitle && <span className="row-sub">{place.subtitle}</span>}
                    </span>
                    {distanceTo(place)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
