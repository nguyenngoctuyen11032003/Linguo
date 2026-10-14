import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { stubMatchMedia } from './match-media';

// Routes are code-split: the first findBy* after navigation also waits for a dynamic import to be transformed.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => stubMatchMedia(() => false));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.reduceMotion;
});

// happy-dom's Web Animations `finished` promise rejects (unhandled) when an animation is cancelled on
// unmount, which real browsers mark as handled. Hiding `animate` makes motion fall back to its JS engine.
delete (Element.prototype as { animate?: unknown }).animate;

class NoopIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!('IntersectionObserver' in globalThis)) {
  Object.assign(globalThis, { IntersectionObserver: NoopIntersectionObserver });
}
