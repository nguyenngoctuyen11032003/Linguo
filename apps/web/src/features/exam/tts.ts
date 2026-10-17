// Spec 9 §4: listening questions without a recording are read aloud with the Web Speech API. When the browser has
// no voice for the target language, canSpeak() is false and the UI shows the script instead ("đọc thay nghe").

export type TtsLanguage = 'en' | 'ko' | 'ja' | 'de';

const LOCALES: Record<TtsLanguage, string> = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP', de: 'de-DE' };

/**
 * German headwords carry their plural / gender notation ("der Tisch, -e", "die Mutter, ¨-", "die Milch (Sg.)"): a voice
 * would read "-e" as "minus e". Only trailing notation is dropped; verb principal parts ("fahren, fährt, fuhr") stay.
 */
export function germanSpeechText(text: string): string {
  return text
    .replace(/\s*\((?:Sg|Pl)\.?\)\s*$/i, '')
    .replace(/,\s*(?:¨-?|-)[a-zäöüß]*-?\s*$/i, '')
    .trim();
}

/** The text a voice should get for `lang`. */
export function textForSpeech(text: string, lang: TtsLanguage): string {
  return lang === 'de' ? germanSpeechText(text) : text;
}

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

/** No network: only voices that run on the device can speak (a network voice fails silently or hangs). */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * The exact locale (ko-KR / en-US / ja-JP / de-DE) if installed, else any voice of the language (e.g. en-GB).
 * Offline, only on-device voices count (`localService`; a voice that does not say is assumed local, as on Safari).
 */
function pickVoice(s: SpeechSynthesis, lang: TtsLanguage): SpeechSynthesisVoice | null {
  const offline = isOffline();
  const all = voices(s).filter((v) => !offline || v.localService !== false);
  const locale = LOCALES[lang].toLowerCase();
  return (
    all.find((v) => normalise(v.lang) === locale) ??
    all.find((v) => normalise(v.lang).split('-')[0] === lang) ??
    null
  );
}

/** True when the browser can read `lang` aloud. Voices may load late and the network can come and go: re-check on onVoicesChanged. */
export function canSpeak(lang: TtsLanguage): boolean {
  const s = synth();
  return s !== null && pickVoice(s, lang) !== null;
}

/**
 * Calls `listener` when the set of usable voices may have changed: the browser's voice list changed, or the network
 * went away / came back (offline only on-device voices count). Returns the unsubscribe function.
 */
export function onVoicesChanged(listener: () => void): () => void {
  const s = synth();
  if (!s || typeof s.addEventListener !== 'function') return () => {};
  s.addEventListener('voiceschanged', listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    s.removeEventListener('voiceschanged', listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
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
    const utterance = new window.SpeechSynthesisUtterance(textForSpeech(text, lang));
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
