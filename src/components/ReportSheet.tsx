import { useState } from 'react';
import { HAZARDS, type HazardType } from '../lib/models';
import { HazardIcon } from './brand';
import { LockIcon } from './icons';

interface Props {
  hasLocation: boolean;
  leaving: boolean;
  onSend: (type: HazardType, note: string) => void;
  onClose: () => void;
}

/** Report a hazard (design screen 6). Saved on this phone until family sharing exists. */
export default function ReportSheet({ hasLocation, leaving, onSend, onClose }: Props) {
  const [type, setType] = useState<HazardType>('flood');
  const [note, setNote] = useState('');
  const label = HAZARDS.find((h) => h.type === type)!.label.toLowerCase();

  return (
    <div className={`modal${leaving ? ' is-leaving' : ''}`}>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close report" />
      <section className="sheet sheet-modal" role="dialog" aria-labelledby="report-title">
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="report-title" className="sheet-title big">
            What’s on the road?
          </h2>
          <span className="row-sub wrap">It’s pinned where you are now.</span>
        </div>

        <div className="hazard-grid">
          {HAZARDS.map((h) => (
            <button
              type="button"
              key={h.type}
              className={`hazard-tile${type === h.type ? ' is-on' : ''}`}
              aria-pressed={type === h.type}
              onClick={() => setType(h.type)}
            >
              <HazardIcon type={h.type} />
              {h.label}
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="report-note">
          Add a note (optional)
        </label>
        <input
          id="report-note"
          className="input"
          type="text"
          maxLength={80}
          placeholder="e.g. left lane flooded, use right"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <p className="privacy-note">
          <LockIcon size={18} />
          Saved on this phone for now · {type === 'camera' ? 'kept for 30 days' : 'clears after 2 hours'}
        </p>

        <button type="button" className="report-send" disabled={!hasLocation} onClick={() => onSend(type, note.trim())}>
          {hasLocation ? `Send ${label} report` : 'Turn on location to report'}
        </button>
        <button type="button" className="text-btn center" onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}
