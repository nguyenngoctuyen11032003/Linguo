import { availableLevels, LEVEL_INFO, type LanguageCode, type LevelCode } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

export function StepCurrentLevel({ language, value, onChange }: { language: LanguageCode; value?: string; onChange: (v: LevelCode) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-muted">Chọn mức mô tả gần đúng nhất. Đây là tự đánh giá, bạn có thể làm bài kiểm tra sau.</p>
      <ChoiceList
        name="current-level"
        labelledBy="onboarding-title"
        value={value as LevelCode | undefined}
        onChange={onChange}
        options={availableLevels(language).map((code) => ({
          value: code,
          label: LEVEL_INFO[code].label,
          description: LEVEL_INFO[code].description,
        }))}
      />
    </div>
  );
}
