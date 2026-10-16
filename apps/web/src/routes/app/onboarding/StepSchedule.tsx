import { addDaysIso, DEADLINE_MODES, type DeadlineMode } from '@linguo/shared';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { ChoiceList } from '@/features/learning-paths/components/ChoiceList';
import { ScheduleEditor, type ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';
import { resolveTargetDate, targetDateError } from './logic';

const MODE_LABELS: Record<DeadlineMode, string> = {
  none: 'Không đặt thời hạn',
  date: 'Chọn ngày mục tiêu',
  weeks: 'Trong số tuần',
  months: 'Trong số tháng',
};

interface Props {
  schedule: ScheduleValue;
  onSchedule: (v: ScheduleValue) => void;
  mode: DeadlineMode;
  onMode: (m: DeadlineMode) => void;
  targetDate?: string | null;
  onTargetDate: (iso: string | null) => void;
  amount?: number;
  onAmount: (n: number | undefined) => void;
  today: string;
}

export function StepSchedule({ schedule, onSchedule, mode, onMode, targetDate, onTargetDate, amount, onAmount, today }: Props) {
  const noDays = schedule.weeklyMinutes.reduce((sum, m) => sum + m, 0) === 0;
  const resolved = resolveTargetDate({ deadlineMode: mode, targetDate, deadlineAmount: amount }, today);
  const dateError = mode === 'date' ? (targetDate ? targetDateError(targetDate, today) : 'Chọn ngày mục tiêu.') : undefined;
  const amountError = mode === 'weeks' || mode === 'months' ? (amount ? targetDateError(resolved, today) : mode === 'weeks' ? 'Nhập số tuần' : 'Nhập số tháng') : undefined;
  return (
    <div className="space-y-6">
      <ScheduleEditor value={schedule} onChange={onSchedule} labelledBy="onboarding-title" error={noDays ? 'Hãy chọn ít nhất một ngày học.' : undefined} />
      <section className="space-y-3">
        <h2 id="deadline-heading" className="eyebrow">
          Thời hạn
        </h2>
        <p className="text-[15px] text-muted">Không bắt buộc. Linguo sẽ cho biết thời hạn có khả thi không, không hứa chắc kết quả.</p>
        <ChoiceList
          name="deadline-mode"
          labelledBy="deadline-heading"
          value={mode}
          onChange={onMode}
          options={DEADLINE_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        />
        {mode === 'date' && (
          <FormField label="Ngày mục tiêu" error={dateError}>
            {({ invalid, ...a11y }) => (
              <Input {...a11y} invalid={invalid} type="date" min={today} max={addDaysIso(today, 3650)} value={targetDate ?? ''} onChange={(e) => onTargetDate(e.target.value || null)} />
            )}
          </FormField>
        )}
        {(mode === 'weeks' || mode === 'months') && (
          <FormField label={mode === 'weeks' ? 'Số tuần' : 'Số tháng'} error={amountError}>
            {({ invalid, ...a11y }) => (
              <Input
                {...a11y}
                invalid={invalid}
                type="number"
                inputMode="numeric"
                min={1}
                max={mode === 'weeks' ? 520 : 120}
                value={amount ? String(amount) : ''}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  onAmount(Number.isFinite(n) && n > 0 ? Math.min(n, mode === 'weeks' ? 520 : 120) : undefined);
                }}
              />
            )}
          </FormField>
        )}
      </section>
    </div>
  );
}
