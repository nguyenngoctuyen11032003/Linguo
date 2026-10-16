import { useCallback, useEffect, useRef, useState } from 'react';
import { canSpeak, onVoicesChanged, speak, stopSpeaking, type TtsLanguage } from '@/features/exam/tts';

export const NORMAL_RATE = 0.9;
export const SLOW_RATE = 0.7;

/** Hiragana, katakana (incl. phonetic extensions and half-width forms) and CJK unified ideographs (kanji). */
export const JAPANESE_SCRIPT_RE = /[぀-ヿㇰ-ㇿ一-鿿ｦ-ﾟ]/;

/** Hangul means Korean; kana or kanji means Japanese; everything else the app teaches is English. */
export function detectScriptLang(text: string): TtsLanguage {
  if (/[ᄀ-ᇿㄱ-ㆎ가-힣]/.test(text)) return 'ko';
  return JAPANESE_SCRIPT_RE.test(text) ? 'ja' : 'en';
}

/** `en`/`ko`/`ja` pass through; Vietnamese and anything unknown is not read aloud. */
export function toTtsLanguage(lang: string | null | undefined): TtsLanguage | null {
  return lang === 'en' || lang === 'ko' || lang === 'ja' ? lang : null;
}

/** The language of a lesson's foreign text, taken from its example / mistake blocks. */
export function lessonLanguage(blocks: ReadonlyArray<{ type: string; target_lang?: string }>): TtsLanguage | null {
  return toTtsLanguage(blocks.find((b) => (b.type === 'example' || b.type === 'common_mistake') && b.target_lang)?.target_lang);
}

/**
 * The part of `text` worth reading: drops markdown emphasis, blank placeholders ("____", "…") and spacing so the
 * voice does not say "underscore underscore".
 */
export function speechText(text: string): string {
  return text
    .replace(/[*_`~]{1,}/g, (m) => (m.length >= 2 && /^_+$/.test(m) ? ' ' : ''))
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/…|\.{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether the browser has a voice for `lang` (voices can load late, so this can turn true after mount). */
export function useVoiceAvailable(lang: TtsLanguage | null): boolean {
  const [available, setAvailable] = useState(() => (lang ? canSpeak(lang) : false));
  useEffect(() => {
    if (!lang) {
      setAvailable(false);
      return;
    }
    const refresh = () => setAvailable(canSpeak(lang));
    refresh();
    return onVoicesChanged(refresh);
  }, [lang]);
  return available;
}

export type MachineSpeechState = 'idle' | 'speaking' | 'error';

export interface MachineSpeech {
  /** The browser has a speechSynthesis voice for the language (voices can load late). */
  available: boolean;
  state: MachineSpeechState;
  /** Speed of the utterance that is playing or failed last. */
  rate: number | null;
  play: (rate?: number) => void;
  stop: () => void;
}

/** Reads `text` aloud with speechSynthesis. Never autoplays; stops on unmount. Key the caller by text. */
export function useMachineSpeech(text: string, lang: TtsLanguage): MachineSpeech {
  const [available, setAvailable] = useState(() => canSpeak(lang));
  const [state, setState] = useState<MachineSpeechState>('idle');
  const [rate, setRate] = useState<number | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const refresh = () => setAvailable(canSpeak(lang));
    refresh();
    const off = onVoicesChanged(refresh);
    return () => {
      off();
      token.current += 1;
      stopSpeaking();
    };
  }, [lang]);

  const stop = useCallback(() => {
    token.current += 1;
    stopSpeaking();
    setState('idle');
  }, []);

  const play = useCallback(
    (nextRate: number = NORMAL_RATE) => {
      const id = ++token.current;
      setState('speaking');
      setRate(nextRate);
      speak(text, lang, { rate: nextRate }).then(
        () => token.current === id && setState('idle'),
        () => token.current === id && setState('error'),
      );
    },
    [text, lang],
  );

  return { available, state, rate, play, stop };
}
