import { describe, expect, it } from 'vitest';
import { addMonthsIso, formatDateVi, todayIso, weekdayIndex } from './dates';

describe('todayIso across the Ho Chi Minh / UTC midnight boundary (UTC+7)', () => {
  it.each([
    ['2026-10-15T16:59:59Z', '2026-10-15', '2026-10-15'],
    ['2026-10-15T17:00:00Z', '2026-10-16', '2026-10-15'],
    ['2026-10-15T23:59:59Z', '2026-10-16', '2026-10-15'],
    ['2026-10-16T00:00:00Z', '2026-10-16', '2026-10-16'],
    ['2026-12-31T17:00:00Z', '2027-01-01', '2026-12-31'],
    ['2028-02-28T17:00:00Z', '2028-02-29', '2028-02-28'],
    ['2027-02-28T17:00:00Z', '2027-03-01', '2027-02-28'],
  ])('%s -> HCM %s, UTC %s', (instant, hcm, utc) => {
    const at = new Date(instant);
    expect(todayIso('Asia/Ho_Chi_Minh', at)).toBe(hcm);
    expect(todayIso('UTC', at)).toBe(utc);
  });

  it('weekday follows the same boundary (Monday=0)', () => {
    const at = new Date('2026-10-18T18:00:00Z'); // Sunday 18/10 UTC, Monday 19/10 in HCM
    expect(weekdayIndex('UTC', at)).toBe(6);
    expect(weekdayIndex('Asia/Ho_Chi_Minh', at)).toBe(0);
  });
});

describe('todayIso across DST changes', () => {
  it('New York spring forward (2026-03-08): the local day is continuous', () => {
    expect(todayIso('America/New_York', new Date('2026-03-08T06:59:59Z'))).toBe('2026-03-08'); // 01:59 EST
    expect(todayIso('America/New_York', new Date('2026-03-08T07:00:00Z'))).toBe('2026-03-08'); // 03:00 EDT
    expect(todayIso('America/New_York', new Date('2026-03-09T03:59:59Z'))).toBe('2026-03-08'); // 23:59 EDT
    expect(todayIso('America/New_York', new Date('2026-03-09T04:00:00Z'))).toBe('2026-03-09');
  });

  it('New York fall back (2026-11-01): midnight moves with the offset', () => {
    expect(todayIso('America/New_York', new Date('2026-11-01T03:59:59Z'))).toBe('2026-10-31'); // 23:59 EDT
    expect(todayIso('America/New_York', new Date('2026-11-01T04:00:00Z'))).toBe('2026-11-01'); // 00:00 EDT
    expect(todayIso('America/New_York', new Date('2026-11-02T04:59:59Z'))).toBe('2026-11-01'); // 23:59 EST
    expect(todayIso('America/New_York', new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });

  it('Vietnam has no DST: the offset never changes', () => {
    for (const month of ['01', '04', '07', '10']) {
      expect(todayIso('Asia/Ho_Chi_Minh', new Date(`2026-${month}-10T17:00:00Z`))).toBe(`2026-${month}-11`);
    }
  });
});

describe('addMonthsIso', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-01-15', 0, '2026-01-15'],
    ['2026-01-15', 12, '2027-01-15'],
    ['2026-01-15', -12, '2025-01-15'],
    ['2026-01-15', -1, '2025-12-15'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-01-15', -13, '2024-12-15'],
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-02-29', 48, '2028-02-29'],
    ['2026-10-13', 120, '2036-10-13'],
  ])('%s %+d months = %s', (iso, months, expected) => {
    expect(addMonthsIso(iso, months)).toBe(expected);
  });

  it('always returns a calendar-valid date in the right month (property over a sweep)', () => {
    for (let m = -30; m <= 30; m++) {
      for (const d of [1, 28, 29, 30, 31]) {
        const out = addMonthsIso(`2027-01-${String(d).padStart(2, '0')}`, m);
        const [y, mo, day] = out.split('-').map(Number) as [number, number, number];
        const expectedIndex = 2027 * 12 + m;
        expect(y * 12 + (mo - 1)).toBe(expectedIndex);
        expect(day).toBeLessThanOrEqual(new Date(Date.UTC(y, mo, 0)).getUTCDate());
        expect(day).toBeLessThanOrEqual(d);
      }
    }
  });
});

describe('formatDateVi', () => {
  it.each([
    ['2027-05-04', '04/05/2027'],
    ['2026-12-31', '31/12/2026'],
    ['2000-01-01', '01/01/2000'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatDateVi(iso)).toBe(expected);
  });
});
