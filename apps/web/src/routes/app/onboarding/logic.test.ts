import { describe, expect, it } from 'vitest';
import { isStepValid, resolveStep, resolveTargetDate, scheduleOf, stepHint, targetDateError, visibleSteps } from './logic';

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

  it('rejects Japanese levels without a program (restored drafts included)', () => {
    const ctx = { taken: [], today };
    expect(isStepValid(3, { language: 'ja', currentLevel: 'n3' }, ctx)).toBe(true);
    expect(isStepValid(3, { language: 'ja', currentLevel: 'n2' }, ctx)).toBe(false);
    expect(isStepValid(4, { language: 'ja', currentLevel: 'n4', goalType: 'jlpt', targetLevel: 'n3' }, ctx)).toBe(true);
    expect(isStepValid(4, { language: 'ja', currentLevel: 'n4', goalType: 'jlpt', targetLevel: 'n2' }, ctx)).toBe(false);
  });

  it('bounds the deadline to ten years for dates, weeks and months', () => {
    const ctx = { taken: [], today };
    expect(isStepValid(5, { deadlineMode: 'date', targetDate: '2036-10-10' }, ctx)).toBe(true);
    expect(isStepValid(5, { deadlineMode: 'date', targetDate: '2036-10-11' }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'months', deadlineAmount: 120 }, ctx)).toBe(false);
    expect(isStepValid(5, { deadlineMode: 'months', deadlineAmount: 119 }, ctx)).toBe(true);
    expect(isStepValid(5, { deadlineMode: 'weeks', deadlineAmount: 520 }, ctx)).toBe(true);
    expect(targetDateError('2040-01-01', today)).toBe('Ngày mục tiêu quá xa (tối đa 10 năm).');
    expect(targetDateError('2026-10-01', today)).toBe('Ngày mục tiêu đã qua.');
    expect(targetDateError('2027-01-01', today)).toBeUndefined();
  });

  it('pulls a restored step back to the first invalid earlier step', () => {
    const full = { language: 'en' as const, startPoint: 'some' as const, currentLevel: 'a2', goalType: 'cefr' as const, targetLevel: 'b2' };
    const ctx = { taken: [], today };
    expect(resolveStep(6, full, ctx)).toBe(6);
    expect(resolveStep(6, { ...full, deadlineMode: 'date', targetDate: '2040-01-01' }, ctx)).toBe(5);
    expect(resolveStep(6, full, { taken: ['en'], today })).toBe(1);
    expect(resolveStep(4, { ...full, currentLevel: undefined }, ctx)).toBe(3);
    expect(resolveStep(3, { ...full, startPoint: 'new' }, ctx)).toBe(4);
    expect(resolveStep(2, {}, ctx)).toBe(1);
  });

  it('says why "Tiếp tục" is disabled, and nothing once the step is valid', () => {
    expect(stepHint(1, false, true)).toBe('Chọn một ngôn ngữ để tiếp tục.');
    expect(stepHint(5, false, true)).toBe('Kiểm tra lại thời gian học và thời hạn để tiếp tục.');
    expect(stepHint(3, false, false)).toBe('Đang chờ bảng trình độ tải xong.');
    expect(stepHint(1, false, false)).toBe('Chọn một ngôn ngữ để tiếp tục.');
    expect(stepHint(2, true, true)).toBeNull();
    expect(stepHint(6, false, true)).toBeNull();
  });
});
