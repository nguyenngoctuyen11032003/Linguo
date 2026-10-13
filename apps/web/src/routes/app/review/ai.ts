import { isLevelOf, LEVELS, type ReviewCard } from '@linguo/shared';
import { readCardContent } from '@/components/flashcard/cardContent';
import { clip, type AiSheetState } from '@/components/exercise/ai-context';
import type { LearningPath } from '@/features/learning-paths/service';

/** The learner's level in the card's language: its path's current level, else the language's first level. */
export function levelForCard(card: ReviewCard, paths: LearningPath[], current: LearningPath | null): string {
  const lang = card.item.language_code;
  const candidates = [current, ...paths].filter((p): p is LearningPath => !!p && p.language === lang);
  return candidates.map((p) => p.currentLevel).find((level) => isLevelOf(lang, level)) ?? LEVELS[lang][0];
}

function vi(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const text = (value as Record<string, unknown>).vi;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

/** "Giải thích AI" on a card's back: explain_concept for the item, the item's meaning/confusion note as fallback. */
export function reviewAiState(card: ReviewCard, level: string): AiSheetState {
  const content = readCardContent(card);
  const confusion = vi(card.item.back.confusion);
  const body = [content.meaningVi ? `Nghĩa: ${content.meaningVi}` : null, confusion].filter(Boolean).join('\n\n');
  return {
    request: {
      task: 'explain_concept',
      language: card.item.language_code,
      level,
      concept: clip(content.text || content.meaningVi, 300),
      ...(content.meaningVi ? { context: clip(`Nghĩa tiếng Việt: ${content.meaningVi}`, 600) } : {}),
    },
    fallback: body ? { title: content.text || 'Thẻ ôn', body } : undefined,
  };
}
