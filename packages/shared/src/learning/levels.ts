import type { LanguageCode } from '../constants';

export const LEVELS = {
  en: ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
  ko: ['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6'],
} as const;
export type EnLevel = (typeof LEVELS.en)[number];
export type KoLevel = (typeof LEVELS.ko)[number];
export type LevelCode = EnLevel | KoLevel;

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
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOALS_BY_LANGUAGE: Record<LanguageCode, readonly GoalType[]> = {
  en: ['foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'],
  ko: ['hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'],
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
};

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

/** Levels the user may aim for: strictly above `current`, restricted to the TOPIK band for TOPIK goals. */
export function allowedTargets(language: LanguageCode, goal: GoalType, current: string): LevelCode[] {
  const from = levelOrdinal(language, current);
  let levels = (LEVELS[language] as readonly LevelCode[]).filter((_, i) => i > from);
  if (goal === 'topik_i') levels = levels.filter((l) => TOPIK_I.includes(l));
  if (goal === 'topik_ii') levels = levels.filter((l) => TOPIK_II.includes(l));
  return levels;
}

export function defaultTarget(language: LanguageCode, goal: GoalType, current: string): LevelCode | null {
  const options = allowedTargets(language, goal, current);
  const preferred = GOAL_DEFAULT_TARGET[goal];
  return options.includes(preferred) ? preferred : (options[0] ?? null);
}

/** `new` → lowest level (step 3 is skipped); `unsure` → a gentle default; otherwise the user picks. */
export function suggestedCurrentLevel(language: LanguageCode, startPoint: StartPoint): LevelCode | null {
  if (startPoint === 'new') return LEVELS[language][0];
  if (startPoint === 'unsure') return language === 'en' ? 'a1' : 'topik1';
  return null;
}
