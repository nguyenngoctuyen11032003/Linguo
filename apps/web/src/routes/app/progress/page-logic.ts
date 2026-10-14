import { PROGRESS_RANGES, type ProgressDashboard, type ProgressRange } from '@linguo/shared';

/** Query parameter holding the selected range on /app/tien-do. */
export const RANGE_PARAM = 'khoang';
const DEFAULT_RANGE: ProgressRange = 7;

/** `?khoang=` → 7 / 14 / 28; anything else falls back to 7 days. */
export function parseRange(value: string | null): ProgressRange {
  const n = Number(value);
  return (PROGRESS_RANGES as readonly number[]).includes(n) ? (n as ProgressRange) : DEFAULT_RANGE;
}

/** Nothing was studied in the window: no minutes, answers, reviews, lessons or mistakes. */
export function isEmptyDashboard(data: ProgressDashboard): boolean {
  return (
    data.days.every((d) => d.minutes === 0 && d.answers === 0 && d.reviews === 0 && d.lessons === 0) &&
    data.totals.lessons_completed === 0 &&
    data.totals.reviews_done === 0 &&
    data.mistakes.length === 0
  );
}
