import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

if (typeof window !== 'undefined' && window.repairDesk?.platform) {
  document.documentElement.dataset['platform'] = window.repairDesk.platform;
}

try {
  const savedTheme = localStorage.getItem('katia_theme');
  if (
    savedTheme &&
    ['abyssal', 'amber', 'nordic'].includes(savedTheme) &&
    document.documentElement
  ) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (savedTheme === 'abyssal') {
      void window.repairDesk?.setTitleBarOverlay?.({
        color: '#0f172a',
        symbolColor: '#f1f5f9',
      });
    }
  }
} catch {
  // Ignore storage access errors in restricted environments
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
