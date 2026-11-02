import { useEffect, useState } from 'react';
import {
  inviteLink,
  inviteMessage,
  MAX_PEOPLE,
  memberColor,
  memberLine,
  type Group,
  type GroupMember,
} from '../lib/groups';
import type { Groups } from '../hooks/useGroups';
import { initials } from '../lib/models';
import { BackIcon, ChatIcon, CheckIcon, CopyIcon, LockIcon, RefreshIcon } from './icons';

interface Props {
  group: Group;
  groups: Groups;
  /** The area this phone is in right now, if worked out yet. */
  myArea: string | null;
  leaving: 'pop' | 'fade' | null;
  /** Show someone's area or car on the map. */
  onShowMember: (member: GroupMember) => void;
  onToast: (text: string) => void;
  onBack: () => void;
}

/** One group (design screens 5 and 5c): who's where, and the invite link. */
export default function GroupScreen(p: Props) {
  const { group, groups } = p;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fresh news as soon as the page opens.
  const { refresh } = groups;
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

  const state = groups.state;
  const isFamily = group.type === 'family';
  const isPrivate = state?.private ?? false;
  const me = group.members.find((m) => m.id === state?.me);
  const others = group.members.filter((m) => m.id !== state?.me);
  const isOwner = group.ownerId === state?.me;
  const count = group.members.length;
  const invite = group.invite;
  const expired = invite != null && invite.expiresAt * 1000 < Date.now();
  const full = count >= MAX_PEOPLE;

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

  const remove = (m: GroupMember) => {
    const from = isFamily ? 'the family' : group.name;
    if (window.confirm(`Remove ${m.name} from ${from}? They’ll need a new invite to come back.`)) {
      void run(() => groups.remove(group.id, m.id), `${m.name} removed. The old invite link no longer works`);
    }
  };

  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to groups">
          <BackIcon />
        </button>
        <span className="row-text">
          <h1 className="page-title">{group.name}</h1>
          <span className="row-sub">
            {isFamily ? 'Family group' : 'Normal group'} · {count} of {MAX_PEOPLE} people
          </span>
        </span>
      </div>

      <div className="page-body">
        {others.length > 0 && state && (
          <div className="card list">
            {others.map((m) => {
              const onMap = !m.private && (m.live || m.area);
              return (
                <div key={m.id} className="member-row">
                  <button type="button" className="row" disabled={!onMap} onClick={() => p.onShowMember(m)}>
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
                      <span className="row-sub">{memberLine(m, group.type)}</span>
                    </span>
                  </button>
                  {isOwner && (
                    <button type="button" className="text-btn danger" disabled={busy} onClick={() => remove(m)}>
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {me && (
          <div className="card setting-row">
            <span className="avatar" style={isPrivate ? { background: 'var(--muted)' } : undefined}>
              {isPrivate ? <LockIcon size={18} /> : initials(me.name)}
            </span>
            <span className="row-text">
              <span className="row-title">{me.name} (you)</span>
              <span className="row-sub wrap">
                {isPrivate
                  ? 'Hidden from every group'
                  : !isFamily
                    ? 'Hidden until you share a trip'
                    : p.myArea
                      ? `Family see: ${p.myArea}`
                      : 'Finding your area…'}
              </span>
            </span>
          </div>
        )}

        <p className="privacy-note">
          <LockIcon size={18} />
          {isPrivate
            ? 'You are private, so this group can’t see you. Turn it off in Groups.'
            : isFamily
              ? 'Family only see the area, never the exact spot. Your car shows only when you share a live trip.'
              : 'This group sees nothing until you share a trip with it, before you press Start.'}
        </p>

        <h2 className="section-label">{isFamily ? 'Invite family' : 'Invite people'}</h2>
        <div className="card stack">
          {full ? (
            <p className="card-text">This group is full: {MAX_PEOPLE} people is the most for now.</p>
          ) : !invite || expired ? (
            <>
              <p className="card-text">The invite link has expired. Make a new one to invite more people.</p>
              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={() => run(() => groups.newLink(group.id), 'New invite link made')}
              >
                <RefreshIcon size={20} />
                Make a new link
              </button>
            </>
          ) : (
            <>
              <p className="card-text">
                {isFamily ? 'Send this link to your family WhatsApp group.' : 'Send this link on WhatsApp.'} Whoever opens
                it joins with just their name.
              </p>
              <span className="invite-link">{inviteLink(invite.code).replace(/^https?:\/\//, '')}</span>
              <a
                className="primary-btn"
                href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(group, invite.code))}`}
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
                · {MAX_PEOPLE - count} {MAX_PEOPLE - count === 1 ? 'place' : 'places'} left
              </span>
              <button
                type="button"
                className="text-btn with-icon"
                disabled={busy}
                onClick={() => run(() => groups.newLink(group.id), 'New link made. The old link no longer works')}
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
            const leaveText = isFamily
              ? 'Leave this family? They won’t see you any more, and you’ll need a new invite to come back.'
              : `Leave ${group.name}? You’ll need a new invite to come back.`;
            if (window.confirm(leaveText)) void run(() => groups.leave(group.id), `You left ${group.name}`);
          }}
        >
          {isFamily ? 'Leave family' : 'Leave group'}
        </button>

        {error && (
          <p className="privacy-note is-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
