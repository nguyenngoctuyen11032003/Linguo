import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeakingLanguage } from './ratings';

// Spec 6.9: when the browser has speech-to-text, show its transcript as "bản chép lời có thể sai" that the learner can
// correct. The Web Speech API is only in some browsers (Chrome/Safari, often webkit-prefixed); where it is missing
// `supported` is false and the screen simply hides the transcript. Note that some browsers send the audio to their
// own recognition service: the screen says so and keeps the feature opt-in.

interface RecognitionResultAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0?: RecognitionResultAlternative;
  length: number;
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

const LOCALES: Record<SpeakingLanguage, string> = { en: 'en-US', ko: 'ko-KR' };

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface SpeechRecognitionApi {
  supported: boolean;
  listening: boolean;
  transcript: string;
  /** The learner's corrections. */
  setTranscript: (text: string) => void;
  start: () => void;
  stop: () => void;
  /** Clears the transcript. */
  reset: () => void;
}

export function useSpeechRecognition(lang: SpeakingLanguage): SpeechRecognitionApi {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const active = useRef<Recognition | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    try {
      active.current?.stop();
    } catch {
      // Already stopped.
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || active.current) return;
    try {
      const rec = new Ctor();
      rec.lang = LOCALES[lang];
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) text += event.results[i]?.[0]?.transcript ?? '';
        if (alive.current && active.current === rec) setTranscript(text.trim());
      };
      const finish = () => {
        if (active.current === rec) active.current = null;
        if (alive.current) setListening(false);
      };
      rec.onend = finish;
      rec.onerror = finish;
      active.current = rec;
      setTranscript('');
      rec.start();
      setListening(true);
    } catch {
      active.current = null;
      setListening(false);
    }
  }, [lang]);

  const reset = useCallback(() => setTranscript(''), []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const rec = active.current;
      active.current = null;
      if (rec) {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        try {
          rec.abort();
        } catch {
          // Nothing left to abort.
        }
      }
    };
  }, []);

  return { supported: isSpeechRecognitionSupported(), listening, transcript, setTranscript, start, stop, reset };
}
