import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldTransition } from './view-transitions';

const doc = document as unknown as { startViewTransition?: unknown };

afterEach(() => {
  delete doc.startViewTransition;
  delete document.documentElement.dataset.reduceMotion;
  vi.unstubAllGlobals();
});

describe('shouldTransition', () => {
  it('is off without the View Transitions API', () => {
    expect(shouldTransition('/app/on-tap', undefined, '/app')).toBe(false);
  });

  it('cross-fades pushes to another pathname only', () => {
    doc.startViewTransition = () => undefined;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(shouldTransition('/app/on-tap', undefined, '/app')).toBe(true);
    expect(shouldTransition({ pathname: '/app/tien-do' }, undefined, '/app')).toBe(true);
    expect(shouldTransition('/app?tab=2', undefined, '/app')).toBe(false);
    expect(shouldTransition('?tab=2', undefined, '/app')).toBe(false);
    expect(shouldTransition('/app/on-tap', { replace: true }, '/app')).toBe(false);
  });

  it('respects reduced motion (in-app toggle and system setting)', () => {
    doc.startViewTransition = () => undefined;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    document.documentElement.dataset.reduceMotion = 'true';
    expect(shouldTransition('/app/on-tap', undefined, '/app')).toBe(false);
    delete document.documentElement.dataset.reduceMotion;
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    expect(shouldTransition('/app/on-tap', undefined, '/app')).toBe(false);
  });
});
