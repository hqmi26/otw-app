import { BackIcon } from './icons';
import PrivacyContent from './PrivacyContent';

interface Props {
  leaving: 'pop' | 'fade' | null;
  onBack: () => void;
}

/** Privacy & data: in plain words, what stays on the phone and what leaves it. */
export default function PrivacyScreen(p: Props) {
  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to Account">
          <BackIcon />
        </button>
        <h1 className="page-title">Privacy &amp; data</h1>
      </div>

      <div className="page-body">
        <PrivacyContent />
      </div>
    </div>
  );
}
