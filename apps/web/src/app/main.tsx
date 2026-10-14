import './zod-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';
import { captureInstallPrompt, registerServiceWorker } from '@/features/pwa';
import { installKeyboardAwareness } from '@/lib/viewport';
import { App } from './App';

installKeyboardAwareness();
// Spec 10 §4. Production builds only (a no-op in dev and Vitest); registered before render so a notification click
// relayed to a freshly opened window is buffered. Playwright blocks service workers except in pwa.spec.ts.
void registerServiceWorker();
// Keeps `beforeinstallprompt` for Settings → "Cài ứng dụng" (no automatic install banner).
captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
