import { describe, expect, it } from 'vitest';
import { breakOutOfFrame, isFramed } from './frame-guard';

function fakeWindow(opts: { top: object | 'self' | 'throws'; href?: string }): Window {
  const self: Record<string, unknown> = { location: { href: opts.href ?? 'https://linguo.test/quan-tri' } };
  Object.defineProperty(self, 'self', { get: () => self });
  Object.defineProperty(self, 'top', {
    get: () => {
      if (opts.top === 'throws') throw new DOMException('blocked', 'SecurityError');
      return opts.top === 'self' ? self : opts.top;
    },
  });
  return self as unknown as Window;
}

describe('isFramed', () => {
  it('is false for the top-level page and true inside a frame', () => {
    expect(isFramed(fakeWindow({ top: 'self' }))).toBe(false);
    expect(isFramed(fakeWindow({ top: { location: { href: 'https://evil.test/' } } }))).toBe(true);
  });

  it('treats an inaccessible top as framed', () => {
    expect(isFramed(fakeWindow({ top: 'throws' }))).toBe(true);
  });

  it('is false in the test window', () => {
    expect(isFramed()).toBe(false);
  });
});

describe('breakOutOfFrame', () => {
  it('navigates the top window to this page', () => {
    const top = { location: { href: 'https://evil.test/' } };
    breakOutOfFrame(fakeWindow({ top, href: 'https://linguo.test/quan-tri/bao-loi' }));
    expect(top.location.href).toBe('https://linguo.test/quan-tri/bao-loi');
  });

  it('does not throw when navigation is blocked', () => {
    expect(() => breakOutOfFrame(fakeWindow({ top: 'throws' }))).not.toThrow();
  });
});
