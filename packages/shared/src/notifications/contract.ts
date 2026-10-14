import { z } from 'zod';

// Spec 10: JSON exchanged with the reminder/notification RPCs and the notify-dispatch
// Edge Function. snake_case mirrors the SQL jsonb exactly.

/** Mirrors the Vietnamese error map in apps/web/src/features/notifications/error-map.ts. */
export const NOTIFICATION_ERROR_CODES = [
  'not_authenticated',
  'invalid_prefs',
  'invalid_subscription',
  'notification_not_found',
  'invalid_action',
] as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

export const NOTIFICATION_KINDS = ['review_due', 'resume_lesson', 'quick_check', 'weekly_summary'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** ISO day of week, 1 = Monday … 7 = Sunday (Postgres isodow). */
export const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoDay = (typeof ISO_DAYS)[number];

export const REMINDER_RULES = {
  /**
   * A reminder is due during [remind_at, remind_at + window): the 15-minute cron often runs late or is skipped, so
   * a later run catches up within this window (unique per user, kind and local day: never twice).
   */
  window_minutes: 60,
  /** A notification still without a push is retried by later runs until it is this old (push TTL). */
  push_retry_hours: 4,
  max_per_day_min: 1,
  max_per_day_max: 3,
  /** Unclicked for this long → ignored_streak + 1. */
  ignore_after_hours: 24,
  /** ignored_streak reaching this → backoff_level + 1, streak reset. */
  ignores_per_backoff: 3,
  backoff_max: 3,
  max_push_subscriptions: 5,
  /**
   * Subscriptions are deleted once failure_count reaches this; only runs answered 401/403 count (404/410 delete
   * at once; network errors, 429 and 5xx never count).
   */
  max_push_failures: 10,
  retention_days: 90,
  title_max: 80,
  body_max: 300,
  user_agent_max: 200,
} as const;

/**
 * Days a backoff level still allows (ISO days). Level 0 = every remind_day; level 1 skips odd ISO days
 * (keeps Tue/Thu/Sat); level 2 = Mon/Wed/Fri; level 3 = Monday only. Always intersected with remind_days.
 */
export const BACKOFF_DAYS: Record<0 | 1 | 2 | 3, readonly IsoDay[]> = {
  0: [1, 2, 3, 4, 5, 6, 7],
  1: [2, 4, 6],
  2: [1, 3, 5],
  3: [1],
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** Row of public.notification_prefs as returned by get_notification_prefs() (time columns as 'HH:MM'). */
export const notificationPrefsSchema = z.object({
  reminders_enabled: z.boolean(),
  remind_at: hhmm,
  remind_days: z.array(z.number().int().min(1).max(7)),
  quiet_start: hhmm,
  quiet_end: hhmm,
  max_per_day: z.number().int().min(1).max(3),
  weekly_summary: z.boolean(),
  push_enabled: z.boolean(),
  ignored_streak: z.number().int().min(0),
  backoff_level: z.number().int().min(0).max(3),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** Body of set_notification_prefs(p jsonb): any subset of the editable fields. Returns the full prefs row. */
export const notificationPrefsPatchSchema = notificationPrefsSchema
  .omit({ ignored_streak: true, backoff_level: true })
  .partial()
  .extend({
    /** true resets backoff_level and ignored_streak to 0 ("bấm để nhắc như cũ"). */
    reset_backoff: z.boolean().optional(),
  });
export type NotificationPrefsPatch = z.infer<typeof notificationPrefsPatchSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(NOTIFICATION_KINDS),
  title_vi: z.string().max(80),
  body_vi: z.string().max(300),
  /** Always an internal path starting with '/app/'. */
  action_url: z.string().startsWith('/app/'),
  payload: z.record(z.string(), z.unknown()),
  local_day: z.string(),
  created_at: z.string(),
  read_at: z.string().nullable(),
  clicked_at: z.string().nullable(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

/** list_notifications(p_limit int default 20, p_before timestamptz default null) → newest first. */
export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  has_more: z.boolean(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

/** unread_notification_count() → int. mark_notification(p_id, p_action 'read'|'clicked') → void. */
export const NOTIFICATION_ACTIONS = ['read', 'clicked'] as const;
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

/** payload of a weekly_summary notification (also used by the Home "Báo cáo tuần" card). */
export const weeklySummaryPayloadSchema = z.object({
  week_start: z.string(),
  minutes: z.number().int().min(0),
  planned_minutes: z.number().int().min(0),
  active_days: z.number().int().min(0),
  planned_days: z.number().int().min(0),
  /** Lowest-accuracy skill with enough samples, or null. */
  weak_skill: z.string().nullable(),
  weak_accuracy: z.number().min(0).max(1).nullable(),
  suggestion_vi: z.string(),
});
export type WeeklySummaryPayload = z.infer<typeof weeklySummaryPayloadSchema>;

/** One row of generate_due_notifications(p_now) output: what notify-dispatch pushes. */
export const dueNotificationSchema = z.object({
  notification_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
});
export type DueNotification = z.infer<typeof dueNotificationSchema>;

/** Data carried by a Web Push message and by the SW → app postMessage after notificationclick. */
export const pushPayloadSchema = z.object({
  notification_id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const SW_MESSAGE_NOTIFICATION_CLICKED = 'linguo:notification-clicked' as const;

/**
 * Words and phrases that must never appear in reminder copy (spec 10 §5: no guilt). Tests scan
 * features/notifications and the reminders migration for them (case-insensitive).
 */
export const FORBIDDEN_REMINDER_PHRASES = [
  'lười',
  'bỏ lỡ',
  'phá chuỗi',
  'mất chuỗi',
  'thất vọng',
  'đáng xấu hổ',
  'đừng bỏ cuộc',
] as const;
