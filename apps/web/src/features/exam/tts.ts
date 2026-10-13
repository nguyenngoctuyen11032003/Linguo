// Spec 9 §4: listening questions without a recording are read aloud with the Web Speech API. When the browser has
// no voice for the target language, canSpeak() is false and the UI shows the script instead ("đọc thay nghe").

export type TtsLanguage = 'en' | 'ko';

const LOCALES: Record<TtsLanguage, string> = { en: 'en-US', ko: 'ko-KR' };

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window) || !window.speechSynthesis) return null;
  if (typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return window.speechSynthesis;
}

function voices(s: SpeechSynthesis): SpeechSynthesisVoice[] {
  try {
    return s.getVoices() ?? [];
  } catch {
    return [];
  }
}

const normalise = (tag: string) => tag.replace('_', '-').toLowerCase();

/** The exact locale (ko-KR / en-US) if installed, else any voice of the language (e.g. en-GB). */
function pickVoice(s: SpeechSynthesis, lang: TtsLanguage): SpeechSynthesisVoice | null {
  const all = voices(s);
  const locale = LOCALES[lang].toLowerCase();
  return (
    all.find((v) => normalise(v.lang) === locale) ??
    all.find((v) => normalise(v.lang).split('-')[0] === lang) ??
    null
  );
}

/** True when the browser can read `lang` aloud. Voices may load late: re-check on onVoicesChanged. */
export function canSpeak(lang: TtsLanguage): boolean {
  const s = synth();
  return s !== null && pickVoice(s, lang) !== null;
}

/** Calls `listener` when the browser's voice list changes; returns the unsubscribe function. */
export function onVoicesChanged(listener: () => void): () => void {
  const s = synth();
  if (!s || typeof s.addEventListener !== 'function') return () => {};
  s.addEventListener('voiceschanged', listener);
  return () => s.removeEventListener('voiceschanged', listener);
}

/**
 * Reads `text` aloud, interrupting anything already playing. Resolves when it ends or is stopped with
 * stopSpeaking(); rejects with `tts_unavailable` when there is no voice, or `tts_failed` on a synthesis error.
 */
export function speak(text: string, lang: TtsLanguage, o: { rate?: number } = {}): Promise<void> {
  const s = synth();
  const voice = s ? pickVoice(s, lang) : null;
  if (!s || !voice) return Promise.reject(new Error('tts_unavailable'));
  s.cancel();
  return new Promise<void>((resolve, reject) => {
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = LOCALES[lang];
    utterance.voice = voice;
    utterance.rate = o.rate ?? 1;
    utterance.onend = () => resolve();
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (event.error === 'canceled' || event.error === 'interrupted') resolve();
      else reject(new Error('tts_failed'));
    };
    s.speak(utterance);
  });
}

/** Stops any speech in progress (its speak() promise resolves). */
export function stopSpeaking(): void {
  synth()?.cancel();
}
