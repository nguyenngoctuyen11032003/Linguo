import { LANGUAGE_CODES, LANGUAGES, type LanguageCode } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

const DESCRIPTIONS: Record<LanguageCode, string> = {
  en: 'Từ nền tảng tới CEFR C2: giao tiếp, công việc, đọc tài liệu.',
  ko: 'Từ bảng chữ Hangul tới TOPIK II: giao tiếp, du học, công việc.',
};

interface Props {
  value?: LanguageCode;
  taken: readonly LanguageCode[];
  onChange: (language: LanguageCode) => void;
}

export function StepLanguage({ value, taken, onChange }: Props) {
  return (
    <ChoiceList
      name="language"
      labelledBy="onboarding-title"
      value={value}
      onChange={onChange}
      options={LANGUAGE_CODES.map((code) => ({
        value: code,
        label: (
          <>
            {LANGUAGES[code].nameVi} · <span lang={code}>{LANGUAGES[code].nativeName}</span>
          </>
        ),
        description: DESCRIPTIONS[code],
        disabled: taken.includes(code) || !LANGUAGES[code].available,
        note: taken.includes(code) ? 'Đã có lộ trình' : !LANGUAGES[code].available ? 'Sắp ra mắt' : undefined,
      }))}
    />
  );
}
