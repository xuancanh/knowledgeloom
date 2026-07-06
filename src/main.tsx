import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './index.css';
import { ee } from './lib/ee';

// Extensions builds add src/extensions/ (merged from the private repo); its register
// module populates the extensions registry before React renders. In OSS builds the
// glob matches nothing and this is a no-op.
const eeModules = import.meta.glob<{ register?: (api: typeof ee) => void }>('./extensions/register.{ts,tsx}', { eager: true });
Object.values(eeModules).forEach((mod) => mod.register?.(ee));

// PWA: offline shell + cached static assets (production builds only — the SW
// would fight Vite's dev-server module graph otherwise).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
