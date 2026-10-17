import type { LanguageCode } from '../constants';

export const LEVELS = {
  en: ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
  ko: ['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6'],
  /** Kana (ordinal 0), then JLPT N5 → N1 (ordinals 1–5): JLPT numbers count down, ordinals count up. */
  ja: ['kana', 'n5', 'n4', 'n3', 'n2', 'n1'],
  /** CEFR codes shared with en, but the scale stops at B2 (the German programme's target). */
  de: ['pre_a1', 'a1', 'a2', 'b1', 'b2'],
} as const;
export type EnLevel = (typeof LEVELS.en)[number];
export type KoLevel = (typeof LEVELS.ko)[number];
export type JaLevel = (typeof LEVELS.ja)[number];
/** German reuses the CEFR codes of en, so it adds no level code of its own. */
export type DeLevel = (typeof LEVELS.de)[number];
export type LevelCode = EnLevel | KoLevel | JaLevel | DeLevel;

/**
 * Highest level each language has a published program for (`content/<lang>/programs/*`, max `level_to`).
 * Levels above it stay valid codes (DB, diagnostic bank, exams) but are not offered as a current level or a
 * target, and diagnostic results are clamped to it, so nobody lands on a level without lessons.
 * `pnpm content:check` fails when a program reaches above this, and a test checks it matches the content tree.
 * Every language now has content on its whole scale (JLPT N2/N1 shipped as `content/ja/programs/n2` and `n1`);
 * the ceiling stays so a new language or scale can ship partially.
 */
export const CONTENT_MAX_LEVEL: Record<LanguageCode, LevelCode> = { en: 'c2', ko: 'topik6', ja: 'n1', de: 'b2' };

export interface LevelInfo {
  label: string;
  description: string;
}

export const LEVEL_INFO: Record<LevelCode, LevelInfo> = {
  pre_a1: { label: 'Mới bắt đầu', description: 'Chưa biết hoặc chỉ biết vài từ đơn lẻ.' },
  a1: { label: 'A1', description: 'Hiểu và dùng câu rất đơn giản về bản thân, gia đình, mua sắm.' },
  a2: { label: 'A2', description: 'Giao tiếp câu đơn giản về chủ đề quen thuộc hằng ngày.' },
  b1: { label: 'B1', description: 'Xử lý hầu hết tình huống khi đi lại, kể về trải nghiệm và kế hoạch.' },
  b2: { label: 'B2', description: 'Trao đổi trôi chảy với người bản xứ, đọc hiểu bài viết phức tạp về chủ đề quen thuộc.' },
  c1: { label: 'C1', description: 'Dùng linh hoạt cho học tập và công việc, hiểu văn bản dài và hàm ý.' },
  c2: { label: 'C2', description: 'Hiểu gần như mọi thứ nghe và đọc, diễn đạt chính xác sắc thái.' },
  hangul: { label: 'Hangul', description: 'Chưa đọc được chữ Hàn hoặc mới làm quen bảng chữ cái.' },
  topik1: { label: 'TOPIK 1', description: 'Chào hỏi, giới thiệu bản thân, mua sắm, gọi món bằng câu ngắn.' },
  topik2: { label: 'TOPIK 2', description: 'Giao tiếp sinh hoạt hằng ngày, dùng dịch vụ công cộng như ngân hàng, bưu điện.' },
  topik3: { label: 'TOPIK 3', description: 'Sinh hoạt hằng ngày không gặp khó khăn, theo được chủ đề xã hội quen thuộc.' },
  topik4: { label: 'TOPIK 4', description: 'Dùng cho công việc thông thường, hiểu tin tức và văn bản phổ thông.' },
  topik5: { label: 'TOPIK 5', description: 'Làm việc trong môi trường chuyên môn, hiểu chủ đề kinh tế, xã hội.' },
  topik6: { label: 'TOPIK 6', description: 'Sử dụng gần như người bản xứ trong học thuật và chuyên môn.' },
  kana: { label: 'Kana', description: 'Chưa đọc được chữ Nhật hoặc mới làm quen Hiragana, Katakana.' },
  n5: { label: 'JLPT N5', description: 'Đọc câu đơn giản bằng Hiragana, Katakana và Kanji cơ bản; nghe hội thoại ngắn, nói chậm.' },
  n4: { label: 'JLPT N4', description: 'Hiểu tiếng Nhật cơ bản về chủ đề quen thuộc hằng ngày khi người nói nói chậm.' },
  n3: { label: 'JLPT N3', description: 'Hiểu tiếng Nhật dùng trong sinh hoạt hằng ngày, đọc được tiêu đề báo và văn bản dễ.' },
  n2: { label: 'JLPT N2', description: 'Hiểu tin tức, bài báo và hội thoại tốc độ tự nhiên; dùng được cho công việc thông thường.' },
  n1: { label: 'JLPT N1', description: 'Hiểu tiếng Nhật trong nhiều tình huống, kể cả văn bản lập luận phức tạp và hàm ý.' },
};

