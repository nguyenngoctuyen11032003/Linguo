import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { stubMatchMedia } from './match-media';

beforeEach(() => stubMatchMedia(() => false));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.reduceMotion;
});

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
