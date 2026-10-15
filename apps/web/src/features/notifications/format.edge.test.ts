import { REMINDER_RULES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { formatRelativeTimeVi, unreadBadgeText, unreadLabel } from './format';
import { isInQuietHours, isTime, normalizeDays, toggleDay, validateReminderDraft, type ReminderDraft } from './validation';

const NOW = new Date('2026-10-15T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTimeVi boundaries', () => {
  it.each([
    [0, 'Vừa xong'],
    [59_999, 'Vừa xong'],
    [MIN, '1 phút trước'],
    [59 * MIN + 59_999, '59 phút trước'],
    [HOUR, '1 giờ trước'],
    [DAY - 1, '23 giờ trước'],
    [DAY, 'Hôm qua'],
    [2 * DAY - 1, 'Hôm qua'],
    [2 * DAY, '2 ngày trước'],
    [6 * DAY + HOUR, '6 ngày trước'],
  ])('%i ms ago -> %s', (ms, text) => {
    expect(formatRelativeTimeVi(ago(ms), NOW)).toBe(text);
  });

  it('a timestamp in the future (clock skew) reads as just now', () => {
    expect(formatRelativeTimeVi(new Date(NOW.getTime() + 5 * DAY).toISOString(), NOW)).toBe('Vừa xong');
  });

  it.each(['', 'garbage', 'not-a-date'])('invalid input %j gives an empty string', (iso) => {
    expect(formatRelativeTimeVi(iso, NOW)).toBe('');
  });

  it('older than a week is a zero-padded dd/mm/yyyy', () => {
    expect(formatRelativeTimeVi(new Date(2026, 0, 5, 12).toISOString(), new Date(2026, 5, 1))).toBe('05/01/2026');
  });
});

describe('badge text', () => {
  it.each([[0, '0'], [1, '1'], [9, '9'], [10, '9+'], [1000, '9+']])('badge %i -> %s', (n, t) => expect(unreadBadgeText(n)).toBe(t));
  it.each([
    [0, 'Thông báo'], [-3, 'Thông báo'], [1, 'Thông báo, 1 thông báo chưa đọc'], [9, 'Thông báo, 9 thông báo chưa đọc'],
    [10, 'Thông báo, hơn 9 thông báo chưa đọc'],
  ])('label %i -> %s', (n, t) => expect(unreadLabel(n)).toBe(t));
});

describe('isInQuietHours boundaries', () => {
  it.each([
    ['22:00', '22:00', '07:00', true],
    ['21:59', '22:00', '07:00', false],
    ['06:59', '22:00', '07:00', true],
    ['07:00', '22:00', '07:00', false],
    ['00:00', '22:00', '07:00', true],
    ['23:59', '22:00', '07:00', true],
    ['12:00', '13:00', '14:00', false],
    ['13:00', '13:00', '14:00', true],
    ['14:00', '13:00', '14:00', false],
    ['10:00', '10:00', '10:00', false],
    ['00:00', '00:00', '23:59', true],
    ['23:59', '00:00', '23:59', false],
  ])('%s in %s-%s -> %s', (t, s, e, expected) => {
    expect(isInQuietHours(t, s, e)).toBe(expected);
  });

  it.each(['', '24:00', '7:00', '07:60', '07:00:00', '07-00', ' 07:00', '٠٧:٠٠'])('rejects the time %j', (t) => {
    expect(isTime(t)).toBe(false);
    expect(isInQuietHours(t, '22:00', '07:00')).toBe(false);
  });
});

describe('days', () => {
  it('normalizes junk: dupes, out of range, non-integers, NaN', () => {
    expect(normalizeDays([7, 1, 1, 0, 8, -1, 3.5, NaN, 3])).toEqual([1, 3, 7]);
    expect(normalizeDays([])).toEqual([]);
  });

  it('toggling twice is the identity and never mutates its input', () => {
    const days = Object.freeze([1, 3, 5]);
    expect(toggleDay(toggleDay(days, 4), 4)).toEqual([1, 3, 5]);
    expect(toggleDay(days, 8)).toEqual([1, 3, 5]);
    expect(days).toEqual([1, 3, 5]);
  });
});

describe('validateReminderDraft extra cases', () => {
  const ok: ReminderDraft = { reminders_enabled: true, remind_at: '19:30', remind_days: [1, 2], quiet_start: '22:00', quiet_end: '07:00', max_per_day: 2, weekly_summary: true };
  const { max_per_day_min: lo, max_per_day_max: hi } = REMINDER_RULES;

  it('a disabled reminder may have no days and a time inside quiet hours', () => {
    expect(validateReminderDraft({ ...ok, reminders_enabled: false, remind_days: [], remind_at: '23:00' })).toEqual({});
  });

  it('format errors win over the quiet-hours conflict', () => {
    const e = validateReminderDraft({ ...ok, remind_at: '25:00' });
    expect(Object.keys(e)).toEqual(['remind_at']);
    expect(e.remind_at).toMatch(/giờ:phút/);
  });

  it.each([lo - 1, lo, hi, hi + 1, 0.5, lo + 0.5, NaN, Infinity, -1, 1000])('max_per_day %f is valid only as an integer within bounds', (n) => {
    const valid = Number.isInteger(n) && n >= lo && n <= hi;
    expect(validateReminderDraft({ ...ok, max_per_day: n }).max_per_day === undefined).toBe(valid);
  });

  it('messages never expose raw field names', () => {
    const e = validateReminderDraft({ ...ok, remind_at: 'x', quiet_start: 'y', remind_days: [], max_per_day: 99 });
    expect(Object.keys(e).length).toBeGreaterThanOrEqual(3);
    for (const m of Object.values(e)) expect(m).not.toMatch(/remind_|quiet_|max_per_day/);
  });
});
