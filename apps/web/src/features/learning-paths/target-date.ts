import { isoToUtcDays, isTargetDateInRange } from '@linguo/shared';

export const TARGET_DATE_PAST = 'Ngày mục tiêu đã qua.';
export const TARGET_DATE_TOO_FAR = 'Ngày mục tiêu quá xa (tối đa 10 năm).';
export const TARGET_DATE_INVALID = 'Ngày mục tiêu không hợp lệ.';

/** Why a target date is unusable (past, beyond 10 years, malformed), or undefined when it is fine (or absent). */
export function targetDateError(iso: string | null | undefined, today: string): string | undefined {
  if (!iso || isTargetDateInRange(iso, today)) return undefined;
  if (Number.isNaN(isoToUtcDays(iso))) return TARGET_DATE_INVALID;
  return iso < today ? TARGET_DATE_PAST : TARGET_DATE_TOO_FAR;
}
