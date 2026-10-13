import { afterEach, describe, expect, it, vi } from 'vitest';
import { installKeyboardAwareness } from './viewport';

describe('installKeyboardAwareness', () => {
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });

  it('scrolls the focused input into view when the visual viewport resizes', () => {
    const vv = new EventTarget();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const spy = vi.fn();
    input.scrollIntoView = spy;

    const uninstall = installKeyboardAwareness(window);
    vv.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledWith({ block: 'center' });

    uninstall();
    vv.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('is a no-op without visualViewport', () => {
    expect(() => installKeyboardAwareness(window)()).not.toThrow();
  });
});
