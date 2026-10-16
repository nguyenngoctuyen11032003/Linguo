import { CONTENT_MAX_LEVEL, isAtContentCeiling, LEVEL_INFO, type LanguageCode } from '@linguo/shared';

/** "Linguo hiện có bài học tới JLPT N3…" for a language whose scale goes above its content. */
export function contentCeilingMessage(language: LanguageCode): string {
  return `Linguo hiện có bài học tới ${LEVEL_INFO[CONTENT_MAX_LEVEL[language]].label}, các cấp cao hơn sẽ có sau.`;
}

/**
 * Why no target can be picked: the content ceiling (current level at the highest level with lessons), else the
 * caller's "already reached" message.
 */
export function noTargetsMessage(language: LanguageCode, currentLevel: string, reached: string): string {
  return isAtContentCeiling(language, currentLevel) ? contentCeilingMessage(language) : reached;
}
