// Mount SPA — #root cao 100% (theme.css set html/body/#root height 100%).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
