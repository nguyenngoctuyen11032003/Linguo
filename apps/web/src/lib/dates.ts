const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The user's local calendar date (YYYY-MM-DD) in `timeZone`. */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  let format = DAY_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    DAY_FORMATS.set(timeZone, format);
  }
  return format.format(now);
}

/** Monday = 0 … Sunday = 6, in `timeZone`. */
export function weekdayIndex(timeZone: string, now: Date = new Date()): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now));
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
