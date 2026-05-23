import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/**
 * Application entry point.
 *
 * Mounts the React tree under StrictMode (development warnings) and
 * BrowserRouter (client-side routing). The global CSS manifest is
 * imported here so Vite includes it in the bundle.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
