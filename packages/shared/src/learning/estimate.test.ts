import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../constants';
import fixtures from './estimate.fixtures.json';
import { addDaysIso, estimatePath, EstimateError, isoToUtcDays, isTargetDateInRange, type ReferenceHours } from './estimate';

const reference = (language: LanguageCode, reviewed = false): ReferenceHours[] =>
  fixtures.referenceHours[language].map((r) => ({ ...r, reviewed }));

describe('estimatePath (shared fixtures, mirrored by SQL)', () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const result = estimatePath(
        { currentLevel: c.currentLevel, targetLevel: c.targetLevel, weeklyMinutes: c.weeklyMinutes, targetDate: c.targetDate, today: fixtures.today },
        reference(c.language as LanguageCode),
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

  it('throws invalid_date for malformed or impossible dates', () => {
    const base = { currentLevel: 'a2', targetLevel: 'b1', weeklyMinutes: [30, 30, 30, 30, 30, 30, 30], targetDate: null, today: '2026-10-13' };
    expect(() => estimatePath({ ...base, today: 'abc' }, reference('en'))).toThrow('invalid_date');
    expect(() => estimatePath({ ...base, today: '2026-02-31' }, reference('en'))).toThrow(EstimateError);
    expect(() => estimatePath({ ...base, targetDate: '2027-13-01' }, reference('en'))).toThrow('invalid_date');
    expect(() => estimatePath({ ...base, targetDate: 'not-a-date' }, reference('en'))).toThrow(EstimateError);
    expect(() => estimatePath({ ...base, targetDate: '2027-01-13' }, reference('en'))).not.toThrow();
  });

  it('isoToUtcDays returns NaN for malformed input', () => {
    expect(isoToUtcDays('')).toBeNaN();
    expect(isoToUtcDays('2026-10')).toBeNaN();
    expect(isoToUtcDays('2026-02-30')).toBeNaN();
    expect(isoToUtcDays('1970-01-02')).toBe(1);
  });

  it('checks the target date window (today .. today + 3650 days)', () => {
    expect(isTargetDateInRange('2026-10-13', '2026-10-13')).toBe(true);
    expect(isTargetDateInRange('2026-10-12', '2026-10-13')).toBe(false);
    expect(isTargetDateInRange(addDaysIso('2026-10-13', 3650), '2026-10-13')).toBe(true);
    expect(isTargetDateInRange(addDaysIso('2026-10-13', 3651), '2026-10-13')).toBe(false);
    expect(isTargetDateInRange('2026-02-31', '2026-10-13')).toBe(false);
    expect(isTargetDateInRange('2027-01-01', 'bad')).toBe(false);
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDaysIso('2026-10-13', 203)).toBe('2027-05-04');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });
});
