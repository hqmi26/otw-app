import { useRef, useState } from 'react';
import { showGoogleButton } from '../lib/googleSignIn';

interface Props {
  clientId: string;
  dark: boolean;
  /** Ties Google's answer to this phone. */
  getNonce: () => Promise<string>;
  /** Google's signed answer. Throws with a message to show if OTW's server says no. */
  onCredential: (credential: string) => Promise<void>;
}

/**
 * "Sign in with Google". The first tap fetches Google's own button and shows
 * it in place; before that, nothing here talks to Google.
 */
export default function GoogleSignIn(p: Props) {
  const [stage, setStage] = useState<'idle' | 'loading' | 'ready' | 'working'>('idle');
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const onCredential = useRef(p.onCredential);
  onCredential.current = p.onCredential;

  const finish = async (credential: string) => {
    setStage('working');
    setError(null);
    try {
      await onCredential.current(credential);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in didn’t work. Try again.');
    } finally {
      setStage('ready');
    }
  };

  const start = async () => {
    if (!slot.current || !wrap.current) return;
    setStage('loading');
    setError(null);
    try {
      await showGoogleButton(slot.current, {
        clientId: p.clientId,
        nonce: await p.getNonce(),
        dark: p.dark,
        width: wrap.current.clientWidth,
        onCredential: (credential) => void finish(credential),
      });
      setStage('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t reach Google. Try again.');
      setStage('idle');
    }
  };

  return (
    <div className="google-sign-in" ref={wrap}>
      {(stage === 'idle' || stage === 'loading') && (
        <button type="button" className="secondary-btn" disabled={stage === 'loading'} onClick={() => void start()}>
          {stage === 'loading' ? 'Opening Google…' : 'Sign in with Google'}
        </button>
      )}
      <div ref={slot} className="google-slot" hidden={stage === 'idle' || stage === 'loading'} />
      {stage === 'working' && (
        <p className="location-state">
          <span className="spinner" aria-hidden="true" />
          Signing you in…
        </p>
      )}
      {error && (
        <p className="privacy-note is-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
