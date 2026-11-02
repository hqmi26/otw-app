import { useState } from 'react';
import { useSheetHeight } from '../hooks/useSheetHeight';
import { MY_PLACE_KINDS } from '../lib/models';
import type { PlaceGroup } from '../lib/places';
import { BackIcon } from './icons';

interface Props {
  onSave: (name: string, group: PlaceGroup) => void;
  onBack: () => void;
}

/** "Add a missing place": move the map until the pin sits on it, name it, save. */
export default function AddPlaceSheet({ onSave, onBack }: Props) {
  const sheet = useSheetHeight<HTMLElement>();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<PlaceGroup>('');
  const trimmed = name.trim();

  return (
    <>
      <button type="button" className="round-btn floating-back" onClick={onBack} aria-label="Back">
        <BackIcon />
      </button>
      <div className="pick-hint">Move the map so the pin is on the place</div>

      <section ref={sheet} className="sheet" aria-labelledby="add-title">
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="add-title" className="sheet-title big">
            Add a missing place
          </h2>
          <span className="row-sub">Saved on this phone. Search finds it straight away.</span>
        </div>

        <label className="field-label" htmlFor="add-name">
          Name
        </label>
        <input
          id="add-name"
          className="input"
          type="text"
          maxLength={60}
          enterKeyHint="done"
          placeholder="e.g. Surau Taman Indah Permai"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="chip-wrap">
          {MY_PLACE_KINDS.map((k) => (
            <button
              type="button"
              key={k.label}
              className={`filter-chip${group === k.group ? ' is-on' : ''}`}
              aria-pressed={group === k.group}
              onClick={() => setGroup(k.group)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <button type="button" className="primary-btn" disabled={trimmed.length < 2} onClick={() => onSave(trimmed, group)}>
          Add place
        </button>
        <p className="field-hint">For your own home, use ⭐ Save instead – it becomes a one-tap chip.</p>
      </section>
    </>
  );
}
