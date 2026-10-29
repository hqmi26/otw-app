import { useState } from 'react';
import { APP_VERSION, initials, type Profile } from '../lib/models';
import type { Lang } from '../lib/instructions';
import type { Theme } from '../hooks/useTheme';
import { BackIcon, ChatIcon, MoonIcon, SoundIcon } from './icons';

interface Props {
  profile: Profile;
  theme: Theme;
  lang: Lang;
  leaving: 'pop' | 'fade' | null;
  onSaveName: (name: string) => void;
  onToggleTheme: () => void;
  onLang: (lang: Lang) => void;
  onTestVoice: (lang: Lang) => void;
  onFeedback: () => void;
  onLogout: () => void;
  onBack: () => void;
}

function maskPhone(digits: string) {
  // Family who joined from an invite link only gave a name.
  return digits ? `+60 ••• •••• ${digits.slice(-4)}` : 'Joined with a family invite';
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

        <h2 className="section-label">Voice directions</h2>
        <div className="card stack">
          <div className="setting-row">
            <span className="row-icon tinted">
              <SoundIcon size={20} />
            </span>
            <span className="row-text">
              <span id="acc-lang" className="row-title">
                Language
              </span>
              <span className="row-sub wrap">Turn instructions on screen and spoken</span>
            </span>
          </div>
          <div className="segmented" role="radiogroup" aria-labelledby="acc-lang">
            {(
              [
                ['en', 'English'],
                ['ms', 'Bahasa Melayu'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={p.lang === value}
                className={`segment${p.lang === value ? ' is-on' : ''}`}
                onClick={() => {
                  p.onLang(value);
                  p.onTestVoice(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="text-btn" onClick={() => p.onTestVoice(p.lang)}>
            {p.lang === 'ms' ? 'Dengar contoh' : 'Play a sample'} ›
          </button>
        </div>

        <h2 className="section-label">Help make OTW better</h2>
        <div className="card list">
          <button type="button" className="row" onClick={p.onFeedback}>
            <span className="row-icon tinted">
              <ChatIcon size={20} />
            </span>
            <span className="row-text">
              <span className="row-title">Send feedback</span>
              <span className="row-sub">Ideas, bugs, anything</span>
            </span>
          </button>
        </div>

        <h2 className="section-label">About</h2>
        <div className="card">
          <div className="info-row">
            <span>Version</span>
            <span className="muted">{APP_VERSION}</span>
          </div>
        </div>

        <button type="button" className="logout-btn" onClick={p.onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
