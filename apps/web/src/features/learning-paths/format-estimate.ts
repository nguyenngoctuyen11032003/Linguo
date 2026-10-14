import { MAX_MINUTES_PER_DAY, type EstimateResult } from '@linguo/shared';

const WEEKS_PER_MONTH = 365.25 / 12 / 7;
const WEEKS_PER_YEAR = 365.25 / 7;
/** Up to this many weeks the estimate is quoted in weeks, beyond it in months, from two years on in years. */
const MAX_WEEKS_AS_WEEKS = 12;
const TWO_YEARS_IN_WEEKS = 104;

function range(min: number, max: number, unit: string): string {
  return min === max ? `khoảng ${min} ${unit}` : `khoảng ${min}–${max} ${unit}`;
}

/**
 * Human-sized wording for a weeks range: "khoảng 8–12 tuần", "khoảng 6–9 tháng", "khoảng 5–8 năm". The unit follows
 * the upper bound so a long plan is never shown as hundreds of weeks. Still an estimate: the caller labels it as one.
 * `capitalize` upper-cases the first letter for use at the start of a sentence.
 */
export function formatEstimate(weeksMin: number, weeksMax: number, options: { capitalize?: boolean } = {}): string {
  const lo = Math.min(weeksMin, weeksMax);
  const hi = Math.max(weeksMin, weeksMax);
  let text: string;
  if (hi <= MAX_WEEKS_AS_WEEKS) text = range(lo, hi, 'tuần');
  else if (hi < TWO_YEARS_IN_WEEKS) text = range(Math.round(lo / WEEKS_PER_MONTH), Math.round(hi / WEEKS_PER_MONTH), 'tháng');
  else text = range(Math.round(lo / WEEKS_PER_YEAR), Math.round(hi / WEEKS_PER_YEAR), 'năm');
  return options.capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** True when the plan is long enough (over about two years) that a gentle "study a bit more per day" nudge helps. */
export function isLongEstimate(weeksMax: number): boolean {
  return weeksMax > TWO_YEARS_IN_WEEKS;
}

/**
 * Minutes per day that would bring the middle estimate to about two years. Reuses the server's
 * suggestedMinutesPerDay when a deadline produced one, otherwise derives it from the hours needed (spread over 7 days).
 */
export function nudgeMinutesPerDay(estimate: EstimateResult): number | null {
  if (!isLongEstimate(estimate.weeksMax)) return null;
  if (estimate.suggestedMinutesPerDay) return estimate.suggestedMinutesPerDay;
  const perDay = Math.ceil((estimate.hoursNeeded * 60) / (TWO_YEARS_IN_WEEKS * 7));
  const current = Math.ceil(estimate.assumptions.weeklyMinutes / 7);
  if (perDay <= current) return null;
  return Math.min(MAX_MINUTES_PER_DAY, Math.ceil(perDay / 5) * 5);
}
