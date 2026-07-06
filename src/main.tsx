import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './index.css';
import { ee } from './lib/ee';

// Enterprise builds add src/ee/ (merged from the private repo); its register
// module populates the EE registry before React renders. In OSS builds the
// glob matches nothing and this is a no-op.
const eeModules = import.meta.glob<{ registerEe?: (api: typeof ee) => void }>('./ee/register.{ts,tsx}', { eager: true });
Object.values(eeModules).forEach((mod) => mod.registerEe?.(ee));

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
