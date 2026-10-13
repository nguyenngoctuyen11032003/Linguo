import { START_POINT_LABELS, START_POINTS, type StartPoint } from '@linguo/shared';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';

export function StepStartPoint({ value, onChange }: { value?: StartPoint; onChange: (v: StartPoint) => void }) {
  return (
    <ChoiceList
      name="start-point"
      labelledBy="onboarding-title"
      value={value}
      onChange={onChange}
      options={START_POINTS.map((p) => ({
        value: p,
        label: START_POINT_LABELS[p],
        description:
          p === 'unsure' ? 'Bài kiểm tra đầu vào sẽ có trong bản cập nhật tới. Tạm thời hãy chọn mức gần đúng ở bước sau.' : undefined,
      }))}
    />
  );
}
