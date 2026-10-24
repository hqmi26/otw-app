import { useState, type FormEvent } from 'react';
import type { Profile } from '../lib/models';
import { OtwWordmark } from './brand';

/** First-time setup (design screen 0b). Accounts stay on this phone until family sharing is built. */
export default function LoginScreen({ onDone }: { onDone: (profile: Profile) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const digits = phone.replace(/\D/g, '').replace(/^0/, '');
  const valid = name.trim().length >= 2 && digits.length >= 9 && digits.length <= 10;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onDone({ name: name.trim(), phone: digits });
  };

  return (
    <form className="screen login" onSubmit={submit}>
      <OtwWordmark />
      <h1 className="login-title">Jom, log in</h1>
      <p className="login-lead">Log in untuk share lokasi dan ETA dengan family anda.</p>

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
      <span className="field-hint">This is the name your family sees.</span>

      <label className="field-label" htmlFor="login-phone">
        No. telefon
      </label>
      <span className="phone-field">
        <span className="phone-prefix">+60</span>
        <input
          id="login-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="12 345 6789"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </span>

      <button type="submit" className="primary-btn login-btn" disabled={!valid}>
        Teruskan
      </button>

      <p className="login-note">
        For now your account is saved on this phone only. OTP verification comes with family sharing.
      </p>
    </form>
  );
}
