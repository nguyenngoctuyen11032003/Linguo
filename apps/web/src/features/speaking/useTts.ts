import { useCallback, useEffect, useRef, useState } from 'react';
import { canSpeak, onVoicesChanged, speak, stopSpeaking } from '@/features/exam/tts';
import type { SpeakingLanguage } from './ratings';

export interface TtsApi {
  /** The browser has a voice for the language (voices can load late, so this can turn true after mount). */
  available: boolean;
  /** Text currently being read, or null. */
  speakingText: string | null;
  play: (text: string) => void;
  stop: () => void;
}

/** Reads sentences aloud with speechSynthesis when a voice exists; silent no-op otherwise. Stops on unmount. */
export function useTts(lang: SpeakingLanguage): TtsApi {
  const [available, setAvailable] = useState(() => canSpeak(lang));
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const alive = useRef(true);
  const current = useRef(0);

  useEffect(() => {
    alive.current = true;
    const refresh = () => setAvailable(canSpeak(lang));
    refresh();
    const off = onVoicesChanged(refresh);
    return () => {
      alive.current = false;
      off();
      stopSpeaking();
    };
  }, [lang]);

  const stop = useCallback(() => {
    current.current += 1;
    stopSpeaking();
    setSpeakingText(null);
  }, []);

  const play = useCallback((text: string) => {
    const id = ++current.current;
    setSpeakingText(text);
    const done = () => {
      if (alive.current && current.current === id) setSpeakingText(null);
    };
    speak(text, lang).then(done, done);
  }, [lang]);

  return { available, speakingText, play, stop };
}
