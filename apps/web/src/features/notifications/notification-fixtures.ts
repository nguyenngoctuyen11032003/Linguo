import type { AppNotification, NotificationPrefs, WeeklySummaryPayload } from '@linguo/shared';

// Test data shared by the notification unit tests (not imported by app code).

export const DEFAULT_PREFS: NotificationPrefs = {
  reminders_enabled: false,
  remind_at: '19:30',
  remind_days: [1, 2, 3, 4, 5, 6, 7],
  quiet_start: '22:00',
  quiet_end: '07:00',
  max_per_day: 1,
  weekly_summary: true,
  push_enabled: false,
  ignored_streak: 0,
  backoff_level: 0,
};

export const prefs = (overrides: Partial<NotificationPrefs> = {}): NotificationPrefs => ({ ...DEFAULT_PREFS, ...overrides });

export const WEEKLY_PAYLOAD: WeeklySummaryPayload = {
  week_start: '2026-10-05',
  minutes: 84,
  planned_minutes: 105,
  active_days: 4,
  planned_days: 7,
  weak_skill: 'listening',
  weak_accuracy: 0.62,
  suggestion_vi: 'Thêm 1 buổi luyện Nghe',
};

let seq = 0;

/** A notification created `minutesAgo` before `now`; ids are valid v4 UUIDs. */
export function makeNotification(
  overrides: Partial<AppNotification> = {},
  { minutesAgo = 5, now = new Date() }: { minutesAgo?: number; now?: Date } = {},
): AppNotification {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  return {
    id,
    kind: 'review_due',
    title_vi: 'Đến giờ ôn tập',
    body_vi: 'Có 12 thẻ đang chờ — ôn 5 phút là đủ',
    action_url: '/app/on-tap',
    payload: {},
    local_day: '2026-10-14',
    created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    read_at: null,
    clicked_at: null,
    ...overrides,
  };
}

export function weeklyNotification(overrides: Partial<AppNotification> = {}, minutesAgo = 60): AppNotification {
  return makeNotification(
    {
      kind: 'weekly_summary',
      title_vi: 'Báo cáo tuần của bạn',
      body_vi: 'Tuần này bạn học 84 phút trong 4 ngày.',
      action_url: '/app/tien-do',
      payload: { ...WEEKLY_PAYLOAD },
      ...overrides,
    },
    { minutesAgo },
  );
}
