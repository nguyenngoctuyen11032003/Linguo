const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * Vietnamese label for a review interval given in minutes (spec 3 §6):
 * "<1 phút", "10 phút", "5 giờ", "3 ngày", "2 tháng", "1,5 năm".
 * Each unit is rounded, and a value that rounds up to the next unit is promoted to it.
 */
export function formatInterval(minutes: number): string {
  const m = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  if (m < 1) return '<1 phút';
  if (m < MINUTES_PER_HOUR) {
    const value = Math.round(m);
    if (value < MINUTES_PER_HOUR) return `${value} phút`;
  }
  const hours = Math.round(m / MINUTES_PER_HOUR);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.round(m / MINUTES_PER_DAY);
  if (days < 30) return `${days} ngày`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} tháng`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${String(Math.max(1, years)).replace('.', ',')} năm`;
}
