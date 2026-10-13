import { describe, expect, it } from 'vitest';
import { fieldErrors } from '../schemas';
import { createPathSchema, fromEstimateRecord, isoDateSchema, onboardingDraftSchema, updatePlanSchema, weeklyMinutesSchema } from './schemas';

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

  it('rejects impossible and out-of-range calendar dates', () => {
    expect(isoDateSchema.safeParse('2026-02-31').success).toBe(false);
    expect(isoDateSchema.safeParse('0050-01-01').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(isoDateSchema.safeParse('2027-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('1900-01-01').success).toBe(true);
    const r = updatePlanSchema.safeParse({ ...valid, targetDate: '2026-02-31' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).targetDate).toBe('Ngày không hợp lệ.');
  });

  it('reports Vietnamese messages for schedule and draft checks', () => {
    const negative = updatePlanSchema.safeParse({ ...valid, weeklyMinutes: [-5, 0, 0, 0, 0, 0, 0] });
    expect(negative.success).toBe(false);
    if (!negative.success) expect(fieldErrors(negative.error).weeklyMinutes).toBe('Số phút không hợp lệ.');

    const fractional = updatePlanSchema.safeParse({ ...valid, weeklyMinutes: [30.5, 0, 0, 0, 0, 0, 0] });
    if (!fractional.success) expect(fieldErrors(fractional.error).weeklyMinutes).toBe('Số phút không hợp lệ.');
    expect(fractional.success).toBe(false);

    const short = updatePlanSchema.safeParse({ ...valid, weeklyMinutes: [30, 30, 30, 30, 30, 30] });
    expect(short.success).toBe(false);
    if (!short.success) expect(fieldErrors(short.error).weeklyMinutes).toBe('Lịch học cần đủ 7 ngày.');

    const direct = weeklyMinutesSchema.safeParse([30, 30, 30]);
    if (!direct.success) expect(direct.error.issues.every((i) => i.message === 'Lịch học cần đủ 7 ngày.')).toBe(true);

    const draft = onboardingDraftSchema.safeParse({ version: 1, step: 2, data: { weeklyMinutes: [-5, 0, 0, 0, 0, 0, 0] } });
    expect(draft.success).toBe(false);
    if (!draft.success) expect(draft.error.issues[0]?.message).toBe('Số phút không hợp lệ.');
    const draftShort = onboardingDraftSchema.safeParse({ version: 1, step: 2, data: { weeklyMinutes: [1, 2] } });
    if (!draftShort.success) expect(draftShort.error.issues[0]?.message).toBe('Lịch học cần đủ 7 ngày.');
    expect(draftShort.success).toBe(false);
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
