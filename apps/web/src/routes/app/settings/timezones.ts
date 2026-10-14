import { DEFAULT_TIMEZONE } from '@linguo/shared';

/** Old IANA names that browsers still list next to the current one (alias -> canonical). */
const ALIASES: Record<string, string> = {
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
};

const VIETNAMESE_LABELS: Record<string, string> = {
  'Asia/Ho_Chi_Minh': 'Việt Nam (Hà Nội, TP.HCM)',
  UTC: 'UTC (giờ phối hợp quốc tế)',
};

const canonicalOf = (zone: string) => ALIASES[zone] ?? zone;

/**
 * Time zones to offer: the browser's list with one entry per place (aliases such as Asia/Saigon are folded into their
 * canonical twin), always including `current`. The stored value is never changed or lost: when `current` is itself an
 * alias, or the browser only lists the alias, that entry carries the value `current`.
 */
export function timeZoneOptions(current: string, supported?: readonly string[]): string[] {
  const all = supported ?? (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIMEZONE, 'UTC']);
  const result: string[] = [];
  const seen = new Map<string, number>();
  for (const zone of all) {
    const key = canonicalOf(zone);
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, result.length);
      result.push(zone);
    } else if (zone === current || zone === key) {
      result[at] = zone;
    }
  }
  const currentAt = seen.get(canonicalOf(current));
  if (currentAt === undefined) result.unshift(current);
  else result[currentAt] = current;
  return result;
}

/** Display name of an IANA zone: Vietnamese for the common ones, "Asia/Ho Chi Minh" style otherwise. */
export function timeZoneLabel(zone: string): string {
  return VIETNAMESE_LABELS[ALIASES[zone] ?? zone] ?? zone.replaceAll('_', ' ');
}
