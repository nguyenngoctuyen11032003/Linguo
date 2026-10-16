import {
  addDaysIso,
  allowedTargets,
  isGoalForLanguage,
  isLanguageAvailable,
  isLevelAvailable,
  isTargetDateInRange,
  weeklyMinutesSchema,
  type LanguageCode,
  type OnboardingDraftData,
} from '@linguo/shared';
import { addMonthsIso } from '@/lib/dates';
import type { ScheduleValue } from '@/features/learning-paths/components/ScheduleEditor';
import { weekFromPreset } from '@/features/learning-paths/components/schedule';

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export function visibleSteps(data: OnboardingDraftData): StepNumber[] {
  return data.startPoint === 'new' ? [1, 2, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
}

export function scheduleOf(data: OnboardingDraftData): ScheduleValue {
  if (data.schedulePreset && data.weeklyMinutes) return { preset: data.schedulePreset, weeklyMinutes: data.weeklyMinutes };
  return { preset: '30', weeklyMinutes: weekFromPreset('30') };
}

export function resolveTargetDate(data: OnboardingDraftData, today: string): string | null {
  switch (data.deadlineMode) {
    case 'date':
      return data.targetDate ?? null;
    case 'weeks':
      return data.deadlineAmount ? addDaysIso(today, data.deadlineAmount * 7) : null;
    case 'months':
      return data.deadlineAmount ? addMonthsIso(today, data.deadlineAmount) : null;
    default:
      return null;
  }
}

export interface StepContext {
  taken: readonly LanguageCode[];
  today: string;
}

export function isStepValid(step: StepNumber, data: OnboardingDraftData, ctx: StepContext): boolean {
  switch (step) {
    case 1:
      // A restored draft may name a language that is no longer (or not yet) offered.
      return Boolean(data.language) && isLanguageAvailable(data.language as LanguageCode) && !ctx.taken.includes(data.language as LanguageCode);
    case 2:
      return Boolean(data.startPoint);
    case 3:
      return Boolean(data.language && data.currentLevel && isLevelAvailable(data.language, data.currentLevel));
    case 4:
      return Boolean(
        data.language &&
          data.currentLevel &&
          data.goalType &&
          data.targetLevel &&
          isGoalForLanguage(data.language, data.goalType) &&
          (allowedTargets(data.language, data.goalType, data.currentLevel) as string[]).includes(data.targetLevel),
      );
    case 5: {
      if (!weeklyMinutesSchema.safeParse(scheduleOf(data).weeklyMinutes).success) return false;
      if (data.deadlineMode === 'date' || data.deadlineMode === 'weeks' || data.deadlineMode === 'months') {
        const resolved = resolveTargetDate(data, ctx.today);
        return Boolean(resolved && isTargetDateInRange(resolved, ctx.today));
      }
      return true;
    }
    case 6:
      return true;
  }
}

const STEP_HINTS: Record<StepNumber, string> = {
  1: 'Chọn một ngôn ngữ để tiếp tục.',
  2: 'Chọn điểm xuất phát của bạn để tiếp tục.',
  3: 'Chọn trình độ hiện tại để tiếp tục.',
  4: 'Chọn mục tiêu và bậc muốn đạt để tiếp tục.',
  5: 'Kiểm tra lại thời gian học và thời hạn để tiếp tục.',
  6: '',
};

/** One line saying why "Tiếp tục" is disabled, or null when it is enabled. */
export function stepHint(step: StepNumber, valid: boolean, referenceReady: boolean): string | null {
  if (valid) return null;
  if (step >= 3 && !referenceReady) return 'Đang chờ bảng trình độ tải xong.';
  return STEP_HINTS[step] || null;
}

export { TARGET_DATE_PAST, TARGET_DATE_TOO_FAR, targetDateError } from '@/features/learning-paths/target-date';

/**
 * The step to show for a requested step: the requested step (snapped to a visible one), or the first earlier
 * visible step that is no longer valid (e.g. the language was taken meanwhile or the target date left the range).
 */
export function resolveStep(requested: number, data: OnboardingDraftData, ctx: StepContext): StepNumber {
  const steps = visibleSteps(data);
  const wanted = steps.find((s) => s >= requested) ?? steps[steps.length - 1] ?? 1;
  for (const s of steps) {
    if (s >= wanted) break;
    if (!isStepValid(s, data, ctx)) return s;
  }
  return wanted;
}
