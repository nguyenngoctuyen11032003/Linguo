import { describe, expect, it } from 'vitest';
import { TARGET_DATE_INVALID, TARGET_DATE_PAST, TARGET_DATE_TOO_FAR, targetDateError } from './target-date';

describe('targetDateError (onboarding and plan editor share it)', () => {
  const today = '2026-10-13';

  it('accepts dates within ten years and an absent date', () => {
    expect(targetDateError(null, today)).toBeUndefined();
    expect(targetDateError('', today)).toBeUndefined();
    expect(targetDateError(today, today)).toBeUndefined();
    expect(targetDateError('2036-10-10', today)).toBeUndefined();
  });

  it('explains past, too far and malformed dates', () => {
    expect(targetDateError('2026-10-12', today)).toBe(TARGET_DATE_PAST);
    expect(targetDateError('2036-10-11', today)).toBe(TARGET_DATE_TOO_FAR);
    // Not a real day: the plan editor used to call this "already past" because of a plain string comparison.
    expect(targetDateError('2026-02-30', today)).toBe(TARGET_DATE_INVALID);
  });
});
