import { useEffect, useState } from 'react';
import {
  inviteLink,
  inviteMessage,
  MAX_FAMILY,
  memberColor,
  memberLine,
  type FamilyMember,
} from '../lib/family';
import type { Family } from '../hooks/useFamily';
import { initials, type Profile } from '../lib/models';
import { BackIcon, ChatIcon, CheckIcon, CopyIcon, LockIcon, RefreshIcon, UsersIcon } from './icons';

interface Props {
  profile: Profile;
  family: Family;
  /** The area this phone is in right now, if worked out yet. */
  myArea: string | null;
  leaving: 'pop' | 'fade' | null;
  /** Show someone's area or car on the map. */
  onShowMember: (member: FamilyMember) => void;
  onToast: (text: string) => void;
  onBack: () => void;
}

/** Family (design screens 5 and 5c): who's where by area, your Private switch, and the invite link. */
export default function FamilyScreen(p: Props) {
  const { family } = p;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fresh news as soon as the page opens.
  const { refresh } = family;
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (done) p.onToast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const state = family.state;
  const me = family.me;
  const others = state ? state.members.filter((m) => m.id !== state.me) : [];
  const count = state?.members.length ?? 0;
  const invite = state?.invite ?? null;
  const expired = invite != null && invite.expiresAt * 1000 < Date.now();
  const full = count >= MAX_FAMILY;

  const copyLink = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(inviteLink(invite.code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Couldn’t copy. Press and hold the link to copy it.');
    }
  };

  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to map">
          <BackIcon />
        </button>
        <span className="row-text">
          <h1 className="page-title">Family</h1>
          {state && (
            <span className="row-sub">
              {count} of {MAX_FAMILY} members
            </span>
          )}
        </span>
      </div>

      <div className="page-body">
        {!family.inFamily && (
          <div className="card stack invite-card">
            <span className="row-icon tinted big">
              <UsersIcon size={24} />
            </span>
            <h2 className="card-title">Start your family</h2>
            <p className="card-text">
              See each other’s area, like Likas or Inanam, and ETA when someone’s driving. Never the exact spot.
            </p>
            <p className="card-text">Up to {MAX_FAMILY} people. They join from a link in WhatsApp, with no password.</p>
            <button
              type="button"
              className="primary-btn"
              disabled={busy}
              onClick={() => run(() => family.start(p.profile.name), 'Family started! Now invite them')}
            >
              {busy ? 'Starting…' : 'Start a family'}
            </button>
            <p className="field-hint">Got an invite link from family? Just open it on this phone.</p>
          </div>
        )}

        {family.inFamily && !state && (
          <div className="card stack">
            {family.loadError ? (
              <>
                <p className="card-text">{family.loadError}</p>
                <button type="button" className="text-btn" onClick={() => void refresh()}>
                  Try again
                </button>
              </>
            ) : (
              <p className="location-state">
                <span className="spinner" aria-hidden="true" />
                Loading your family…
              </p>
            )}
          </div>
        )}

        {state && me && (
          <>
            {others.length > 0 && (
              <div className="card list">
                {others.map((m) => {
                  const onMap = !m.private && (m.live || m.area);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      className="row"
                      disabled={!onMap}
                      onClick={() => p.onShowMember(m)}
                    >
                      {m.private ? (
                        <span className="avatar is-private">
                          <LockIcon size={18} />
                        </span>
                      ) : (
                        <span className="avatar" style={{ background: memberColor(state, m.id) }}>
                          {initials(m.name)}
                        </span>
                      )}
                      <span className="row-text">
                        <span className="row-title family-name">
                          {m.name}
                          {m.live && <span className="badge live-badge">LIVE TRIP</span>}
                        </span>
                        <span className="row-sub">{memberLine(m)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="card setting-row">
              <span className="avatar" style={me.private ? { background: 'var(--muted)' } : undefined}>
                {me.private ? <LockIcon size={18} /> : initials(me.name)}
              </span>
              <span className="row-text">
                <span className="row-title">{me.name} (you)</span>
                <span className="row-sub wrap">
                  {me.private ? 'Hidden from family' : p.myArea ? `Family see: ${p.myArea}` : 'Finding your area…'}
                </span>
              </span>
              <span id="family-private" className="switch-label">
                Private
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={me.private}
                aria-labelledby="family-private"
                className={`switch${me.private ? ' is-on' : ''}`}
                disabled={busy}
                onClick={() =>
                  run(
                    () => family.update({ private: !me.private }),
                    me.private ? 'Family can see your area again' : 'You’re private now',
                  )
                }
              >
                <span className="switch-knob" />
              </button>
            </div>

            <p className="privacy-note">
              <LockIcon size={18} />
              {me.private
                ? 'You are private. Family can’t see your area or ETA. Hazard reports still reach them, with no name.'
                : 'Family only see the area, never the exact spot. Your car shows only when you share a live trip.'}
            </p>

            <h2 className="section-label">Invite family</h2>
            <div className="card stack">
              {full ? (
                <p className="card-text">Your family is full: {MAX_FAMILY} people is the most for now.</p>
              ) : !invite || expired ? (
                <>
                  <p className="card-text">The invite link has expired. Make a new one to invite more family.</p>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={busy}
                    onClick={() => run(family.newLink, 'New invite link made')}
                  >
                    <RefreshIcon size={20} />
                    Make a new link
                  </button>
                </>
              ) : (
                <>
                  <p className="card-text">
                    Send this link to your family WhatsApp group. Whoever opens it joins with just their name.
                  </p>
                  <span className="invite-link">{inviteLink(invite.code).replace(/^https?:\/\//, '')}</span>
                  <a
                    className="primary-btn"
                    href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(invite.code))}`}
                    target="_blank"
                    rel="noopener"
                  >
                    <ChatIcon size={20} />
                    Send on WhatsApp
                  </a>
                  <button type="button" className="secondary-btn" onClick={copyLink}>
                    {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
                    {copied ? 'Link copied' : 'Copy link'}
                  </button>
                  <span className="field-hint">
                    Works until {new Date(invite.expiresAt * 1000).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}{' '}
                    · {MAX_FAMILY - count} {MAX_FAMILY - count === 1 ? 'place' : 'places'} left
                  </span>
                  <button
                    type="button"
                    className="text-btn with-icon"
                    disabled={busy}
                    onClick={() => run(family.newLink, 'New link made. The old link no longer works')}
                  >
                    <RefreshIcon size={18} />
                    Make a new link
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              className="logout-btn"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Leave this family? They won’t see you any more, and you’ll need a new invite to come back.')) {
                  void run(family.leave, 'You left the family');
                }
              }}
            >
              Leave family
            </button>
          </>
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
