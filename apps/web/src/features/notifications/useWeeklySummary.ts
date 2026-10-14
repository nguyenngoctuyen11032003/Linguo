import { useCallback, useEffect, useState } from 'react';
import { weeklySummaryPayloadSchema, type AppNotification, type WeeklySummaryPayload } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { publishNotificationsChanged, subscribeNotificationsChanged } from './events';
import { listNotifications, markNotification } from './service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklySummary {
  notification: AppNotification;
  summary: WeeklySummaryPayload;
}

/** The newest unread weekly_summary created in the last 7 days whose payload matches the contract, else null. */
export function pickWeeklySummary(items: AppNotification[], now: Date = new Date()): WeeklySummary | null {
  for (const notification of items) {
    if (notification.kind !== 'weekly_summary' || notification.read_at) continue;
    const created = new Date(notification.created_at).getTime();
    if (Number.isNaN(created) || now.getTime() - created > WEEK_MS) continue;
    const parsed = weeklySummaryPayloadSchema.safeParse(notification.payload);
    if (parsed.success) return { notification, summary: parsed.data };
  }
  return null;
}

export interface WeeklySummaryState {
  status: 'loading' | 'ready' | 'error';
  value: WeeklySummary | null;
  /** "Đã xem": hides the card at once and marks the notification read. */
  dismiss: () => Promise<void>;
  /** Marks it clicked (the card's link to the details). */
  markClicked: () => Promise<void>;
}

/** Home "Báo cáo tuần" card data (spec 10 §5). Failures stay quiet: the card simply does not show. */
export function useWeeklySummary(): WeeklySummaryState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [state, setState] = useState<{ status: WeeklySummaryState['status']; value: WeeklySummary | null }>({
    status: 'loading',
    value: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId || !client) return;
    let active = true;
    listNotifications(client)
      .then((page) => {
        if (active) setState({ status: 'ready', value: pickWeeklySummary(page.items) });
      })
      .catch(() => {
        if (active) setState({ status: 'error', value: null });
      });
    return () => {
      active = false;
    };
  }, [client, userId, attempt]);

  useEffect(() => subscribeNotificationsChanged(() => setAttempt((n) => n + 1)), []);

  const mark = useCallback(
    async (action: 'read' | 'clicked') => {
      const id = state.value?.notification.id;
      if (!client || !id) return;
      setState({ status: 'ready', value: null });
      try {
        await markNotification(client, id, action);
        publishNotificationsChanged();
      } catch {
        // Hidden for this visit; it shows again next time if the mark did not reach the server.
      }
    },
    [client, state.value],
  );
  const dismiss = useCallback(() => mark('read'), [mark]);
  const markClicked = useCallback(() => mark('clicked'), [mark]);

  return { status: state.status, value: state.value, dismiss, markClicked };
}
