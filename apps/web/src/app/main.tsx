import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';
import { installKeyboardAwareness } from '@/lib/viewport';
import { App } from './App';

installKeyboardAwareness();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
