import { useCallback, useEffect, useRef, useState } from 'react';

// Spec 6.9 + 16: audio is recorded with MediaRecorder and kept ONLY in memory (a Blob behind an object URL). It is
// never uploaded or persisted; leaving the screen (unmount) stops the recorder, releases the microphone and revokes
// the URL. Every failure ends in a state the screen can explain, never in a thrown error.

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error';
export type RecorderError = 'unsupported' | 'denied' | 'no_device' | 'failed';

/** A recording stops by itself after this long: practice clips are short and memory is the only store. */
export const RECORDING_MAX_MS = 60_000;

export interface RecorderApi {
  /** False when the browser lacks getUserMedia or MediaRecorder: the screen falls back to listen + self-practice. */
  supported: boolean;
  status: RecorderStatus;
  error: RecorderError | null;
  /** Object URL of the finished recording (in memory), or null. */
  audioUrl: string | null;
  /** Whole seconds recorded so far. */
  seconds: number;
  start: () => Promise<void>;
  stop: () => void;
  /** Forgets the recording (revokes its URL). */
  discard: () => void;
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    MediaRecorder !== null
  );
}

function classify(error: unknown): RecorderError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no_device';
  return 'failed';
}

function releaseStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useRecorder(): RecorderApi {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const alive = useRef(true);
  const busy = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const url = useRef<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tick.current !== null) clearInterval(tick.current);
    if (limit.current !== null) clearTimeout(limit.current);
    tick.current = null;
    limit.current = null;
  }, []);

  const revoke = useCallback(() => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);

  /** Stops everything that holds the microphone; safe to call repeatedly. */
  const teardown = useCallback(() => {
    clearTimers();
    const r = recorder.current;
    recorder.current = null;
    if (r) {
      r.ondataavailable = null;
      r.onstop = null;
      r.onerror = null;
      try {
        if (r.state !== 'inactive') r.stop();
      } catch {
        // Already stopped.
      }
    }
    releaseStream(stream.current);
    stream.current = null;
    busy.current = false;
  }, [clearTimers]);

  const stop = useCallback(() => {
    const r = recorder.current;
    if (!r || r.state === 'inactive') return;
    try {
      r.stop(); // onstop finalises the clip
    } catch {
      teardown();
      if (alive.current) {
        setError('failed');
        setStatus('error');
      }
    }
  }, [teardown]);

  const discard = useCallback(() => {
    revoke();
    setAudioUrl(null);
    setError(null);
    setSeconds(0);
    setStatus('idle');
  }, [revoke]);

  const start = useCallback(async () => {
    if (busy.current) return;
    if (!isRecordingSupported()) {
      setError('unsupported');
      setStatus('error');
      return;
    }
    busy.current = true;
    revoke();
    setAudioUrl(null);
    setError(null);
    setSeconds(0);
    setStatus('requesting');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      busy.current = false;
      if (alive.current) {
        setError(classify(e));
        setStatus('error');
      }
      return;
    }
    if (!alive.current) {
      releaseStream(media);
      busy.current = false;
      return;
    }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(media);
    } catch {
      releaseStream(media);
      busy.current = false;
      setError('failed');
      setStatus('error');
      return;
    }
    stream.current = media;
    recorder.current = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    rec.onerror = () => {
      teardown();
      if (alive.current) {
        setError('failed');
        setStatus('error');
      }
    };
    rec.onstop = () => {
      const type = rec.mimeType || 'audio/webm';
      teardown();
      if (!alive.current) return;
      if (chunks.length === 0) {
        setError('failed');
        setStatus('error');
        return;
      }
      url.current = URL.createObjectURL(new Blob(chunks, { type }));
      setAudioUrl(url.current);
      setStatus('recorded');
    };
    try {
      rec.start();
    } catch {
      teardown();
      setError('failed');
      setStatus('error');
      return;
    }
    setStatus('recording');
    tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    limit.current = setTimeout(stop, RECORDING_MAX_MS);
  }, [revoke, stop, teardown]);

  // Unmount / route leave / tab closing: release the microphone and forget the audio.
  useEffect(() => {
    alive.current = true;
    const onPageHide = () => teardown();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      alive.current = false;
      window.removeEventListener('pagehide', onPageHide);
      teardown();
      revoke();
    };
  }, [teardown, revoke]);

  return { supported: isRecordingSupported(), status, error, audioUrl, seconds, start, stop, discard };
}
