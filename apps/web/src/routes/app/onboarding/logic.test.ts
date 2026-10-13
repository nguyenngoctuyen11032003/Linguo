import { describe, expect, it } from 'vitest';
import { isStepValid, resolveTargetDate, scheduleOf, visibleSteps } from './logic';

const today = '2026-10-13';

describe('onboarding logic', () => {
  it('skips the current-level step for complete beginners', () => {
    expect(visibleSteps({ startPoint: 'new' })).toEqual([1, 2, 4, 5, 6]);
    expect(visibleSteps({ startPoint: 'some' })).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('defaults the schedule to 30 minutes a day', () => {
    expect(scheduleOf({})).toEqual({ preset: '30', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30] });
  });

  it('resolves deadlines', () => {
    expect(resolveTargetDate({}, today)).toBeNull();
    expect(resolveTargetDate({ deadlineMode: 'date', targetDate: '2027-01-01' }, today)).toBe('2027-01-01');
    expect(resolveTargetDate({ deadlineMode: 'weeks', deadlineAmount: 4 }, today)).toBe('2026-11-10');
    expect(resolveTargetDate({ deadlineMode: 'months', deadlineAmount: 3 }, today)).toBe('2027-01-13');
  });

  it('validates each step', () => {
    const ctx = { taken: ['ko' as const], today };
    expect(isStepValid(1, { language: 'en' }, ctx)).toBe(true);
    expect(isStepValid(1, { language: 'ko' }, ctx)).toBe(false);
    expect(isStepValid(2, { startPoint: 'rusty' }, ctx)).toBe(true);
    expect(isStepValid(3, { language: 'en', currentLevel: 'topik1' }, ctx)).toBe(false);
    expect(isStepValid(4, { language: 'en', currentLevel: 'a2', goalType: 'cefr', targetLevel: 'a1' }, ctx)).toBe(false);
    expect(isStepValid(4, { language: 'en', currentLevel: 'a2', goalType: 'cefr', targetLevel: 'b2' }, ctx)).toBe(true);
    expect(isStepValid(5, { schedulePreset: 'custom', weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'date', targetDate: '2026-10-01' }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'weeks' }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'weeks', deadlineAmount: 8 }, ctx)).toBe(true);
  });
});
