import { useState, type FormEvent, type ReactNode } from 'react';
import { MAX_NORMAL_GROUPS, MAX_PEOPLE, type Group, type GroupType } from '../lib/groups';
import type { Groups } from '../hooks/useGroups';
import { BackIcon, HomeIcon, UsersIcon } from './icons';

interface Props {
  groups: Groups;
  /** The name already on this phone; empty for a guest who skipped it. */
  name: string;
  leaving: 'pop' | 'fade' | null;
  /** Started: show the new group, and keep the name typed here. */
  onDone: (group: Group, name: string) => void;
  onBack: () => void;
}

/** Choose what kind of group to start: a family group, or a normal one. */
export default function NewGroupScreen(p: Props) {
  const { groups } = p;
  const list = groups.state?.groups ?? [];
  const hasFamily = groups.family != null;
  const normalFull = list.filter((g) => g.type === 'normal').length >= MAX_NORMAL_GROUPS;

  const [type, setType] = useState<GroupType>(hasFamily ? 'normal' : 'family');
  const [groupName, setGroupName] = useState('');
  const [name, setName] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanName = name.trim();
  const cleanGroup = groupName.trim();
  const valid = cleanName.length >= 2 && (type === 'family' || cleanGroup.length >= 2);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const before = new Set(list.map((g) => g.id));
      const next = await groups.start({ type, name: cleanName, groupName: cleanGroup });
      const made = next.groups.find((g) => !before.has(g.id));
      if (made) p.onDone(made, cleanName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t start the group. Try again.');
      setBusy(false);
    }
  };

  const choice = (value: GroupType, title: string, text: string, blocked: string | null, icon: ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={type === value}
      className={`group-choice${type === value ? ' is-on' : ''}`}
      disabled={blocked != null}
      onClick={() => setType(value)}
    >
      <span className="row-icon tinted">{icon}</span>
      <span className="row-text">
        <span className="row-title">{title}</span>
        <span className="row-sub wrap">{blocked ?? text}</span>
      </span>
    </button>
  );

  return (
    <form
      className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}
      onSubmit={(e) => void submit(e)}
    >
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to groups">
          <BackIcon />
        </button>
        <h1 className="page-title">Start a group</h1>
      </div>

      <div className="page-body">
        <div className="stack group-choices" role="radiogroup" aria-label="Kind of group">
          {choice(
            'family',
            'Family group',
            'They see your area, like Likas, and your ETA when you drive. Never your exact spot.',
            hasFamily ? 'You’re already in a family group.' : null,
            <HomeIcon size={20} />,
          )}
          {choice(
            'normal',
            'Normal group',
            'For friends, colleagues or a convoy. They see nothing until you share a trip with them.',
            normalFull ? `You’re in ${MAX_NORMAL_GROUPS} normal groups, the most for now.` : null,
            <UsersIcon size={20} />,
          )}
        </div>

        {type === 'normal' && (
          <div className="card stack">
            <label className="field-label" htmlFor="group-name">
              Group name
            </label>
            <input
              id="group-name"
              className="input"
              type="text"
              maxLength={30}
              placeholder="e.g. Geng Futsal"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
        )}

        {!p.name && (
          <div className="card stack">
            <label className="field-label" htmlFor="group-your-name">
              Your name
            </label>
            <input
              id="group-your-name"
              className="input"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              placeholder="e.g. Along"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="field-hint">The name your groups see.</span>
          </div>
        )}

        <p className="field-hint">Up to {MAX_PEOPLE} people. You can invite them next.</p>

        {error && (
          <p className="privacy-note is-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-btn" disabled={!valid || busy}>
          {busy ? 'Starting…' : type === 'family' ? 'Start family group' : 'Start normal group'}
        </button>
      </div>
    </form>
  );
}
