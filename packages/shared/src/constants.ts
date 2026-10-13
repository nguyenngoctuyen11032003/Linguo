export const LANGUAGE_CODES = ['en', 'ko'] as const;
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
  ko: { code: 'ko', short: 'KO', nameVi: 'Tiếng Hàn', nativeName: '한국어', available: false },
};

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

/** PRD 5.3: vocabulary, grammar, reading, listening, writing, speaking/pronunciation. */
export const SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'] as const;
export type Skill = (typeof SKILLS)[number];

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
