import { useEffect, useRef, useState, type FormEvent } from 'react';
import { accountApi, type InvitePreview } from '../lib/groups';
import type { Groups } from '../hooks/useGroups';
import { initials } from '../lib/models';
import { OtwWordmark } from './brand';
import { CarIcon, CheckIcon, LockIcon, PinIcon } from './icons';

interface Props {
  code: string;
  groups: Groups;
  /** The name already on this phone, if OTW was set up before. */
  name: string | null;
  /** Joined (or skipped): carry on into the app. */
  onDone: (name: string | null) => void;
}

/** Opened from an invite link (design screen 5d): type a name, join the group. No password. */
export default function JoinScreen(p: Props) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState(p.name ?? '');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const clean = name.trim();

  // Look the link up once; joining can change the token, but not the invite.
  const firstToken = useRef(p.groups.token);
  useEffect(() => {
    let live = true;
    accountApi
      .invite(p.code, firstToken.current)
      .then((r) => live && setPreview(r))
      .catch((e: Error) => live && setProblem(e.message));
    return () => {
      live = false;
    };
  }, [p.code]);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await p.groups.join(p.code, clean);
      setJoined(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Couldn’t join. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const isFamily = preview?.type !== 'normal';

  if (joined) {
    return (
      <div className="screen login join">
        <OtwWordmark />
        <span className="join-done" aria-hidden="true">
          <CheckIcon size={34} />
        </span>
        <h1 className="login-title">You’re in, {clean}!</h1>
        <p className="login-lead">
          {isFamily
            ? 'Next, OTW asks to use your location. Your family will only see your area.'
            : 'Next, OTW asks to use your location. This group sees nothing until you share a trip.'}
        </p>
        <button type="button" className="primary-btn" onClick={() => p.onDone(clean)}>
          Open the map
        </button>
      </div>
    );
  }

  const names = preview?.names ?? [];
  const who =
    names.length <= 3 ? names.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

  return (
    <form className="screen login join" onSubmit={join}>
      <OtwWordmark />

      {!preview && !problem && (
        <p className="location-state join-loading">
          <span className="spinner" aria-hidden="true" />
          Opening your invite…
        </p>
      )}

      {!preview && problem && (
        <>
          <h1 className="login-title">This invite link doesn’t work</h1>
          <p className="login-lead">{problem}. Ask for a new link from OTW → Groups.</p>
          <button type="button" className="primary-btn" onClick={() => p.onDone(null)}>
            Open OTW
          </button>
        </>
      )}

      {preview && preview.full && !preview.alreadyIn && (
        <>
          <h1 className="login-title">This group is full</h1>
          <p className="login-lead">It already has {names.length} people, the most OTW allows for now.</p>
          <button type="button" className="primary-btn" onClick={() => p.onDone(null)}>
            Open OTW
          </button>
        </>
      )}

      {preview && (!preview.full || preview.alreadyIn) && (
        <>
          {names.length > 0 && (
            <span className="join-faces" aria-hidden="true">
              {names.slice(0, 3).map((n, i) => (
                <span key={i} className="avatar">
                  {initials(n)}
                </span>
              ))}
              {names.length > 3 && <span className="avatar is-more">+{names.length - 3}</span>}
            </span>
          )}
          <h1 className="login-title">
            {isFamily ? 'You’re invited to the family on OTW' : `You’re invited to ${preview.groupName} on OTW`}
          </h1>
          <p className="login-lead">
            {preview.alreadyIn ? 'You’re already in this group.' : `${who} ${names.length === 1 ? 'is' : 'are'} already in.`}
          </p>

          <label className="field-label" htmlFor="join-name">
            Your name
          </label>
          <input
            id="join-name"
            className="input"
            type="text"
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Abang"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="field-hint">{isFamily ? 'Your family will see this name.' : 'This group will see this name.'}</span>

          <ul className="join-points">
            {isFamily ? (
              <li>
                <PinIcon size={20} />
                Family see your area, like Likas, never your exact spot.
              </li>
            ) : (
              <li>
                <PinIcon size={20} />
                This group sees nothing until you share a trip with it.
              </li>
            )}
            <li>
              <LockIcon size={20} />
              Turn on Private any time to hide.
            </li>
            <li>
              <CarIcon size={20} />
              Share a live trip only when you want to.
            </li>
          </ul>

          {preview.leavesFamily && (
            <p className="privacy-note" role="status">
              You can only be in one family group, so joining this one takes you out of the one you’re in.
            </p>
          )}

          {problem && (
            <p className="privacy-note is-error" role="alert">
              {problem}
            </p>
          )}

          <button type="submit" className="primary-btn login-btn" disabled={clean.length < 2 || busy}>
            {busy ? 'Joining…' : preview.alreadyIn ? 'Open the group' : isFamily ? 'Join family' : 'Join group'}
          </button>
          <p className="login-note">No password. No sign-up.</p>
        </>
      )}
    </form>
  );
}
