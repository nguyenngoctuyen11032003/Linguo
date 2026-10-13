import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';
import { FEASIBILITIES, type EstimateResult } from './estimate';
import { allowedTargets, GOAL_TYPES, isGoalForLanguage, isLevelOf, START_POINTS } from './levels';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày không hợp lệ.' });

export const weeklyMinutesSchema = z
  .array(z.number().int().min(0).max(720, { message: 'Tối đa 720 phút mỗi ngày.' }))
  .length(7)
  .refine((week) => week.some((m) => m > 0), { message: 'Hãy chọn ít nhất một ngày học.' });

const planShape = {
  language: z.enum(LANGUAGE_CODES),
  goalType: z.enum(GOAL_TYPES),
  currentLevel: z.string(),
  targetLevel: z.string(),
  weeklyMinutes: weeklyMinutesSchema,
  targetDate: isoDateSchema.nullable(),
};

type PlanFields = { language: (typeof LANGUAGE_CODES)[number]; goalType: (typeof GOAL_TYPES)[number]; currentLevel: string; targetLevel: string };

function refinePlan(value: PlanFields, ctx: z.RefinementCtx) {
  if (!isGoalForLanguage(value.language, value.goalType)) {
    ctx.addIssue({ code: 'custom', path: ['goalType'], message: 'Mục tiêu không phù hợp với ngôn ngữ đã chọn.' });
    return;
  }
  if (!isLevelOf(value.language, value.currentLevel)) {
    ctx.addIssue({ code: 'custom', path: ['currentLevel'], message: 'Trình độ không hợp lệ.' });
    return;
  }
  if (!(allowedTargets(value.language, value.goalType, value.currentLevel) as string[]).includes(value.targetLevel)) {
    ctx.addIssue({ code: 'custom', path: ['targetLevel'], message: 'Hãy chọn bậc mục tiêu phù hợp và cao hơn trình độ hiện tại.' });
  }
}

export const createPathSchema = z.object({ ...planShape, startPoint: z.enum(START_POINTS) }).superRefine(refinePlan);
export const updatePlanSchema = z.object(planShape).superRefine(refinePlan);
export type CreatePathInput = z.infer<typeof createPathSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const SCHEDULE_PRESETS = ['15', '30', '60', '120', 'custom'] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];
export const DEADLINE_MODES = ['none', 'date', 'weeks', 'months'] as const;
export type DeadlineMode = (typeof DEADLINE_MODES)[number];

export const onboardingDraftSchema = z.object({
  version: z.literal(1),
  step: z.number().int().min(1).max(6),
  data: z.object({
    language: z.enum(LANGUAGE_CODES).optional(),
    startPoint: z.enum(START_POINTS).optional(),
    currentLevel: z.string().max(16).optional(),
    goalType: z.enum(GOAL_TYPES).optional(),
    targetLevel: z.string().max(16).optional(),
    schedulePreset: z.enum(SCHEDULE_PRESETS).optional(),
    weeklyMinutes: z.array(z.number().int().min(0).max(720)).length(7).optional(),
    deadlineMode: z.enum(DEADLINE_MODES).optional(),
    targetDate: isoDateSchema.nullable().optional(),
    deadlineAmount: z.number().int().min(1).max(520).optional(),
  }),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type OnboardingDraftData = OnboardingDraft['data'];

/** Shape of `learning_paths.estimate` (written by SQL, snake_case). */
export const estimateRecordSchema = z.object({
  hours_needed: z.number(),
  weeks_min: z.number(),
  weeks_mid: z.number(),
  weeks_max: z.number(),
  feasibility: z.enum(FEASIBILITIES),
  suggested_minutes_per_day: z.number().nullable(),
  suggested_date: z.string().nullable(),
  assumptions: z.object({
    weekly_minutes: z.number(),
    hours_needed: z.number(),
    reference_reviewed: z.boolean(),
    multiplier_range: z.tuple([z.number(), z.number()]),
  }),
});

export function fromEstimateRecord(raw: unknown): EstimateResult {
  const r = estimateRecordSchema.parse(raw);
  return {
    hoursNeeded: r.hours_needed,
    weeksMin: r.weeks_min,
    weeksMid: r.weeks_mid,
    weeksMax: r.weeks_max,
    feasibility: r.feasibility,
    suggestedMinutesPerDay: r.suggested_minutes_per_day,
    suggestedDate: r.suggested_date,
    assumptions: {
      weeklyMinutes: r.assumptions.weekly_minutes,
      hoursNeeded: r.assumptions.hours_needed,
      referenceReviewed: r.assumptions.reference_reviewed,
      multiplierRange: r.assumptions.multiplier_range,
    },
  };
}
