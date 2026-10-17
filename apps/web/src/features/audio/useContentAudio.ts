import { useCallback, useEffect, useRef, useState } from 'react';
import { audioLoadReason, contentAudioSrc, loadAudioObjectUrl, NORMAL_AUDIO_RATE, shouldDownload, type AudioLoadReason, type ContentAudioRate } from './content-audio';

export type ContentAudioState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface ContentAudio {
  /** False when the id resolves to no URL at all (the caller shows the machine-speech fallback right away). */
  playable: boolean;
  state: ContentAudioState;
  /** Why the last download failed (`offline_uncached` = no network and the clip was never downloaded); null otherwise. */
  errorReason: AudioLoadReason | null;
  rate: ContentAudioRate;
  /** Playback has begun at least once (the replay button is useful from then on). */
  started: boolean;
  /** Play, pause or resume; after an error it retries with a fresh download. */
  toggle: () => void;
  /** Back to the start and play. */
  replay: () => void;
  setRate: (rate: ContentAudioRate) => void;
}

/** Only one recording plays at a time across the page. */
let current: HTMLAudioElement | null = null;

/**
 * Plays one recorded clip. Nothing is downloaded until the first play (preload none); the clip is fetched once and
 * kept as an object URL for replays. Pauses and frees everything on unmount. Key the caller by asset id.
 */
export function useContentAudio(assetId: string | null | undefined): ContentAudio {
  const src = contentAudioSrc(assetId);
  const [state, setState] = useState<ContentAudioState>('idle');
  const [rate, setRateState] = useState<ContentAudioRate>(NORMAL_AUDIO_RATE);
  const [started, setStarted] = useState(false);
  const [errorReason, setErrorReason] = useState<AudioLoadReason | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rateRef = useRef<ContentAudioRate>(NORMAL_AUDIO_RATE);
  const token = useRef(0);

  const release = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // a DOM without media support
      }
      if (current === audio) current = null;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(
    () => () => {
      token.current += 1;
      release();
    },
    [release],
  );

  const element = useCallback((url: string, id: number): HTMLAudioElement => {
    const audio = document.createElement('audio');
    audio.preload = 'none';
    audio.src = url;
    audio.playbackRate = audio.defaultPlaybackRate = rateRef.current;
    const live = () => token.current === id && audioRef.current === audio;
    // Listeners check `live()`: a released element (unmount, retry) can no longer change the state.
    audio.addEventListener('playing', () => live() && setState('playing'));
    audio.addEventListener('pause', () => live() && !audio.ended && setState('paused'));
    audio.addEventListener('ended', () => live() && setState('ended'));
    audio.addEventListener('error', () => live() && setState('error'));
    audioRef.current = audio;
    return audio;
  }, []);

  const playFromHere = useCallback((audio: HTMLAudioElement, id: number) => {
    if (current && current !== audio) {
      try {
        current.pause();
      } catch {
        // ignore
      }
    }
    current = audio;
    setStarted(true);
    audio.playbackRate = rateRef.current;
    try {
      const played = audio.play() as Promise<void> | undefined;
      if (played && typeof played.then === 'function') {
        played.then(
          () => token.current === id && setState('playing'),
          () => token.current === id && setState('error'),
        );
      } else setState('playing');
    } catch {
      setState('error');
    }
  }, []);

  const start = useCallback(
    (fromStart: boolean) => {
      if (!src || !assetId) return;
      const existing = audioRef.current;
      if (existing) {
        if (fromStart) existing.currentTime = 0;
        playFromHere(existing, token.current);
        return;
      }
      const id = ++token.current;
      if (!shouldDownload(assetId)) {
        playFromHere(element(src, id), id);
        return;
      }
      setState('loading');
      const controller = new AbortController();
      abortRef.current = controller;
      loadAudioObjectUrl(src, controller.signal).then(
        (url) => {
          if (token.current !== id) {
            URL.revokeObjectURL(url);
            return;
          }
          abortRef.current = null;
          objectUrlRef.current = url;
          playFromHere(element(url, id), id);
        },
        (error) => {
          if (token.current !== id) return;
          setErrorReason(audioLoadReason(error));
          setState('error');
        },
      );
    },
    [assetId, src, element, playFromHere],
  );

  const toggle = useCallback(() => {
    if (state === 'loading') return;
    if (state === 'playing') {
      audioRef.current?.pause();
      return;
    }
    if (state === 'error') {
      // Retry from scratch: a new element and a new download.
      token.current += 1;
      release();
      setState('idle');
      setErrorReason(null);
      start(true);
      return;
    }
    start(state === 'ended');
  }, [state, start, release]);

  const replay = useCallback(() => {
    if (state === 'loading' || state === 'error') return;
    start(true);
  }, [state, start]);

  const setRate = useCallback((next: ContentAudioRate) => {
    rateRef.current = next;
    setRateState(next);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = audio.defaultPlaybackRate = next;
  }, []);

  return { playable: src !== null, state, errorReason: state === 'error' ? errorReason : null, rate, started, toggle, replay, setRate };
}
