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
