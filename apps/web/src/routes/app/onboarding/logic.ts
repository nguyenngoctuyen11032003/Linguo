import {
  addDaysIso,
  allowedTargets,
  isGoalForLanguage,
  isLevelOf,
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

interface StepContext {
  taken: readonly LanguageCode[];
  today: string;
}

export function isStepValid(step: StepNumber, data: OnboardingDraftData, ctx: StepContext): boolean {
  switch (step) {
    case 1:
      return Boolean(data.language) && !ctx.taken.includes(data.language as LanguageCode);
    case 2:
      return Boolean(data.startPoint);
    case 3:
      return Boolean(data.language && data.currentLevel && isLevelOf(data.language, data.currentLevel));
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
      if (data.deadlineMode === 'date') {
        const max = addDaysIso(ctx.today, 3650);
        return Boolean(data.targetDate && data.targetDate >= ctx.today && data.targetDate <= max);
      }
      if (data.deadlineMode === 'weeks' || data.deadlineMode === 'months') return Boolean(data.deadlineAmount && data.deadlineAmount >= 1);
      return true;
    }
    case 6:
      return true;
  }
}
