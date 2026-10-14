import { describe, expect, it } from 'vitest';
import { formatDay } from './labels';

describe('formatDay', () => {
  it('shows a timestamp as the local calendar day in the given time zone', () => {
    // 06:00 on 15/10 in Ho Chi Minh City is still 14/10 in UTC.
    expect(formatDay('2026-10-14T23:00:00+00:00', 'Asia/Ho_Chi_Minh')).toBe('15/10/2026');
    expect(formatDay('2026-10-14T23:00:00Z', 'UTC')).toBe('14/10/2026');
    expect(formatDay('2026-10-15T02:00:00Z', 'America/New_York')).toBe('14/10/2026');
  });

  it('keeps a bare calendar date as-is regardless of the time zone', () => {
    expect(formatDay('2026-10-01', 'America/Los_Angeles')).toBe('01/10/2026');
  });

  it('returns anything unparseable unchanged', () => {
    expect(formatDay('không rõ', 'Asia/Ho_Chi_Minh')).toBe('không rõ');
  });
});
