import { useState, type FormEvent } from 'react';
import type { Profile } from '../lib/models';
import { OtwWordmark } from './brand';
import GoogleSignIn from './GoogleSignIn';

interface Props {
  onDone: (profile: Profile) => void;
  /** Sign-in for someone who used OTW before. Null hides it (not set up, or no answer from the server). */
  google: {
    clientId: string;
    dark: boolean;
    getNonce: () => Promise<string>;
    onCredential: (credential: string) => Promise<void>;
  } | null;
}

/** First-time welcome (design screen 0b). No sign-up: the name can wait until you join a group. */
export default function LoginScreen({ onDone, google }: Props) {
  const [name, setName] = useState('');
  const clean = name.trim();
  const valid = clean.length >= 2;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onDone({ name: clean });
  };

  return (
    <form className="screen login" onSubmit={submit}>
      <OtwWordmark />
      <h1 className="login-title">Jom, mula</h1>
      <p className="login-lead">Tak perlu sign up. Letak nama anda, atau terus guna OTW.</p>

      <label className="field-label" htmlFor="login-name">
        Nama
      </label>
      <input
        id="login-name"
        className="input"
        type="text"
        maxLength={20}
        autoComplete="nickname"
        placeholder="cth. Along"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <span className="field-hint">The name your groups see. You can change it later.</span>

      <button type="submit" className="primary-btn login-btn" disabled={!valid}>
        Teruskan
      </button>
      <button type="button" className="text-btn center login-skip" onClick={() => onDone({ name: '' })}>
        Skip for now
      </button>

      {google && (
        <div className="login-google">
          <span className="field-label">Used OTW before?</span>
          <GoogleSignIn {...google} />
        </div>
      )}

      <p className="login-note">OTW is in public testing. You’ll drive as a guest: no phone number and no password.</p>
    </form>
  );
}
