import { initials, type Profile } from '../lib/models';
import { BackIcon, LockIcon, UsersIcon } from './icons';

interface Props {
  profile: Profile;
  hasLocation: boolean;
  leaving: 'pop' | 'fade' | null;
  onShareApp: () => void;
  onBack: () => void;
}

/** Family (design screen 5). Live family sharing arrives with accounts. */
export default function FamilyScreen(p: Props) {
  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to map">
          <BackIcon />
        </button>
        <h1 className="page-title">Family</h1>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="row static">
            <span className="avatar">{initials(p.profile.name)}</span>
            <span className="row-text">
              <span className="row-title">{p.profile.name}</span>
              <span className="row-sub">That’s you · {p.hasLocation ? 'location on' : 'location off'}</span>
            </span>
          </div>
        </div>

        <div className="card stack invite-card">
          <span className="row-icon tinted big">
            <UsersIcon size={24} />
          </span>
          <h2 className="card-title">Family sharing is coming next</h2>
          <p className="card-text">
            Soon you’ll invite Mak, Ayah and the rest with a code, then see each other’s live location and ETA right
            here.
          </p>
          <p className="card-text">For now, send them the app so everyone’s ready.</p>
          <button type="button" className="primary-btn" onClick={p.onShareApp}>
            Share OTW with family
          </button>
        </div>

        <p className="privacy-note">
          <LockIcon size={18} />
          Only your family group will be able to see your location.
        </p>
      </div>
    </div>
  );
}
