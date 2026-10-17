import { useMemo } from 'react';
import type { AnswerLang } from '@linguo/shared';
import type { Confidence } from '@/features/lesson-player/types';
import { asset } from '@/lib/asset';
import { seededShuffle } from './shuffle';

export const CONFIDENCE_LABELS: Record<Confidence, string> = { 1: 'Chưa chắc', 2: 'Hơi chắc', 3: 'Chắc chắn' };

/** Messages for the grader's built-in error tags (spec 2 §5.4). */
export const ERROR_TAG_MESSAGES: Record<string, string> = {
  typo: 'Đúng ý nhưng sai chính tả',
  article: 'Kiểm tra lại mạo từ a/an/the',
  spacing: 'Đúng, lưu ý khoảng cách giữa các từ (띄어쓰기)',
  particle_allomorph: 'Sai dạng trợ từ — xem từ trước có patchim không',
  missing_diacritics: 'Đúng nhưng thiếu dấu',
};

/** German overrides: "article" means der/die/das there, and the grader's German-only tags need their own wording. */
const GERMAN_ERROR_TAG_MESSAGES: Record<string, string> = {
  article: 'Kiểm tra lại mạo từ der/die/das',
  gender: 'Kiểm tra lại giống của danh từ (der/die/das)',
  case_dat_akk: 'Kiểm tra lại cách: Akkusativ hay Dativ?',
  verb_position: 'Kiểm tra lại vị trí của động từ',
  adj_ending: 'Kiểm tra lại đuôi tính từ',
  plural_form: 'Kiểm tra lại dạng số nhiều',
  capitalization: 'Danh từ tiếng Đức luôn viết hoa',
  aux_verb: 'Kiểm tra lại trợ động từ: haben hay sein?',
  word_order: 'Kiểm tra lại trật tự từ trong câu',
  missing_diacritics: 'Đúng nhưng thiếu dấu chấm của ä, ö, ü (hoặc viết ae, oe, ue)',
};

/** The message for a grader error tag; `german` picks the German wording where it differs. */
export function errorTagMessage(tag: string, german = false): string | undefined {
  return (german ? GERMAN_ERROR_TAG_MESSAGES[tag] : undefined) ?? ERROR_TAG_MESSAGES[tag];
}

export interface ChoiceOption {
  id: string;
  text: string;
  lang: AnswerLang;
}

/** Option order for mcq/listen: seeded by the exercise id so it is stable across renders and reloads. */
export function useOrderedOptions(options: ChoiceOption[], shuffle: boolean, seed: string): ChoiceOption[] {
  return useMemo(() => (shuffle ? seededShuffle(options, seed) : options), [options, shuffle, seed]);
}

export type TemplatePart = { kind: 'text'; text: string } | { kind: 'blank'; id: string };

/** Splits a fill_blank template on `{{id}}` placeholders. */
export function parseTemplate(template: string): TemplatePart[] {
  const pieces = template.split(/\{\{([a-z0-9][a-z0-9_-]{0,39})\}\}/);
  return pieces
    .map((piece, i): TemplatePart => (i % 2 === 1 ? { kind: 'blank', id: piece } : { kind: 'text', text: piece }))
    .filter((part) => part.kind === 'blank' || part.text.length > 0);
}

/** Audio asset ids are paths under `public/audio/` unless they are already absolute URLs. */
export function audioUrl(assetId: string): string {
  return /^(https?:)?\/\//.test(assetId) || assetId.startsWith('/') ? assetId : asset(`audio/${assetId}`);
}

/** Hangul (jamo and syllables), kana and kanji: these read smaller than Latin text at the same font size. */
const CJK_ONLY_RE = /^[\sᄀ-ᇿ぀-ヿ㄰-㆏ㇰ-ㇿ㐀-鿿가-힯ｦ-ﾟ]+$/;

/** A lone letter, syllable or short word in Korean/Japanese (e.g. "ㅓ", "아", "です"), shown larger so its strokes are legible. */
export function isShortCjk(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && Array.from(trimmed).length <= 4 && CJK_ONLY_RE.test(trimmed);
}
