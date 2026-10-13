import type { ReactNode } from 'react';
import { GOAL_LABELS, LANGUAGES, LEVEL_INFO, START_POINT_LABELS, type CreatePathInput, type EstimateResult, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { formatMinutes } from '@/features/learning-paths/components/schedule';
import { formatDateVi } from '@/lib/dates';
import type { StepNumber } from './logic';

interface Props {
  input: CreatePathInput;
  estimate: EstimateResult | null;
  onEdit: (step: StepNumber) => void;
  onApplyMinutes: (minutes: number) => void;
  onApplyDate: (iso: string) => void;
  onCreate: () => void;
  creating: boolean;
  error: string | null;
  errorAction?: ReactNode;
}

export function StepReview({ input, estimate, onEdit, onApplyMinutes, onApplyDate, onCreate, creating, error, errorAction }: Props) {
  const weekly = input.weeklyMinutes.reduce((s, m) => s + m, 0);
  const rows: Array<{ label: string; value: string; step: StepNumber }> = [
    { label: 'Ngôn ngữ', value: LANGUAGES[input.language].nameVi, step: 1 },
    { label: 'Điểm xuất phát', value: START_POINT_LABELS[input.startPoint], step: 2 },
    { label: 'Trình độ hiện tại', value: LEVEL_INFO[input.currentLevel as LevelCode].label, step: input.startPoint === 'new' ? 2 : 3 },
    { label: 'Mục tiêu', value: `${GOAL_LABELS[input.goalType]} · ${LEVEL_INFO[input.targetLevel as LevelCode].label}`, step: 4 },
    { label: 'Thời gian', value: `${formatMinutes(weekly)} mỗi tuần`, step: 5 },
    { label: 'Thời hạn', value: input.targetDate ? formatDateVi(input.targetDate) : 'Không đặt', step: 5 },
  ];

  return (
    <div className="space-y-5">
      <SolidCard>
        <dl className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="font-semibold">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => onEdit(row.step)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                Sửa<span className="sr-only"> {row.label.toLowerCase()}</span>
              </button>
            </div>
          ))}
        </dl>
      </SolidCard>

      {estimate && (
        <SolidCard className="space-y-4">
          <EstimateSummary estimate={estimate} />
          {estimate.feasibility !== 'feasible' && estimate.feasibility !== 'no_deadline' && (
            <div className="flex flex-wrap gap-2">
              {estimate.suggestedMinutesPerDay && (
                <Button variant="ghost" onClick={() => onApplyMinutes(estimate.suggestedMinutesPerDay!)}>
                  Dùng {estimate.suggestedMinutesPerDay} phút/ngày
                </Button>
              )}
              {estimate.suggestedDate && (
                <Button variant="ghost" onClick={() => onApplyDate(estimate.suggestedDate!)}>
                  Dời ngày mục tiêu sang {formatDateVi(estimate.suggestedDate)}
                </Button>
              )}
            </div>
          )}
        </SolidCard>
      )}

      <p className="text-sm text-muted">Trình độ từng kỹ năng sẽ được ghi nhận là tự đánh giá cho tới khi có bài kiểm tra đầu vào.</p>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3">
          <p role="alert" className="text-[15px] text-error">
            {error}
          </p>
          {errorAction}
        </div>
      )}
      <Button variant="accent" size="lg" block loading={creating} onClick={onCreate}>
        Tạo lộ trình
      </Button>
    </div>
  );
}
