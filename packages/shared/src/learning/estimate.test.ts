import { describe, expect, it } from 'vitest';
import fixtures from './estimate.fixtures.json';
import { addDaysIso, estimatePath, EstimateError, type ReferenceHours } from './estimate';

const reference = (language: 'en' | 'ko', reviewed = false): ReferenceHours[] =>
  fixtures.referenceHours[language].map((r) => ({ ...r, reviewed }));

describe('estimatePath (shared fixtures, mirrored by SQL)', () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const result = estimatePath(
        { currentLevel: c.currentLevel, targetLevel: c.targetLevel, weeklyMinutes: c.weeklyMinutes, targetDate: c.targetDate, today: fixtures.today },
        reference(c.language as 'en' | 'ko'),
      );
      expect({
        hoursNeeded: result.hoursNeeded,
        weeksMin: result.weeksMin,
        weeksMid: result.weeksMid,
        weeksMax: result.weeksMax,
        feasibility: result.feasibility,
        suggestedMinutesPerDay: result.suggestedMinutesPerDay,
        suggestedDate: result.suggestedDate,
      }).toEqual(c.expected);
    });
  }
});

describe('estimatePath details', () => {
  it('reports assumptions and the unreviewed reference table', () => {
    const r = estimatePath(
      { currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' },
      reference('en'),
    );
    expect(r.assumptions).toEqual({ weeklyMinutes: 210, hoursNeeded: 185, referenceReviewed: false, multiplierRange: [0.8, 1.3] });
    expect(estimatePath({ currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' }, reference('en', true)).assumptions.referenceReviewed).toBe(true);
  });

  it('rejects unknown levels and empty schedules', () => {
    const base = { currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' };
    expect(() => estimatePath({ ...base, targetLevel: 'z9' }, reference('en'))).toThrow(EstimateError);
    expect(() => estimatePath({ ...base, weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] }, reference('en'))).toThrow('invalid_schedule');
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDaysIso('2026-10-13', 203)).toBe('2027-05-04');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });
});
