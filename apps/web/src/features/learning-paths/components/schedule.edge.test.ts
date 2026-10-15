import { describe, expect, it } from 'vitest';
import { PRESET_LABELS, PRESET_MINUTES, WEEKDAYS, formatMinutes, presetFromWeek, weekFromPreset } from './schedule';

describe('schedule helpers', () => {
  it('has seven Monday-first weekdays', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0].short).toBe('T2');
    expect(WEEKDAYS[6].short).toBe('CN');
  });

  it.each(Object.keys(PRESET_MINUTES) as Array<keyof typeof PRESET_MINUTES>)('preset %s round-trips', (p) => {
    const week = weekFromPreset(p);
    expect(week).toEqual(Array(7).fill(PRESET_MINUTES[p]));
    expect(presetFromWeek(week)).toBe(p);
    expect(PRESET_LABELS[p]).toBeTruthy();
  });

  it('returns a fresh array each time', () => {
    const a = weekFromPreset('30');
    a[0] = 999;
    expect(weekFromPreset('30')[0]).toBe(30);
  });

  it.each([
    [[]],
    [[30, 30, 30, 30, 30, 30, 31]],
    [[0, 0, 0, 0, 0, 0, 0]],
    [[45, 45, 45, 45, 45, 45, 45]],
  ])('week %j is custom', (week) => {
    expect(presetFromWeek(week)).toBe('custom');
  });

  it.each([
    [0, '0 phút'], [1, '1 phút'], [59, '59 phút'], [60, '1 giờ'], [61, '1 giờ 1 phút'], [90, '1 giờ 30 phút'], [720, '12 giờ'],
  ])('formatMinutes(%i) = %s', (n, text) => {
    expect(formatMinutes(n)).toBe(text);
  });
});
