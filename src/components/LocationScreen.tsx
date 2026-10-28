import type { LocationProblem } from '../hooks/useGeolocation';
import { OtwWordmark } from './brand';
import { LocateIcon } from './icons';

const IS_IPHONE = /iPhone|iPad|iPod/.test(navigator.userAgent);

interface Props {
  /** null while the phone is still looking for its first fix. */
  problem: LocationProblem | null;
  onRetry: () => void;
}

/** Shown until the phone shares where it is: OTW can't plan or guide a trip without it. */
export default function LocationScreen({ problem, onRetry }: Props) {
  return (
    <div className="screen login location-gate">
      <OtwWordmark />
      <span className="location-badge">
        <LocateIcon size={34} />
      </span>
      <h1 className="login-title">Hidupkan lokasi</h1>
      <p className="login-lead">
        OTW perlukan lokasi anda untuk tunjuk jalan, kira ETA dan beri amaran bahaya di depan.
      </p>

      <div className="location-status" role="status">
        {problem === null && (
          <>
            <p className="location-state">
              <span className="spinner" aria-hidden="true" />
              Finding your location…
            </p>
            <p className="hint">Make sure Location (GPS) is on in your phone’s quick settings.</p>
          </>
        )}

        {problem === 'denied' && (
          <>
            <p className="location-state">Location is blocked for OTW.</p>
            {IS_IPHONE ? (
              <ol className="location-steps">
                <li>
                  Open <b>Settings</b> → <b>Privacy &amp; Security</b> → <b>Location Services</b> and turn it on.
                </li>
                <li>
                  In the same list, tap <b>Safari Websites</b> → <b>While Using the App</b>.
                </li>
                <li>
                  Come back here and tap <b>Try again</b>. If Safari asks, tap <b>Allow</b>.
                </li>
              </ol>
            ) : (
              <ol className="location-steps">
                <li>
                  Open <b>Chrome</b>, tap <b>⋮</b> → <b>Settings</b> → <b>Site settings</b> → <b>Location</b>.
                </li>
                <li>
                  Find <b>{window.location.host}</b> and set it to <b>Allow</b>.
                </li>
                <li>
                  Come back here and tap <b>Try again</b>.
                </li>
              </ol>
            )}
          </>
        )}

        {problem === 'unavailable' && (
          <>
            <p className="location-state">Can’t find your location right now.</p>
            <p className="hint">Turn on Location (GPS) in your phone’s quick settings, or move closer to a window.</p>
          </>
        )}

        {problem === 'unsupported' && (
          <>
            <p className="location-state">This browser can’t share your location.</p>
            <p className="hint">Open OTW in Chrome on Android or Safari on iPhone.</p>
          </>
        )}
      </div>

      {(problem === 'denied' || problem === 'unavailable') && (
        <button type="button" className="primary-btn login-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
