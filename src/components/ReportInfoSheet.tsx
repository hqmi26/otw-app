import { HAZARDS, type HazardReport } from '../lib/models';
import { HazardIcon } from './brand';

interface Props {
  report: HazardReport;
  /** This phone already sent or answered it. */
  answered: boolean;
  leaving: boolean;
  onAnswer: (still: boolean) => void;
  onClose: () => void;
}

function ago(ms: number): string {
  const min = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Tapped a report on the map: what it is, how old, and "Still there?" for everyone else's sake. */
export default function ReportInfoSheet({ report, answered, leaving, onAnswer, onClose }: Props) {
  const label = HAZARDS.find((h) => h.type === report.type)?.label ?? 'Report';
  const ups = report.ups ?? 0;
  const details = [
    `Reported ${ago(report.at)}`,
    ups > 0 && `${ups} ${ups === 1 ? 'driver says' : 'drivers say'} it’s still there`,
    !report.shared && 'only on this phone',
  ].filter(Boolean);

  return (
    <div className={`modal${leaving ? ' is-leaving' : ''}`}>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <section className="sheet sheet-modal" role="dialog" aria-labelledby="report-info-title">
        <div className="handle" />
        <div className="report-info-head">
          <span className="report-info-icon">
            <HazardIcon type={report.type} />
          </span>
          <div className="row-text">
            <h2 id="report-info-title" className="sheet-title big">
              {label}
            </h2>
            <span className="row-sub wrap">{details.join(' · ')}</span>
          </div>
        </div>
        {report.note && <p className="report-info-note">“{report.note}”</p>}

        {answered ? (
          <>
            <p className="hint">Thanks for letting other drivers know.</p>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="field-label">Is it still there?</p>
            <div className="nav-actions">
              <button type="button" className="report-send" onClick={() => onAnswer(true)}>
                Still there
              </button>
              <button type="button" className="secondary-btn tall" onClick={() => onAnswer(false)}>
                It’s gone
              </button>
            </div>
            <button type="button" className="text-btn center" onClick={onClose}>
              Not sure
            </button>
          </>
        )}
      </section>
    </div>
  );
}
