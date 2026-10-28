import { useState } from 'react';
import { FEEDBACK_KINDS, sendFeedback, type FeedbackKind } from '../lib/feedback';
import { AlertIcon, CheckIcon, LockIcon } from './icons';

interface Props {
  name: string;
  leaving: boolean;
  onClose: () => void;
}

/** Ideas and bug reports, sent straight to the OTW team from inside the app. */
export default function FeedbackSheet({ name, leaving, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const clean = message.trim();
  const current = FEEDBACK_KINDS.find((k) => k.kind === kind)!;

  const send = () => {
    setStatus('sending');
    sendFeedback(kind, clean, name)
      .then(() => setStatus('sent'))
      .catch(() => setStatus('failed'));
  };

  return (
    <div className={`modal${leaving ? ' is-leaving' : ''}`}>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close feedback" />
      <section className="sheet sheet-modal" role="dialog" aria-labelledby="feedback-title">
        <div className="handle" />

        {status === 'sent' ? (
          <>
            <div className="sheet-head">
              <span className="row-icon tinted big">
                <CheckIcon size={24} />
              </span>
              <h2 id="feedback-title" className="sheet-title big">
                Thanks, {name}!
              </h2>
              <span className="row-sub wrap">Got it. Every message gets read, and it helps decide what OTW does next.</span>
            </div>
            <button type="button" className="primary-btn" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <div className="sheet-head">
              <h2 id="feedback-title" className="sheet-title big">
                Help make OTW better
              </h2>
              <span className="row-sub wrap">OTW is brand new. Your ideas and bug reports shape what gets built next.</span>
            </div>

            <div className="segmented three" role="radiogroup" aria-label="Type of feedback">
              {FEEDBACK_KINDS.map((k) => (
                <button
                  type="button"
                  key={k.kind}
                  role="radio"
                  aria-checked={kind === k.kind}
                  className={`segment${kind === k.kind ? ' is-on' : ''}`}
                  onClick={() => setKind(k.kind)}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <div>
              <label className="field-label" htmlFor="feedback-message">
                {current.question}
              </label>
              <textarea
                id="feedback-message"
                className="input"
                rows={5}
                maxLength={1000}
                placeholder={current.placeholder}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {status === 'failed' ? (
              <p className="privacy-note is-error" role="alert">
                <AlertIcon size={18} />
                Couldn’t send. Check your internet and try again.
              </p>
            ) : (
              <p className="privacy-note">
                <LockIcon size={18} />
                Sent with your username and phone model. Your location isn’t included.
              </p>
            )}

            <button type="button" className="primary-btn" disabled={!clean || status === 'sending'} onClick={send}>
              {status === 'sending' ? 'Sending…' : 'Send feedback'}
            </button>
            <button type="button" className="text-btn center" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </section>
    </div>
  );
}
