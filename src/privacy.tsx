import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import PrivacyContent from './components/PrivacyContent';
import { OtwWordmark } from './components/brand';

// The public Privacy & data page (/privacy), the same words as in the app.
// Light or dark like the phone, as the app is before anyone picks.
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="page doc-page">
      <header className="page-head">
        <a href="/" aria-label="Open OTW">
          <OtwWordmark />
        </a>
      </header>
      <div className="page-body">
        <h1 className="page-title">Privacy &amp; data</h1>
        <p className="card-text">
          Updated 13 November 2026 · <a href="/">Open OTW</a>
        </p>
        <PrivacyContent />
      </div>
    </main>
  </StrictMode>,
);
