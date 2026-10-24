import { useState } from 'react';
import type { Place } from '../lib/api';
import { SAVED_PRESETS, type SavedKind, type SavedPlace } from '../lib/models';
import { SavedIcon } from './brand';
import { StarIcon } from './icons';

interface Props {
  place: Place;
  saved: SavedPlace[];
  leaving: boolean;
  onSave: (label: string, kind: SavedKind) => void;
  onRemove: (label: string) => void;
  onClose: () => void;
}

/** Name a place so it becomes a one-tap chip on the map, e.g. "Rumah Atuk". */
export default function SavePlaceSheet({ place, saved, leaving, onSave, onRemove, onClose }: Props) {
  const current = saved.find((s) => s.place.id === place.id);
  const [choice, setChoice] = useState<string>(current?.label ?? SAVED_PRESETS[0].label);
  const [custom, setCustom] = useState(
    current && !SAVED_PRESETS.some((p) => p.label === current.label) ? current.label : '',
  );
  const isCustom = !SAVED_PRESETS.some((p) => p.label === choice);
  const label = isCustom ? custom.trim() : choice;
  const kind: SavedKind = SAVED_PRESETS.find((p) => p.label === choice)?.kind ?? 'other';
  const replacing = saved.find((s) => s.label === label && s.place.id !== place.id);

  return (
    <div className={`modal${leaving ? ' is-leaving' : ''}`}>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <section className="sheet sheet-modal" role="dialog" aria-labelledby="save-title">
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="save-title" className="sheet-title big">
            Save place
          </h2>
          <span className="row-sub">{place.name}</span>
        </div>

        <div className="chip-wrap">
          {SAVED_PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`filter-chip with-icon${choice === p.label ? ' is-on' : ''}`}
              aria-pressed={choice === p.label}
              onClick={() => setChoice(p.label)}
            >
              <SavedIcon kind={p.kind} size={16} />
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip with-icon${isCustom ? ' is-on' : ''}`}
            aria-pressed={isCustom}
            onClick={() => setChoice('')}
          >
            <StarIcon size={16} />
            Other
          </button>
        </div>

        {isCustom && (
          <>
            <label className="field-label" htmlFor="save-name">
              Name
            </label>
            <input
              id="save-name"
              className="input"
              type="text"
              autoFocus
              maxLength={20}
              placeholder="e.g. Rumah Mak Long, Gym"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </>
        )}

        {replacing && <p className="field-hint">This replaces your current “{label}” ({replacing.place.name}).</p>}

        <button type="button" className="primary-btn" disabled={label.length < 2} onClick={() => onSave(label, kind)}>
          Save as {label || '…'}
        </button>
        {current && (
          <button type="button" className="text-btn center danger" onClick={() => onRemove(current.label)}>
            Remove “{current.label}”
          </button>
        )}
      </section>
    </div>
  );
}
