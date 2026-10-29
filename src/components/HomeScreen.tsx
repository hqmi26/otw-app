import type { Place } from '../lib/api';
import { memberColor, memberLine, type FamilyMember } from '../lib/family';
import { distance, formatDistance, type LngLat } from '../lib/geo';
import { initials, type Profile, type SavedPlace } from '../lib/models';
import type { Family } from '../hooks/useFamily';
import BottomSheet from './BottomSheet';
import { SavedIcon } from './brand';
import { AlertIcon, ChatIcon, ClockIcon, LocateIcon, LockIcon, PlusIcon, SearchIcon } from './icons';

/** Family rows that show with the sheet half open; the rest are below. */
const PEEK_ROWS = 3;

interface Props {
  profile: Profile;
  family: Family;
  /** The area this phone is in, e.g. Likas. */
  myArea: string | null;
  position: LngLat | null;
  /** A line about location to show under the saved places, e.g. GPS lost, or demo mode. */
  locationNote: string | null;
  saved: SavedPlace[];
  recents: Place[];
  onSearch: () => void;
  onAccount: () => void;
  onPick: (place: Place) => void;
  onAddSaved: () => void;
  onRecenter: () => void;
  onReport: () => void;
  onFamily: () => void;
  /** Show someone's area or car on the map. */
  onShowMember: (member: FamilyMember) => void;
  onFeedback: () => void;
}

/** Home map (design screen 1). */
export default function HomeScreen(p: Props) {
  const recents = p.recents.filter((r) => !p.saved.some((s) => s.place.id === r.id)).slice(0, 5);
  const state = p.family.state;
  const me = p.family.me;
  const others = state ? state.members.filter((m) => m.id !== state.me) : [];

  const youRow = (
    <button type="button" className="row" onClick={p.onFamily}>
      <span className="avatar" style={me?.private ? { background: 'var(--muted)' } : undefined}>
        {me?.private ? <LockIcon size={16} /> : initials(p.profile.name)}
      </span>
      <span className="row-text">
        <span className="row-title">{p.profile.name} (you)</span>
        <span className="row-sub">
          {me?.private
            ? 'Private · hidden from family'
            : me && p.myArea
              ? `Family see: ${p.myArea}`
              : p.position
                ? 'Location on'
                : 'Location is off'}
        </span>
      </span>
    </button>
  );

  const memberRow = (m: FamilyMember) => (
    <button
      type="button"
      key={m.id}
      className="row"
      onClick={() => (!m.private && (m.live || m.area) ? p.onShowMember(m) : p.onFamily())}
    >
      {m.private ? (
        <span className="avatar is-private">
          <LockIcon size={16} />
        </span>
      ) : (
        <span className="avatar" style={{ background: state ? memberColor(state, m.id) : undefined }}>
          {initials(m.name)}
        </span>
      )}
      <span className="row-text">
        <span className="row-title family-name">
          {m.name}
          {m.live && <span className="badge live-badge">LIVE</span>}
        </span>
        <span className="row-sub">{memberLine(m)}</span>
      </span>
    </button>
  );

  const inviteRow = (
    <button type="button" className="row" onClick={p.onFamily}>
      <span className="avatar is-invite">
        <PlusIcon size={20} />
      </span>
      <span className="row-text">
        <span className="row-title">Invite your family</span>
        <span className="row-sub">See their area and ETA, never the exact spot</span>
      </span>
    </button>
  );

  return (
    <>
      <div className="top-bar">
        <div className="search-pill">
          <button type="button" className="search-pill-main" onClick={p.onSearch}>
            <SearchIcon size={20} className="muted" />
            <span>Where to?</span>
          </button>
          <button type="button" className="avatar-btn" onClick={p.onAccount} aria-label="Account and settings">
            {initials(p.profile.name)}
          </button>
        </div>

        <div className="chip-row">
          {p.saved.map((s) => (
            <button type="button" key={s.label} className="place-chip" onClick={() => p.onPick(s.place)}>
              <SavedIcon kind={s.kind} size={16} />
              {s.label}
            </button>
          ))}
          <button type="button" className="place-chip is-add" onClick={p.onAddSaved}>
            <PlusIcon size={16} />
            {p.saved.length ? 'Add' : 'Save Rumah & more'}
          </button>
        </div>

        {p.locationNote && (
          <p className="banner" role="status">
            {p.locationNote}
          </p>
        )}
      </div>

      <div className="fab-stack">
        <button type="button" className="round-btn" onClick={p.onRecenter} aria-label="Centre map on my location">
          <LocateIcon />
        </button>
        <button type="button" className="report-btn" onClick={p.onReport}>
          <AlertIcon size={20} />
          Report
        </button>
      </div>

      <BottomSheet
        label="family panel"
        header={
          <div className="sheet-row-head">
            <h2 className="sheet-title">Family</h2>
            <button type="button" className="text-btn" onClick={p.onFamily}>
              See all
            </button>
          </div>
        }
      >
        <div className="list compact" data-peek>
          {others.slice(0, PEEK_ROWS - 1).map(memberRow)}
          {youRow}
          {others.length === 0 && inviteRow}
        </div>
        {others.length > PEEK_ROWS - 1 && (
          <div className="list compact">{others.slice(PEEK_ROWS - 1).map(memberRow)}</div>
        )}

        {recents.length > 0 && (
          <>
            <h2 className="section-label">Recent</h2>
            <div className="list compact">
              {recents.map((place) => (
                <button type="button" key={place.id} className="row" onClick={() => p.onPick(place)}>
                  <span className="row-icon">
                    <ClockIcon size={20} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">{place.name}</span>
                    {place.subtitle && <span className="row-sub">{place.subtitle}</span>}
                  </span>
                  {p.position && (
                    <span className="row-meta">{formatDistance(distance(p.position, place.coord))}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <h2 className="section-label">OTW is new</h2>
        <div className="list compact">
          <button type="button" className="row" onClick={p.onFeedback}>
            <span className="row-icon tinted">
              <ChatIcon size={20} />
            </span>
            <span className="row-text">
              <span className="row-title">Send feedback</span>
              <span className="row-sub">Tell us what to fix or add next</span>
            </span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
