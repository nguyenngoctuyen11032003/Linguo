const FALLBACK_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();
const WEEKDAY_FORMATS = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Cached formatter for `timeZone`; an invalid zone (RangeError) falls back to Asia/Ho_Chi_Minh. */
function cachedFormat(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const hit = cache.get(timeZone);
  if (hit) return hit;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch (error) {
    if (!(error instanceof RangeError) || timeZone === FALLBACK_TIME_ZONE) throw error;
    return cachedFormat(cache, FALLBACK_TIME_ZONE, options);
  }
  cache.set(timeZone, format);
  return format;
}

/** The user's local calendar date (YYYY-MM-DD) in `timeZone`. Invalid zones fall back to Asia/Ho_Chi_Minh. */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  const format = cachedFormat(DAY_FORMATS, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = format.formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month').padStart(2, '0')}-${part('day').padStart(2, '0')}`;
}

/** Monday = 0 … Sunday = 6, in `timeZone`. Invalid zones fall back to Asia/Ho_Chi_Minh. */
export function weekdayIndex(timeZone: string, now: Date = new Date()): number {
  return WEEKDAYS.indexOf(cachedFormat(WEEKDAY_FORMATS, timeZone, { weekday: 'short' }).format(now));
}

export function addMonthsIso(iso: string, months: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDateVi(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
