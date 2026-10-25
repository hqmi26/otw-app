import { useEffect, useRef } from 'react';
import type { Route } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import { instruction, type Lang } from '../lib/instructions';
import { ManeuverIcon } from './brand';

interface Props {
  route: Route;
  lang: Lang;
  /** Index of the next turn while navigating; turns before it are greyed out. */
  currentStep: number | null;
  leaving: boolean;
  onClose: () => void;
}

/** Every turn on the route, in order, with the distance until the next one. */
export default function StepsSheet({ route, lang, currentStep, leaving, onClose }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const current = useRef<HTMLLIElement>(null);
  const ms = lang === 'ms';

  // Open with the upcoming turn in view. Scroll only the list: scrollIntoView
  // would also shift the whole screen while the sheet is still sliding up.
  useEffect(() => {
    const box = list.current;
    const row = current.current;
    if (!box || !row) return;
    const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += offset - (box.clientHeight - row.offsetHeight) / 2;
  }, []);

  return (
    <div className={`modal${leaving ? ' is-leaving' : ''}`}>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <section className="sheet sheet-modal steps-sheet" role="dialog" aria-labelledby="steps-title">
        <div className="handle" />
        <div className="sheet-row-head">
          <div className="sheet-head">
            <h2 id="steps-title" className="sheet-title big">
              {ms ? 'Semua belokan' : 'All turns'}
            </h2>
            <span className="row-sub">
              {formatDistance(route.distance)} · {formatDuration(route.duration)} · {route.steps.length}{' '}
              {ms ? 'langkah' : 'steps'}
            </span>
          </div>
          <button type="button" className="text-btn" onClick={onClose}>
            {ms ? 'Tutup' : 'Close'}
          </button>
        </div>

        <ol ref={list} className="steps-list">
          {route.steps.map((step, i) => {
            const state = currentStep == null ? '' : i < currentStep ? ' is-done' : i === currentStep ? ' is-next' : '';
            return (
              <li key={i} ref={i === currentStep ? current : undefined} className={`step-row${state}`}>
                <span className="step-icon">
                  <ManeuverIcon type={step.type} modifier={step.modifier} size={24} />
                </span>
                <span className="row-text">
                  <span className="step-text">{instruction(step, lang)}</span>
                  {step.type !== 'arrive' && step.distance > 0 && (
                    <span className="row-sub">
                      {ms ? 'kemudian' : 'then'} {formatDistance(step.distance)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
