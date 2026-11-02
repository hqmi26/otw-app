import { useState, type FormEvent } from 'react';
import type { Profile } from '../lib/models';
import { OtwWordmark } from './brand';

/** First-time welcome (design screen 0b). No sign-up: the name can wait until you join a group. */
export default function LoginScreen({ onDone }: { onDone: (profile: Profile) => void }) {
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

      <p className="login-note">You’ll drive as a guest. No phone number and no password.</p>
    </form>
  );
}
