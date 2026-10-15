export const LANGUAGE_CODES = ['en', 'ko', 'ja'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface LanguageInfo {
  code: LanguageCode;
  short: string;
  nameVi: string;
  nativeName: string;
  available: boolean;
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  en: { code: 'en', short: 'EN', nameVi: 'Tiếng Anh', nativeName: 'English', available: true },
  ko: { code: 'ko', short: 'KO', nameVi: 'Tiếng Hàn', nativeName: '한국어', available: true },
  // Plumbing only until content/ja is published; the content integration step flips `available`.
  ja: { code: 'ja', short: 'JA', nameVi: 'Tiếng Nhật', nativeName: '日本語', available: false },
};

/**
 * Languages a learner can pick (onboarding, language pickers). Unavailable languages stay valid everywhere else
 * (schemas, RPCs, existing paths) so they can be wired and tested before their content ships.
 */
export const AVAILABLE_LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGE_CODES.filter((c) => LANGUAGES[c].available);

export function isLanguageAvailable(code: LanguageCode): boolean {
  return LANGUAGES[code].available;
}

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

/** PRD 5.3: vocabulary, grammar, reading, listening, writing, speaking/pronunciation. */
export const SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'] as const;
export type Skill = (typeof SKILLS)[number];

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
