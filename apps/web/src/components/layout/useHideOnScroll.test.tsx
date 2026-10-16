import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHideOnScroll, type HideOnScrollOptions } from './useHideOnScroll';

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    window.dispatchEvent(new Event('scroll'));
  });
}

function setup(options?: HideOnScrollOptions) {
  return renderHook((props: HideOnScrollOptions | undefined) => useHideOnScroll(props), { initialProps: options });
}

describe('useHideOnScroll', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('hides on scroll down and shows on scroll up', () => {
    const { result } = setup();
    expect(result.current[0]).toBe(false);
    scrollTo(300);
    expect(result.current[0]).toBe(true);
    scrollTo(200);
    expect(result.current[0]).toBe(false);
  });

  it('ignores movements below the threshold', () => {
    const { result } = setup({ threshold: 10 });
    scrollTo(300);
    expect(result.current[0]).toBe(true);
    scrollTo(295);
    expect(result.current[0]).toBe(true);
    scrollTo(290);
    expect(result.current[0]).toBe(false);
  });

  it('stays visible near the top and at the bottom of the page', () => {
    const { result } = setup({ topOffset: 64 });
    scrollTo(50);
    expect(result.current[0]).toBe(false);
    scrollTo(1000);
    expect(result.current[0]).toBe(true);
    scrollTo(4200); // 4200 + 800 = scrollHeight
    expect(result.current[0]).toBe(false);
  });

  it('never hides while disabled and shows again when disabled turns on', () => {
    const { result, rerender } = setup();
    scrollTo(1000);
    expect(result.current[0]).toBe(true);
    rerender({ disabled: true });
    expect(result.current[0]).toBe(false);
    scrollTo(2000);
    expect(result.current[0]).toBe(false);
  });

  it('shows again when the reset key changes', () => {
    const { result, rerender } = setup({ resetKey: '/app' });
    scrollTo(1000);
    expect(result.current[0]).toBe(true);
    rerender({ resetKey: '/app/on-tap' });
    expect(result.current[0]).toBe(false);
  });

  it('does not hide while a text field has focus', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const { result } = setup();
    scrollTo(1000);
    expect(result.current[0]).toBe(false);
    input.blur();
    scrollTo(1500);
    expect(result.current[0]).toBe(true);
  });

  it('reveal() shows the bar', () => {
    const { result } = setup();
    scrollTo(1000);
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });
});
