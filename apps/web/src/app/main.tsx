import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p className="glass m-6 rounded-3xl p-6 font-display text-5xl uppercase text-primary">Linguo</p>
  </StrictMode>,
);