export const START_POINTS = ['new', 'some', 'rusty', 'confident', 'unsure'] as const;
export type StartPoint = (typeof START_POINTS)[number];
export const START_POINT_LABELS: Record<StartPoint, string> = {
  new: 'Tôi mới hoàn toàn',
  some: 'Tôi đã học một ít',
  rusty: 'Tôi từng học nhưng quên nhiều',
  confident: 'Tôi biết khá rõ và muốn nâng cao',
  unsure: 'Tôi chưa chắc trình độ của mình',
};

export const GOAL_TYPES = [
  'foundation',
  'daily_communication',
  'work_it',
  'reading_docs',
  'cefr',
  'hangul_basics',
  'communication',
  'topik_i',
  'topik_ii',
  'skill_focus',
  'kana_basics',
  'jlpt',
  'goethe',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOALS_BY_LANGUAGE: Record<LanguageCode, readonly GoalType[]> = {
  en: ['foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'],
  ko: ['hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'],
  ja: ['kana_basics', 'communication', 'jlpt', 'skill_focus'],
  de: ['foundation', 'daily_communication', 'goethe', 'skill_focus'],
};

export const GOAL_LABELS: Record<GoalType, string> = {
  foundation: 'Nền tảng từ số 0',
  daily_communication: 'Giao tiếp đời sống',
  work_it: 'Tiếng Anh công việc / IT',
  reading_docs: 'Đọc hiểu tài liệu',
  cefr: 'Đạt một bậc CEFR',
  hangul_basics: 'Hangul và giao tiếp nền tảng',
  communication: 'Giao tiếp đời sống, du học, công việc',
  topik_i: 'TOPIK I (cấp 1–2)',
  topik_ii: 'TOPIK II (cấp 3–6)',
  skill_focus: 'Nâng cao nghe, đọc hoặc viết',
  kana_basics: 'Kana và giao tiếp nền tảng',
  jlpt: 'Đạt một cấp JLPT',
  goethe: 'Đạt một bậc Goethe (A1–B2)',
};

const GOAL_DEFAULT_TARGET: Record<GoalType, LevelCode> = {
  foundation: 'a2',
  daily_communication: 'b1',
  work_it: 'b2',
  reading_docs: 'b2',
  cefr: 'b2',
  hangul_basics: 'topik1',
  communication: 'topik3',
  topik_i: 'topik2',
  topik_ii: 'topik4',
  skill_focus: 'topik4',
  kana_basics: 'n5',
  jlpt: 'n3',
  goethe: 'b1',
};

/** Defaults of goals shared between languages whose own scale differs from the table above. */
const GOAL_DEFAULT_TARGET_BY_LANGUAGE: Partial<Record<LanguageCode, Partial<Record<GoalType, LevelCode>>>> = {
  ja: { communication: 'n3', skill_focus: 'n3' },
  de: { skill_focus: 'b1' },
};

const UNSURE_DEFAULT_LEVEL: Record<LanguageCode, LevelCode> = { en: 'a1', ko: 'topik1', ja: 'n5', de: 'a1' };

const TOPIK_I: readonly string[] = ['topik1', 'topik2'];
const TOPIK_II: readonly string[] = ['topik3', 'topik4', 'topik5', 'topik6'];

export const PATH_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export type PathStatus = (typeof PATH_STATUSES)[number];

export function isGoalForLanguage(language: LanguageCode, goal: string): goal is GoalType {
  return (GOALS_BY_LANGUAGE[language] as readonly string[]).includes(goal);
}

export function isLevelOf(language: LanguageCode, level: string): level is LevelCode {
  return (LEVELS[language] as readonly string[]).includes(level);
}

export function levelOrdinal(language: LanguageCode, level: string): number {
  return (LEVELS[language] as readonly string[]).indexOf(level);
}

/** Whether `level` has learning content (at or below `CONTENT_MAX_LEVEL`); false for unknown codes. */
export function isLevelAvailable(language: LanguageCode, level: string): boolean {
  const ordinal = levelOrdinal(language, level);
  return ordinal >= 0 && ordinal <= levelOrdinal(language, CONTENT_MAX_LEVEL[language]);
}

/** Levels a learner can pick (current level or target), lowest first. */
export function availableLevels(language: LanguageCode): LevelCode[] {
  return (LEVELS[language] as readonly LevelCode[]).filter((l) => isLevelAvailable(language, l));
}

/**
 * True when `current` is at or above the highest level with content while the scale goes higher
 * (e.g. JLPT N3 back when N2/N1 had no lessons): there is nothing to aim for yet, though the learner has not finished the scale.
 */
export function isAtContentCeiling(language: LanguageCode, current: string): boolean {
  const ordinal = levelOrdinal(language, current);
  const max = levelOrdinal(language, CONTENT_MAX_LEVEL[language]);
  return ordinal >= max && max < LEVELS[language].length - 1;
}

/**
 * `level` lowered to the highest level with content (diagnostic suggestions and estimates); levels with content
 * and unknown codes are returned unchanged.
 */
export function clampToContentLevel(language: LanguageCode, level: string): string {
  return isLevelOf(language, level) && !isLevelAvailable(language, level) ? CONTENT_MAX_LEVEL[language] : level;
}

/**
 * Levels the user may aim for: strictly above `current` and with content (`CONTENT_MAX_LEVEL`), restricted to the
 * TOPIK band for TOPIK goals.
 */
export function allowedTargets(language: LanguageCode, goal: GoalType, current: string): LevelCode[] {
  const from = levelOrdinal(language, current);
  if (from < 0) return [];
  let levels = availableLevels(language).filter((l) => levelOrdinal(language, l) > from);
  if (goal === 'topik_i') levels = levels.filter((l) => TOPIK_I.includes(l));
  if (goal === 'topik_ii') levels = levels.filter((l) => TOPIK_II.includes(l));
  return levels;
}

export function defaultTarget(language: LanguageCode, goal: GoalType, current: string): LevelCode | null {
  const options = allowedTargets(language, goal, current);
  const preferred = GOAL_DEFAULT_TARGET_BY_LANGUAGE[language]?.[goal] ?? GOAL_DEFAULT_TARGET[goal];
  return options.includes(preferred) ? preferred : (options[0] ?? null);
}

/** `new` → lowest level (step 3 is skipped); `unsure` → a gentle default; otherwise the user picks. */
export function suggestedCurrentLevel(language: LanguageCode, startPoint: StartPoint): LevelCode | null {
  if (startPoint === 'new') return LEVELS[language][0];
  if (startPoint === 'unsure') return UNSURE_DEFAULT_LEVEL[language];
  return null;
}
