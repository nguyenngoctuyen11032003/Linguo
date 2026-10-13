import { useRef, useState, type FormEvent } from 'react';
import {
  addDaysIso,
  allowedTargets,
  defaultTarget,
  DEFAULT_TIMEZONE,
  estimatePath,
  fieldErrors,
  GOAL_LABELS,
  GOALS_BY_LANGUAGE,
  LEVEL_INFO,
  updatePlanSchema,
  type GoalType,
} from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { ScheduleEditor, type ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';
import { presetFromWeek } from '@/features/learning-paths/components/schedule';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { targetDateError } from '@/features/learning-paths/target-date';
import { updatePlan, type LearningPath } from '@/features/learning-paths/service';
import { useReferenceHours } from '@/features/learning-paths/useReferenceHours';
import { useProfile } from '@/features/profile/ProfileProvider';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/dates';
import { requireSupabase } from '@/lib/supabase';

interface Props {
  path: LearningPath;
  onSaved: (path: LearningPath) => void;
  onCancel: () => void;
  /** Reports whether a save is in flight so the parent can disable the item's other actions. */
  onSavingChange?: (saving: boolean) => void;
}

export function PathPlanEditor({ path, onSaved, onCancel, onSavingChange }: Props) {
  const { profile } = useProfile();
  const today = todayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const reference = useReferenceHours();
  const [goalType, setGoalType] = useState<GoalType>(path.goalType);
  const [targetLevel, setTargetLevel] = useState(path.targetLevel);
  const [schedule, setSchedule] = useState<ScheduleValue>({ preset: presetFromWeek(path.weeklyMinutes), weeklyMinutes: path.weeklyMinutes });
  const [targetDate, setTargetDate] = useState(path.targetDate ?? '');
  const [saving, setSaving] = useState(false);
  /** Server/network failures only; validation problems are shown on their fields. */
  const [error, setError] = useState<string | null>(null);
  const targetRef = useRef<HTMLSelectElement>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const targets = allowedTargets(path.language, goalType, path.currentLevel);
  const noTargets = targets.length === 0;
  const dateError = targetDateError(targetDate, today);
  const parsed = updatePlanSchema.safeParse({
    language: path.language,
    goalType,
    currentLevel: path.currentLevel,
    targetLevel,
    weeklyMinutes: schedule.weeklyMinutes,
    targetDate: targetDate || null,
  });
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  const targetError = noTargets ? 'Bạn đã đạt mục tiêu này. Hãy chọn mục tiêu khác.' : errors.targetLevel;
  const scheduleError = errors.weeklyMinutes;

  let estimate = null;
  if (parsed.success && !dateError && reference.data) {
    try {
      estimate = estimatePath({ ...parsed.data, today }, reference.data[path.language]);
    } catch {
      estimate = null;
    }
  }

  const idBase = `plan-${path.id}`;

  function changed<T>(setter: (value: T) => void) {
    return (value: T) => {
      setError(null);
      setter(value);
    };
  }

  function focusFirstInvalid(): boolean {
    if (targetError) {
      targetRef.current?.focus();
      return true;
    }
    if (scheduleError) {
      scheduleRef.current?.querySelector<HTMLElement>('input')?.focus();
      return true;
    }
    if (dateError || errors.targetDate) {
      dateRef.current?.focus();
      return true;
    }
    return false;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (focusFirstInvalid()) return;
    if (!parsed.success) return;
    setSaving(true);
    onSavingChange?.(true);
    setError(null);
    try {
      const { goalType: g, targetLevel: t, weeklyMinutes, targetDate: d } = parsed.data;
      onSaved(await updatePlan(requireSupabase(), path.id, { goalType: g, targetLevel: t, weeklyMinutes, targetDate: d }));
    } catch (err) {
      setError(learningPathErrorMessage(err));
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  return (
    <form noValidate onSubmit={save} className="space-y-4 border-t border-border pt-4">
      <FormField label="Mục tiêu">
        {({ invalid, ...a11y }) => (
          <select
            {...a11y}
            aria-invalid={invalid || undefined}
            value={goalType}
            onChange={(e) => {
              const g = e.target.value as GoalType;
              setError(null);
              setGoalType(g);
              // Coming back to the saved goal restores the saved target instead of a fresh default.
              setTargetLevel(g === path.goalType ? path.targetLevel : (defaultTarget(path.language, g, path.currentLevel) ?? ''));
            }}
            className={cn(inputClasses(invalid), 'appearance-none')}
          >
            {GOALS_BY_LANGUAGE[path.language].map((g) => (
              <option key={g} value={g}>
                {GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label="Bậc mục tiêu" error={targetError}>
        {({ invalid, ...a11y }) => (
          <select
            {...a11y}
            ref={targetRef}
            aria-invalid={invalid || undefined}
            value={targetLevel}
            onChange={(e) => changed(setTargetLevel)(e.target.value)}
            className={cn(inputClasses(invalid), 'appearance-none')}
          >
            {targets.map((code) => (
              <option key={code} value={code}>
                {LEVEL_INFO[code].label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <div className="space-y-2">
        <h4 id={`${idBase}-schedule`} className="px-1 text-sm font-medium">
          Thời gian học
        </h4>
        <div ref={scheduleRef}>
          <ScheduleEditor value={schedule} onChange={changed(setSchedule)} labelledBy={`${idBase}-schedule`} error={scheduleError} />
        </div>
      </div>
      <FormField label="Ngày mục tiêu (không bắt buộc)" error={dateError ?? errors.targetDate}>
        {({ invalid, ...a11y }) => (
          <Input
            {...a11y}
            ref={dateRef}
            invalid={invalid}
            type="date"
            min={today}
            max={addDaysIso(today, 3650)}
            value={targetDate}
            onChange={(e) => changed(setTargetDate)(e.target.value)}
          />
        )}
      </FormField>
      {reference.status === 'error' && (
        <ErrorState title="Không tải được số giờ tham chiếu" headingLevel="h3" onRetry={reference.retry} />
      )}
      <div aria-live="polite">{estimate && <EstimateSummary estimate={estimate} />}</div>
      {error && (
        <p role="alert" className="px-1 text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} disabled={noTargets}>
          Lưu kế hoạch
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
