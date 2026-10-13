import { useEffect, useState, type RefObject } from 'react';

/**
 * Places/Unlock-Pro style gate: start entrance animations only once the hero video can play
 * (when there is one) and web fonts are ready — or after `timeoutMs`, whichever comes first.
 */
export function useHeroReady(videoRef: RefObject<HTMLVideoElement | null> | null, timeoutMs = 5000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    let videoOk = !videoRef;
    let fontsOk = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const check = () => {
      if (videoOk && fontsOk) finish();
    };
    const video = videoRef?.current ?? null;
    const onVideo = () => {
      videoOk = true;
      check();
    };
    if (video) {
      if (video.readyState >= 3) videoOk = true;
      video.addEventListener('canplay', onVideo);
      video.addEventListener('error', onVideo);
    }
    const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => {
      fontsOk = true;
      check();
    });
    const timer = window.setTimeout(finish, timeoutMs);
    return () => {
      done = true;
      window.clearTimeout(timer);
      video?.removeEventListener('canplay', onVideo);
      video?.removeEventListener('error', onVideo);
    };
  }, [videoRef, timeoutMs]);

  return ready;
}
