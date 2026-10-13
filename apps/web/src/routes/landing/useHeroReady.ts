import { useEffect, useState, type RefObject } from 'react';

/** Longest the headline entrance may wait for web fonts. */
export const HERO_FONT_TIMEOUT_MS = 1000;

/**
 * Gate for the hero's text entrance animations: they start once web fonts are ready (so text does not
 * reflow mid-animation) or after `timeoutMs`, whichever comes first. The background video is NOT part of
 * this gate — a slow or blocked video must never delay the headline; it fades in on its own.
 */
export function useHeroReady(timeoutMs = HERO_FONT_TIMEOUT_MS): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(finish, finish);
    const timer = window.setTimeout(finish, timeoutMs);
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [timeoutMs]);

  return ready;
}

/**
 * True once the video has frames to show (`playing` / `canplay`); false again if it errors. Independent of
 * `useHeroReady`: the video fades in whenever it is ready, however late.
 */
export function useVideoVisible(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    if (video.readyState >= 3) show();
    video.addEventListener('playing', show);
    video.addEventListener('canplay', show);
    video.addEventListener('error', hide);
    // Autoplay can be refused (battery saver, policy); the backdrop simply stays.
    video.play?.()?.catch(() => {});
    return () => {
      video.removeEventListener('playing', show);
      video.removeEventListener('canplay', show);
      video.removeEventListener('error', hide);
    };
  }, [videoRef, enabled]);

  return enabled && visible;
}
