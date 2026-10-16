import { useCallback, useEffect, useRef, useState } from 'react';

export interface HideOnScrollOptions {
  /** While true the bar stays visible (e.g. the "Thêm" sheet is open). */
  disabled?: boolean;
  /** Changing this (e.g. the pathname) shows the bar again. */
  resetKey?: unknown;
  /** Scroll distance (px) in one direction before the bar reacts, so small jitters do nothing. */
  threshold?: number;
  /** Within this distance (px) of the top of the page the bar is always shown. */
  topOffset?: number;
}

/** A text field has focus: the on-screen keyboard is likely up, keep the bar where the user left it. */
function isTyping(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image'].includes(el.type);
  }
  return false;
}

function atBottom(y: number): boolean {
  const { scrollHeight } = document.documentElement;
  const viewport = window.innerHeight;
  // A page shorter than the viewport has no "bottom" to reach (and jsdom-like envs report 0).
  if (scrollHeight <= viewport) return false;
  return y + viewport >= scrollHeight - 2;
}

/**
 * Hide-on-scroll-down / show-on-scroll-up for a fixed bar. The page scrolls on the window (the app shell has no
 * inner scroll container), so this listens there with one passive listener, coalesced to one read per frame.
 * Always visible near the top, at the very bottom, after `resetKey` changes and while `disabled`.
 * Returns `[hidden, reveal]`; call `reveal()` when the bar receives focus.
 */
export function useHideOnScroll({
  disabled = false,
  resetKey,
  threshold = 10,
  topOffset = 64,
}: HideOnScrollOptions = {}): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  const anchor = useRef(0);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const reveal = useCallback(() => {
    anchor.current = window.scrollY;
    setHidden(false);
  }, []);

  // Show again on route change and whenever hiding is switched off.
  useEffect(() => {
    reveal();
  }, [resetKey, disabled, reveal]);

  useEffect(() => {
    let pending = false;
    let frame = 0;
    const update = () => {
      pending = false;
      const y = Math.max(0, window.scrollY);
      if (disabledRef.current || y <= topOffset || atBottom(y)) {
        anchor.current = y;
        setHidden(false);
        return;
      }
      const delta = y - anchor.current;
      if (Math.abs(delta) < threshold) return;
      anchor.current = y;
      if (delta > 0 && isTyping()) return;
      setHidden(delta > 0);
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(update);
      else update();
    };
    anchor.current = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (pending && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, [threshold, topOffset]);

  return [hidden, reveal];
}
