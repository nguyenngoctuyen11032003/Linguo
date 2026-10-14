import { ISO_DAYS, REMINDER_RULES, type IsoDay, type NotificationPrefs, type NotificationPrefsPatch } from '@linguo/shared';

/** The editable part of notification_prefs, as held by the Settings "Nhắc học" form. */
export interface ReminderDraft {
  reminders_enabled: boolean;
  remind_at: string;
  remind_days: number[];
  quiet_start: string;
  quiet_end: string;
  max_per_day: number;
  weekly_summary: boolean;
}

export type ReminderField = 'remind_at' | 'remind_days' | 'quiet' | 'max_per_day';
export type ReminderErrors = Partial<Record<ReminderField, string>>;

export const DAY_LABELS: Record<IsoDay, { short: string; long: string }> = {
  1: { short: 'T2', long: 'Thứ Hai' },
  2: { short: 'T3', long: 'Thứ Ba' },
  3: { short: 'T4', long: 'Thứ Tư' },
  4: { short: 'T5', long: 'Thứ Năm' },
  5: { short: 'T6', long: 'Thứ Sáu' },
  6: { short: 'T7', long: 'Thứ Bảy' },
  7: { short: 'CN', long: 'Chủ nhật' },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isTime = (value: string): boolean => HHMM.test(value);

function minutes(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

/** True when `time` falls in [start, end); a range with start > end wraps past midnight (22:00–07:00). */
export function isInQuietHours(time: string, start: string, end: string): boolean {
  if (!isTime(time) || !isTime(start) || !isTime(end)) return false;
  const t = minutes(time);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Unique ISO days 1–7, ascending. */
export function normalizeDays(days: readonly number[]): number[] {
  return [...new Set(days)].filter((d) => (ISO_DAYS as readonly number[]).includes(d)).sort((a, b) => a - b);
}

export function toggleDay(days: readonly number[], day: number): number[] {
  return normalizeDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
}

export function draftFromPrefs(prefs: NotificationPrefs): ReminderDraft {
  return {
    reminders_enabled: prefs.reminders_enabled,
    remind_at: prefs.remind_at,
    remind_days: normalizeDays(prefs.remind_days),
    quiet_start: prefs.quiet_start,
    quiet_end: prefs.quiet_end,
    max_per_day: prefs.max_per_day,
    weekly_summary: prefs.weekly_summary,
  };
}

export function draftToPatch(draft: ReminderDraft): NotificationPrefsPatch {
  return { ...draft, remind_days: normalizeDays(draft.remind_days) };
}

export function isDraftDirty(draft: ReminderDraft, prefs: NotificationPrefs): boolean {
  return JSON.stringify(draftToPatch(draft)) !== JSON.stringify(draftToPatch(draftFromPrefs(prefs)));
}

/** Client-side checks mirroring set_notification_prefs; an empty object means the draft can be saved. */
export function validateReminderDraft(draft: ReminderDraft): ReminderErrors {
  const errors: ReminderErrors = {};
  if (!isTime(draft.remind_at)) errors.remind_at = 'Nhập giờ nhắc theo dạng giờ:phút, ví dụ 19:30.';
  if (!isTime(draft.quiet_start) || !isTime(draft.quiet_end)) {
    errors.quiet = 'Nhập giờ yên lặng theo dạng giờ:phút, ví dụ 22:00.';
  } else if (draft.quiet_start === draft.quiet_end) {
    errors.quiet = 'Giờ bắt đầu và giờ kết thúc yên lặng cần khác nhau.';
  }
  if (
    !Number.isInteger(draft.max_per_day) ||
    draft.max_per_day < REMINDER_RULES.max_per_day_min ||
    draft.max_per_day > REMINDER_RULES.max_per_day_max
  ) {
    errors.max_per_day = `Chọn từ ${REMINDER_RULES.max_per_day_min} đến ${REMINDER_RULES.max_per_day_max} lần mỗi ngày.`;
  }
  if (draft.reminders_enabled) {
    if (draft.remind_days.length === 0) errors.remind_days = 'Chọn ít nhất một ngày để nhận nhắc.';
    if (!errors.remind_at && !errors.quiet && isInQuietHours(draft.remind_at, draft.quiet_start, draft.quiet_end)) {
      errors.remind_at = 'Giờ nhắc đang nằm trong giờ yên lặng. Chọn giờ khác hoặc đổi giờ yên lặng.';
    }
  }
  return errors;
}
