import { LANGUAGE_CODES, LANGUAGES, roleplayScenariosFor } from '@linguo/shared';

/** "tiếng Anh, tiếng Hàn, tiếng Nhật và tiếng Đức": the offered languages that have role-play scenarios. */
export function roleplayLanguageNames(): string {
  const names = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available && roleplayScenariosFor(code).length > 0).map((code) => LANGUAGES[code].nameVi.toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} và ${names.at(-1)}` : (names[0] ?? '');
}
