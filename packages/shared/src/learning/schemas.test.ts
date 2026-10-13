import { describe, expect, it } from 'vitest';
import { fieldErrors } from '../schemas';
import { createPathSchema, fromEstimateRecord, onboardingDraftSchema, updatePlanSchema, weeklyMinutesSchema } from './schemas';

const valid = {
  language: 'en',
  startPoint: 'some',
  goalType: 'daily_communication',
  currentLevel: 'a2',
  targetLevel: 'b1',
  weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
  targetDate: null,
} as const;

describe('learning schemas', () => {
  it('accepts a valid path', () => {
    expect(createPathSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects mismatched goal, target not above current and empty schedule', () => {
    const goal = createPathSchema.safeParse({ ...valid, goalType: 'topik_i' });
    expect(goal.success).toBe(false);
    if (!goal.success) expect(fieldErrors(goal.error).goalType).toBe('Mục tiêu không phù hợp với ngôn ngữ đã chọn.');

    const target = updatePlanSchema.safeParse({ ...valid, targetLevel: 'a1' });
    expect(target.success).toBe(false);
    if (!target.success) expect(fieldErrors(target.error).targetLevel).toBe('Hãy chọn bậc mục tiêu phù hợp và cao hơn trình độ hiện tại.');

    const week = weeklyMinutesSchema.safeParse([0, 0, 0, 0, 0, 0, 0]);
    expect(week.success).toBe(false);
    expect(weeklyMinutesSchema.safeParse([721, 0, 0, 0, 0, 0, 0]).success).toBe(false);
  });

  it('validates the onboarding draft shape', () => {
    expect(onboardingDraftSchema.safeParse({ version: 1, step: 2, data: { language: 'ko' } }).success).toBe(true);
    expect(onboardingDraftSchema.safeParse({ version: 2, step: 2, data: {} }).success).toBe(false);
    expect(onboardingDraftSchema.safeParse({ version: 1, step: 9, data: {} }).success).toBe(false);
  });

  it('maps a stored estimate record to camelCase', () => {
    expect(
      fromEstimateRecord({
        hours_needed: 185,
        weeks_min: 43,
        weeks_mid: 53,
        weeks_max: 69,
        feasibility: 'no_deadline',
        suggested_minutes_per_day: null,
        suggested_date: null,
        assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
      }),
    ).toEqual({
      hoursNeeded: 185,
      weeksMin: 43,
      weeksMid: 53,
      weeksMax: 69,
      feasibility: 'no_deadline',
      suggestedMinutesPerDay: null,
      suggestedDate: null,
      assumptions: { weeklyMinutes: 210, hoursNeeded: 185, referenceReviewed: false, multiplierRange: [0.8, 1.3] },
    });
  });
});
