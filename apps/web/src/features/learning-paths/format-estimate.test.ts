import { describe, expect, it } from 'vitest';
import type { EstimateResult } from '@linguo/shared';
import { estimateRange, formatEstimate, isLongEstimate, nudgeMinutesPerDay } from './format-estimate';

describe('estimateRange', () => {
  it('gives the numbers and unit formatEstimate words', () => {
    expect(estimateRange(12, 8)).toEqual({ min: 8, max: 12, unit: 'tuần' });
    expect(estimateRange(43, 69)).toEqual({ min: 10, max: 16, unit: 'tháng' });
    expect(estimateRange(264, 428)).toEqual({ min: 5, max: 8, unit: 'năm' });
  });
});

describe('formatEstimate', () => {
  it('keeps short plans in weeks, up to 12 weeks', () => {
    expect(formatEstimate(8, 12)).toBe('khoảng 8–12 tuần');
    expect(formatEstimate(6, 6)).toBe('khoảng 6 tuần');
  });

  it('switches to months above 12 weeks', () => {
    expect(formatEstimate(10, 13)).toBe('khoảng 2–3 tháng');
    expect(formatEstimate(26, 39)).toBe('khoảng 6–9 tháng');
    expect(formatEstimate(43, 69)).toBe('khoảng 10–16 tháng');
    expect(formatEstimate(95, 103)).toBe('khoảng 22–24 tháng');
  });

  it('switches to years from 104 weeks', () => {
    expect(formatEstimate(264, 428)).toBe('khoảng 5–8 năm');
    expect(formatEstimate(104, 104)).toBe('khoảng 2 năm');
    expect(formatEstimate(90, 110)).toBe('khoảng 2 năm');
  });

  it('collapses a range that rounds to one number', () => {
    expect(formatEstimate(12, 13)).toBe('khoảng 3 tháng');
  });

  it('can start a sentence', () => {
    expect(formatEstimate(264, 428, { capitalize: true })).toBe('Khoảng 5–8 năm');
  });
});

function estimate(overrides: Partial<EstimateResult> & { weeklyMinutes?: number } = {}): EstimateResult {
  const { weeklyMinutes = 105, ...rest } = overrides;
  return {
    hoursNeeded: 605,
    weeksMin: 264,
    weeksMid: 346,
    weeksMax: 428,
    feasibility: 'no_deadline',
    suggestedMinutesPerDay: null,
    suggestedDate: null,
    assumptions: { weeklyMinutes, hoursNeeded: 605, multiplierRange: [0.8, 1.3], referenceReviewed: true },
    ...rest,
  } as EstimateResult;
}

describe('nudgeMinutesPerDay', () => {
  it('is null while the plan is two years or shorter', () => {
    expect(isLongEstimate(104)).toBe(false);
    expect(nudgeMinutesPerDay(estimate({ weeksMax: 104 }))).toBeNull();
  });

  it('reuses suggestedMinutesPerDay when there is one', () => {
    expect(nudgeMinutesPerDay(estimate({ suggestedMinutesPerDay: 40 }))).toBe(40);
  });

  it('derives a rounded suggestion for a long plan without a deadline', () => {
    expect(isLongEstimate(428)).toBe(true);
    expect(nudgeMinutesPerDay(estimate())).toBe(50);
  });

  it('is null when the learner already studies more than the derived amount', () => {
    expect(nudgeMinutesPerDay(estimate({ weeklyMinutes: 700 }))).toBeNull();
  });
});
