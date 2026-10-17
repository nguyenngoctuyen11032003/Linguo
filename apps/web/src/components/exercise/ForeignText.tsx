import { Fragment, type ReactNode } from 'react';
import type { TtsLanguage } from '@/features/exam/tts';
import { useVoiceAvailable } from './machine-speech';
import { SpeakInline } from './SpeakButton';

/** Korean (Hangul) or Japanese (kana, kanji) runs inside Vietnamese prose. */
const CJK_RUN = /([가-힯ᄀ-ᇿ㄰-㆏]+(?:[ ][가-힯ᄀ-ᇿ㄰-㆏]+)*|[぀-ヿㇰ-ㇿ一-鿿ｦ-ﾟ]+)/;

/** ASCII-only Vietnamese words that would otherwise read as English ("cho", "khi", "anh"...). */
const VI_ASCII = new Set(
  (
    'ba be bo bu ca cu da de di do du em ga gi ha he hi ho hu ke ki la le li lo ma me mi mo mu na ne ni no nu ta te ti to tu ve vo xa xe xi ' +
    'anh ban bao cac can cao cay che chi cho chu con cua cung dai dan dang day den dep doi dua gia gio hai han hay hen hoa hon huu khi kho ' +
    'lam lan lai lau lon luc mat may mua nam nay neu nhu noi nua oan oi qua quy rat roi sau sao sua tai tam tay thi tin tot tra tren trong ' +
    'van vao vui xin ngay nhan nhau nhung nuoc cung hoc khac khong lop mot ten the thu'
  ).split(' '),
);

const WORD = /[A-Za-z][A-Za-z'’-]*/;
// A word is ASCII letters only and not glued to an accented letter: "ng" inside "người" is Vietnamese, not English.
const ASCII_WORD = String.raw`(?<![\p{L}'’-])[A-Za-z][A-Za-z'’-]*(?![\p{L}])`;
const ASCII_RUN = new RegExp(`(?:${ASCII_WORD}(?: (?=${ASCII_WORD}))?)+`, 'gu');
const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const SLASHED = /(\/[^/\n]+\/)/;

/** Whether an ASCII run reads as English: at least one word of 3+ letters that is not a Vietnamese ASCII word. */
function looksEnglish(run: string): boolean {
  const words = run.match(new RegExp(WORD.source, 'g')) ?? [];
  if (words.length === 0) return false;
  const english = words.filter((w) => !VI_ASCII.has(w.toLowerCase()));
  return english.some((w) => w.replace(/['’-]/g, '').length >= 3) || (words.length >= 2 && english.length === words.length);
}

/** Splits `text` into English phrases and the Vietnamese around them; `a/an/the` is kept as one phrase. */
function splitLatin(text: string): Array<{ text: string; lang: TtsLanguage | null }> {
  const out: Array<{ text: string; lang: TtsLanguage | null }> = [];
  let last = 0;
  const push = (t: string, lang: TtsLanguage | null) => {
    if (t) out.push({ text: t, lang });
  };
  for (const match of text.matchAll(ASCII_RUN)) {
    const run = match[0];
    const start = match.index ?? 0;
    // Trim Vietnamese ASCII words off both ends so "Không nói very brilliant" speaks only "very brilliant".
    const tokens = run.split(' ');
    let from = 0;
    let to = tokens.length;
    while (from < to && VI_ASCII.has(tokens[from]!.toLowerCase())) from += 1;
    while (to > from && VI_ASCII.has(tokens[to - 1]!.toLowerCase())) to -= 1;
    const phrase = tokens.slice(from, to).join(' ');
    if (!phrase || !looksEnglish(phrase)) continue;
    const offset = tokens.slice(0, from).join(' ').length + (from > 0 ? 1 : 0);
    push(text.slice(last, start + offset), null);
    push(phrase, 'en');
    last = start + offset + phrase.length;
  }
  push(text.slice(last), null);
  return out;
}

export interface ForeignTextProps {
  /** Vietnamese prose that may quote Korean, Japanese or English. */
  children: string;
  /**
   * The course language. English phrases are only picked out of the prose for an English course: Latin letters in a
   * Korean or Japanese lesson are usually romanisation, which an English voice would mangle.
   */
  course?: TtsLanguage | null;
}

type Segment = { text: string; lang: TtsLanguage | null };

function segments(text: string, course: TtsLanguage | null): Segment[] {
  const out: Segment[] = [];
  text.split(CJK_RUN).forEach((part, i) => {
    if (i % 2 === 1) {
      out.push({ text: part, lang: HANGUL.test(part) ? 'ko' : 'ja' });
    } else if (course !== 'en') {
      out.push({ text: part, lang: null });
    } else {
      // IPA and other slashed notation is shown, never spoken.
      part.split(SLASHED).forEach((chunk, j) => (j % 2 === 1 ? out.push({ text: chunk, lang: null }) : out.push(...splitLatin(chunk))));
    }
  });
  return out;
}

/**
 * Vietnamese prose in which every foreign phrase is tappable to hear its pronunciation. A phrase whose language has no
 * voice in this browser stays plain text, so without any voice the prose renders as one untouched string.
 */
export function ForeignText({ children, course = null }: ForeignTextProps): ReactNode {
  const voices: Record<TtsLanguage, boolean> = {
    en: useVoiceAvailable('en'),
    ko: useVoiceAvailable('ko'),
    ja: useVoiceAvailable('ja'),
    de: useVoiceAvailable('de'),
  };
  const parts: Segment[] = [];
  for (const seg of segments(children, course)) {
    const lang = seg.lang && voices[seg.lang] ? seg.lang : null;
    const last = parts.at(-1);
    if (!lang && last && !last.lang) last.text += seg.text;
    else parts.push({ text: seg.text, lang });
  }
  return (
    <>
      {parts.map((part, i) => (part.lang ? <SpeakInline key={i} text={part.text} lang={part.lang} /> : <Fragment key={i}>{part.text}</Fragment>))}
    </>
  );
}
