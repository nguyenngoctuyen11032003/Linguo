import type { SchedulePreset } from '@linguo/shared';

export const WEEKDAYS = [
  { short: 'T2', long: 'Thứ Hai' },
  { short: 'T3', long: 'Thứ Ba' },
  { short: 'T4', long: 'Thứ Tư' },
  { short: 'T5', long: 'Thứ Năm' },
  { short: 'T6', long: 'Thứ Sáu' },
  { short: 'T7', long: 'Thứ Bảy' },
  { short: 'CN', long: 'Chủ nhật' },
] as const;

export const PRESET_MINUTES: Record<Exclude<SchedulePreset, 'custom'>, number> = { '15': 15, '30': 30, '60': 60, '120': 120 };

export const PRESET_LABELS: Record<SchedulePreset, string> = {
  '15': '10–15 phút mỗi ngày',
  '30': '30 phút mỗi ngày',
  '60': '45–60 phút mỗi ngày',
  '120': '90–120 phút mỗi ngày',
  custom: 'Tùy chỉnh từng ngày',
};

export function weekFromPreset(preset: Exclude<SchedulePreset, 'custom'>): number[] {
  return Array.from({ length: 7 }, () => PRESET_MINUTES[preset]);
}

export function presetFromWeek(week: readonly number[]): SchedulePreset {
  const first = week[0];
  if (first !== undefined && week.every((m) => m === first)) {
    const match = (Object.keys(PRESET_MINUTES) as Array<keyof typeof PRESET_MINUTES>).find((k) => PRESET_MINUTES[k] === first);
    if (match) return match;
  }
  return 'custom';
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} phút`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}
