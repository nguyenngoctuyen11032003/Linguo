import { useMemo, useState, type FormEvent } from 'react';
import {
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
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { ScheduleEditor, type ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';
import { presetFromWeek } from '@/features/learning-paths/components/schedule';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
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
}

export function PathPlanEditor({ path, onSaved, onCancel }: Props) {
  const { profile } = useProfile();
  const today = todayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const reference = useReferenceHours();
  const [goalType, setGoalType] = useState<GoalType>(path.goalType);
  const [targetLevel, setTargetLevel] = useState(path.targetLevel);
  const [schedule, setSchedule] = useState<ScheduleValue>({ preset: presetFromWeek(path.weeklyMinutes), weeklyMinutes: path.weeklyMinutes });
  const [targetDate, setTargetDate] = useState(path.targetDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = allowedTargets(path.language, goalType, path.currentLevel);
  const dateError = targetDate && targetDate < today ? 'Ngày mục tiêu đã qua.' : undefined;
  const parsed = updatePlanSchema.safeParse({
    language: path.language,
    goalType,
    currentLevel: path.currentLevel,
    targetLevel,
    weeklyMinutes: schedule.weeklyMinutes,
    targetDate: targetDate || null,
  });

  const estimate = useMemo(() => {
    if (!parsed.success || dateError || !reference.data) return null;
    try {
      return estimatePath({ ...parsed.data, today }, reference.data[path.language]);
    } catch {
      return null;
    }
  }, [parsed, dateError, reference.data, today, path.language]);

  const idBase = `plan-${path.id}`;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (dateError) {
      setError(dateError);
      return;
    }
    if (!parsed.success) {
      setError(Object.values(fieldErrors(parsed.error))[0] ?? 'Thông tin chưa hợp lệ.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { goalType: g, targetLevel: t, weeklyMinutes, targetDate: d } = parsed.data;
      onSaved(await updatePlan(requireSupabase(), path.id, { goalType: g, targetLevel: t, weeklyMinutes, targetDate: d }));
    } catch (err) {
      setError(learningPathErrorMessage(err));
    } finally {
      setSaving(false);
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
              setGoalType(g);
              setTargetLevel(defaultTarget(path.language, g, path.currentLevel) ?? '');
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
      <FormField label="Bậc mục tiêu" error={targets.length === 0 ? 'Bạn đã đạt mục tiêu này. Hãy chọn mục tiêu khác.' : undefined}>
        {({ invalid, ...a11y }) => (
          <select
            {...a11y}
            aria-invalid={invalid || undefined}
            value={targetLevel}
            onChange={(e) => setTargetLevel(e.target.value)}
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
        <ScheduleEditor value={schedule} onChange={setSchedule} labelledBy={`${idBase}-schedule`} />
      </div>
      <FormField label="Ngày mục tiêu (không bắt buộc)" error={dateError}>
        {({ invalid, ...a11y }) => (
          <Input {...a11y} invalid={invalid} type="date" min={today} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        )}
      </FormField>
      {estimate && <EstimateSummary estimate={estimate} />}
      {error && (
        <p role="alert" className="px-1 text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          Lưu kế hoạch
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
