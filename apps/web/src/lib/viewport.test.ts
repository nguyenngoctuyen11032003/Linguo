import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installKeyboardAwareness } from './viewport';

class StubViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  resize(height: number) {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
}

function field(tag: string, rect: { top: number; bottom: number }, attrs: Record<string, string> = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (tag === 'div') el.tabIndex = 0;
  document.body.append(el);
  el.focus();
  el.getBoundingClientRect = () =>
    ({ ...rect, left: 0, right: 0, width: 0, height: rect.bottom - rect.top, x: 0, y: rect.top }) as DOMRect;
  el.scrollIntoView = vi.fn();
  return el;
}

describe('installKeyboardAwareness', () => {
  let vv: StubViewport;
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;

  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const cb of pending) cb(0);
  };

  beforeEach(() => {
    vv = new StubViewport();
    frames = new Map();
    nextId = 1;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('scrolls a hidden focused input into view (nearest) after the viewport shrinks', () => {
    const input = field('input', { top: 600, bottom: 640 });
    const uninstall = installKeyboardAwareness(window);
    vv.resize(400);
    expect(input.scrollIntoView).not.toHaveBeenCalled(); // batched until the next frame
    flushFrames();
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    uninstall();
    vv.resize(300);
    flushFrames();
    expect(input.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('batches several resize events into one frame', () => {
    const input = field('input', { top: 600, bottom: 640 });
    installKeyboardAwareness(window);
    vv.resize(500);
    vv.resize(450);
    vv.resize(400);
    expect(frames.size).toBe(1);
    flushFrames();
    expect(input.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending frame on uninstall', () => {
    const input = field('input', { top: 600, bottom: 640 });
    const uninstall = installKeyboardAwareness(window);
    vv.resize(400);
    uninstall();
    expect(frames.size).toBe(0);
    expect(input.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the viewport grows', () => {
    const input = field('input', { top: 600, bottom: 640 });
    installKeyboardAwareness(window);
    vv.resize(900);
    flushFrames();
    expect(input.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the field is already inside the visual viewport', () => {
    const input = field('input', { top: 100, bottom: 140 });
    installKeyboardAwareness(window);
    vv.resize(400);
    flushFrames();
    expect(input.scrollIntoView).not.toHaveBeenCalled();
  });

  it('accounts for offsetTop', () => {
    const input = field('textarea', { top: 150, bottom: 190 });
    installKeyboardAwareness(window);
    vv.offsetTop = 200;
    vv.resize(400);
    flushFrames();
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('ignores checkboxes', () => {
    const box = field('input', { top: 600, bottom: 640 }, { type: 'checkbox' });
    installKeyboardAwareness(window);
    vv.resize(400);
    flushFrames();
    expect(box.scrollIntoView).not.toHaveBeenCalled();
  });

  it('handles contenteditable elements', () => {
    const div = field('div', { top: 600, bottom: 640 });
    Object.defineProperty(div, 'isContentEditable', { value: true });
    installKeyboardAwareness(window);
    vv.resize(400);
    flushFrames();
    expect(div.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('is a no-op without visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    expect(() => installKeyboardAwareness(window)()).not.toThrow();
  });
});
