import { pushPayloadSchema, SW_MESSAGE_NOTIFICATION_CLICKED } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';
import { publishNotificationsChanged } from './events';
import { markNotification } from './service';

/**
 * Handles the service worker's postMessage after a notificationclick ({ type: SW_MESSAGE_NOTIFICATION_CLICKED,
 * payload: PushPayload } or flat): marks the notification clicked and refreshes the bell/inbox. Returns false for any other
 * message. Wave 2 wires this to navigator.serviceWorker's "message" event in App.tsx.
 */
export async function handleServiceWorkerMessage(client: AppSupabaseClient, data: unknown): Promise<boolean> {
  if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== SW_MESSAGE_NOTIFICATION_CLICKED) return false;
  // Accept { type, payload: PushPayload } and the flat { type, ...PushPayload } shape.
  const candidate = 'payload' in data ? (data as { payload?: unknown }).payload : data;
  const parsed = pushPayloadSchema.safeParse(candidate);
  if (!parsed.success) return false;
  try {
    await markNotification(client, parsed.data.notification_id, 'clicked');
  } catch {
    return false;
  }
  publishNotificationsChanged();
  return true;
}
