import { describe, expect, it } from 'vitest';
import { addMonthsIso, formatDateVi, todayIso, weekdayIndex } from './dates';

describe('dates', () => {
  it('uses the user time zone for today and weekday', () => {
    const instant = new Date('2026-10-12T20:00:00Z'); // 13/10 03:00 in Ho Chi Minh, Monday 12/10 in New York
    expect(todayIso('Asia/Ho_Chi_Minh', instant)).toBe('2026-10-13');
    expect(todayIso('America/New_York', instant)).toBe('2026-10-12');
    expect(weekdayIndex('Asia/Ho_Chi_Minh', instant)).toBe(1); // Tuesday
    expect(weekdayIndex('America/New_York', instant)).toBe(0); // Monday
  });

  it('falls back to Asia/Ho_Chi_Minh on an invalid time zone', () => {
    const instant = new Date('2026-10-12T20:00:00Z');
    expect(todayIso('Not/AZone', instant)).toBe('2026-10-13');
    expect(weekdayIndex('Not/AZone', instant)).toBe(1);
    expect(todayIso('', instant)).toBe('2026-10-13');
  });

  it('zero-pads month and day', () => {
    expect(todayIso('UTC', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('adds months clamping to the last day', () => {
    expect(addMonthsIso('2026-10-13', 3)).toBe('2027-01-13');
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('formats Vietnamese dates', () => {
    expect(formatDateVi('2027-05-04')).toBe('04/05/2027');
  });
});
