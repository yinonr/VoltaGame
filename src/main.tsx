import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/styles.css';
// Feature stylesheets, one per work stream so parallel edits never collide.
import './ui/styles/identity.css';
import './ui/styles/polish.css';
import './ui/styles/mechanics.css';
import './ui/styles/events.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
