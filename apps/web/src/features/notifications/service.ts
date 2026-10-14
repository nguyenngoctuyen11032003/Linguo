import { z } from 'zod';
import {
  notificationListSchema,
  notificationPrefsPatchSchema,
  notificationPrefsSchema,
  REMINDER_RULES,
  type NotificationAction,
  type NotificationList,
  type NotificationPrefs,
  type NotificationPrefsPatch,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 10 §2. The reminder RPCs are not in the generated Database types yet: callRpc goes through an untyped cast
// and every answer is validated with the shared zod contract.

export const NOTIFICATION_PAGE_SIZE = 20;

const TIME_FIELDS = ['remind_at', 'quiet_start', 'quiet_end'] as const;

/** Postgres `time` may come back as 'HH:MM:SS'; the contract (and <input type="time">) use 'HH:MM'. */
function normalizePrefs(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const row: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const field of TIME_FIELDS) {
    const value = row[field];
    if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}/.test(value)) row[field] = value.slice(0, 5);
  }
  return row;
}

export async function getNotificationPrefs(client: AppSupabaseClient): Promise<NotificationPrefs> {
  return parse(notificationPrefsSchema, normalizePrefs(await callRpc(client, 'get_notification_prefs', {})));
}

export async function setNotificationPrefs(client: AppSupabaseClient, patch: NotificationPrefsPatch): Promise<NotificationPrefs> {
  const checked = notificationPrefsPatchSchema.safeParse(patch);
  if (!checked.success) throw new Error('invalid_prefs');
  return parse(notificationPrefsSchema, normalizePrefs(await callRpc(client, 'set_notification_prefs', { p: checked.data })));
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

export async function savePushSubscription(client: AppSupabaseClient, sub: PushSubscriptionKeys): Promise<void> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth) throw new Error('invalid_subscription');
  await callRpc(client, 'save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: sub.userAgent.slice(0, REMINDER_RULES.user_agent_max),
  });
}

export async function deletePushSubscription(client: AppSupabaseClient, endpoint: string): Promise<void> {
  await callRpc(client, 'delete_push_subscription', { p_endpoint: endpoint });
}

/** Newest first; `before` is the `created_at` of the last item already shown. */
export async function listNotifications(
  client: AppSupabaseClient,
  { limit = NOTIFICATION_PAGE_SIZE, before = null }: { limit?: number; before?: string | null } = {},
): Promise<NotificationList> {
  return parse(notificationListSchema, await callRpc(client, 'list_notifications', { p_limit: limit, p_before: before }));
}

export async function unreadNotificationCount(client: AppSupabaseClient): Promise<number> {
  return parse(z.number().int().min(0), await callRpc(client, 'unread_notification_count', {}));
}

export async function markNotification(client: AppSupabaseClient, id: string, action: NotificationAction): Promise<void> {
  await callRpc(client, 'mark_notification', { p_id: id, p_action: action });
}
