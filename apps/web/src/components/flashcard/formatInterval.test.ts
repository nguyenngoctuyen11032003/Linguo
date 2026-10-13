import { describe, expect, it } from 'vitest';
import { formatInterval } from './formatInterval';

describe('formatInterval', () => {
  it.each([
    [0, '<1 phút'],
    [0.4, '<1 phút'],
    [1, '1 phút'],
    [10, '10 phút'],
    [59, '59 phút'],
    [59.6, '1 giờ'],
    [60, '1 giờ'],
    [90, '2 giờ'],
    [5 * 60, '5 giờ'],
    [23 * 60, '23 giờ'],
    [23.6 * 60, '1 ngày'],
    [1440, '1 ngày'],
    [3 * 1440, '3 ngày'],
    [29 * 1440, '29 ngày'],
    [30 * 1440, '1 tháng'],
    [60 * 1440, '2 tháng'],
    [330 * 1440, '11 tháng'],
    [350 * 1440, '1 năm'],
    [365 * 1440, '1 năm'],
    [548 * 1440, '1,5 năm'],
    [730 * 1440, '2 năm'],
  ])('%s minutes → %s', (minutes, label) => {
    expect(formatInterval(minutes)).toBe(label);
  });

  it('treats negative and non-finite values as due now', () => {
    expect(formatInterval(-5)).toBe('<1 phút');
    expect(formatInterval(Number.NaN)).toBe('<1 phút');
  });
});
