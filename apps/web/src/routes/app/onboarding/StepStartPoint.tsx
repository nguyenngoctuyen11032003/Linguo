import { START_POINT_LABELS, START_POINTS, type StartPoint } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

const DESCRIPTIONS: Partial<Record<StartPoint, string>> = {
  unsure: 'Chọn mức gần đúng ở bước sau. Khi lộ trình đã tạo, bạn có thể làm bài kiểm tra (~12 phút) để ước lượng sát hơn.',
};

export function StepStartPoint({ value, onChange }: { value?: StartPoint; onChange: (v: StartPoint) => void }) {
  return (
    <ChoiceList
      name="start-point"
      labelledBy="onboarding-title"
      value={value}
      onChange={onChange}
      options={START_POINTS.map((p) => ({ value: p, label: START_POINT_LABELS[p], description: DESCRIPTIONS[p] }))}
    />
  );
}
