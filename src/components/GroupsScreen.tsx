import { useEffect, useState } from 'react';
import { MAX_NORMAL_GROUPS, MAX_PEOPLE, type Group } from '../lib/groups';
import type { Groups } from '../hooks/useGroups';
import { BackIcon, HomeIcon, LockIcon, PlusIcon, UsersIcon } from './icons';

interface Props {
  groups: Groups;
  leaving: 'pop' | 'fade' | null;
  onOpen: (group: Group) => void;
  onNew: () => void;
  onToast: (text: string) => void;
  onBack: () => void;
}

/** Your groups, the Private switch that covers all of them, and the way to start a new one. */
export default function GroupsScreen(p: Props) {
  const { groups } = p;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh news as soon as the page opens.
  const { refresh } = groups;
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = groups.state;
  const list = state?.groups ?? [];
  const normal = list.filter((g) => g.type === 'normal').length;
  const canStart = !groups.family || normal < MAX_NORMAL_GROUPS;

  const togglePrivate = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      await groups.update({ private: !state.private });
      p.onToast(state.private ? 'Your groups can see you again' : 'You’re private now');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to map">
          <BackIcon />
        </button>
        <h1 className="page-title">Groups</h1>
      </div>

      <div className="page-body">
        {!state && (
          <div className="card stack">
            {groups.loadError ? (
              <>
                <p className="card-text">{groups.loadError}</p>
                <button type="button" className="text-btn" onClick={() => void refresh()}>
                  Try again
                </button>
              </>
            ) : (
              <p className="location-state">
                <span className="spinner" aria-hidden="true" />
                Loading your groups…
              </p>
            )}
          </div>
        )}

        {state && list.length === 0 && (
          <div className="card stack invite-card">
            <span className="row-icon tinted big">
              <UsersIcon size={24} />
            </span>
            <h2 className="card-title">Start a group</h2>
            <p className="card-text">
              Keep your family together, or share a trip with friends and colleagues. Never your exact spot, unless you
              share a live trip.
            </p>
            <p className="card-text">Up to {MAX_PEOPLE} people. They join from a link in WhatsApp, with no password.</p>
            <button type="button" className="primary-btn" onClick={p.onNew}>
              Start a group
            </button>
            <p className="field-hint">Got an invite link? Just open it on this phone.</p>
          </div>
        )}

        {list.length > 0 && (
          <div className="card list">
            {list.map((g) => (
              <button type="button" key={g.id} className="row" onClick={() => p.onOpen(g)}>
                <span className="row-icon tinted">
                  {g.type === 'family' ? <HomeIcon size={20} /> : <UsersIcon size={20} />}
                </span>
                <span className="row-text">
                  <span className="row-title">{g.name}</span>
                  <span className="row-sub">
                    {g.type === 'family' ? 'Family group' : 'Normal group'} · {g.members.length} of {MAX_PEOPLE} people
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {state && list.length > 0 && (
          <>
            <div className="card setting-row">
              <span className="row-icon tinted">
                <LockIcon size={20} />
              </span>
              <span className="row-text">
                <span id="groups-private" className="row-title">
                  Private
                </span>
                <span className="row-sub wrap">Hides you from every group at once</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={state.private}
                aria-labelledby="groups-private"
                className={`switch${state.private ? ' is-on' : ''}`}
                disabled={busy}
                onClick={() => void togglePrivate()}
              >
                <span className="switch-knob" />
              </button>
            </div>
            <p className="privacy-note">
              <LockIcon size={18} />
              {state.private
                ? 'You are private. No group can see your area or ETA. Road reports you send still show to drivers nearby, with no name.'
                : 'Family groups see your area and ETA. Normal groups see nothing until you share a trip.'}
            </p>
          </>
        )}

        {state && list.length > 0 && canStart && (
          <button type="button" className="secondary-btn" onClick={p.onNew}>
            <PlusIcon size={18} />
            Start a group
          </button>
        )}

        {error && (
          <p className="privacy-note is-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
