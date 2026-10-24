import { useState } from 'react';
import { initials, type Profile } from '../lib/models';
import type { Theme } from '../hooks/useTheme';
import { BackIcon, MoonIcon } from './icons';

interface Props {
  profile: Profile;
  theme: Theme;
  leaving: 'pop' | 'fade' | null;
  onSaveName: (name: string) => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onBack: () => void;
}

function maskPhone(digits: string) {
  return `+60 ••• •••• ${digits.slice(-4)}`;
}

/** Account (design screen 7). */
export default function AccountScreen(p: Props) {
  const [name, setName] = useState(p.profile.name);
  const clean = name.trim();
  const dark = p.theme === 'dark';

  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to map">
          <BackIcon />
        </button>
        <h1 className="page-title">Account</h1>
      </div>

      <div className="page-body">
        <div className="card profile-card">
          <span className="avatar big">{initials(p.profile.name)}</span>
          <span className="row-text">
            <span className="profile-name">{p.profile.name}</span>
            <span className="row-sub">{maskPhone(p.profile.phone)}</span>
          </span>
        </div>

        <h2 className="section-label">Username</h2>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length >= 2) p.onSaveName(clean);
          }}
        >
          <label className="field-label" htmlFor="acc-name">
            Name your family sees
          </label>
          <div className="inline-field">
            <input
              id="acc-name"
              className="input"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              placeholder="cth. Along"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="primary-btn small" disabled={clean.length < 2 || clean === p.profile.name}>
              Save
            </button>
          </div>
          <span className="field-hint">Shows on the map and in Family. Max 20 letters.</span>
        </form>

        <h2 className="section-label">Appearance</h2>
        <div className="card setting-row">
          <span className="row-icon tinted">
            <MoonIcon size={20} />
          </span>
          <span className="row-text">
            <span id="acc-dark" className="row-title">
              Dark mode
            </span>
            <span className="row-sub">Easier on the eyes at night</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-labelledby="acc-dark"
            className={`switch${dark ? ' is-on' : ''}`}
            onClick={p.onToggleTheme}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <h2 className="section-label">About</h2>
        <div className="card">
          <div className="info-row">
            <span>Bahasa</span>
            <span className="muted">BM + English</span>
          </div>
          <div className="info-row">
            <span>Version</span>
            <span className="muted">0.2 · family test</span>
          </div>
        </div>

        <button type="button" className="logout-btn" onClick={p.onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
