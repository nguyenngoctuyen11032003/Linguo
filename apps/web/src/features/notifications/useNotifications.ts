import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppNotification, NotificationAction } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { notificationErrorMessage } from './error-map';
import { publishNotificationsChanged, subscribeNotificationsChanged } from './events';
import { listNotifications, markNotification, NOTIFICATION_PAGE_SIZE, unreadNotificationCount } from './service';

/** Spec 10 §5: the inbox and the unread badge refresh every 60 s, only while the tab is visible. */
export const NOTIFICATION_POLL_MS = 60_000;

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * Calls `tick` every `intervalMs` while the document is visible. Hidden tabs do not poll; becoming visible again
 * ticks at once and restarts the interval.
 */
export function useVisiblePolling(tick: () => void, intervalMs: number, enabled = true): void {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      timer ??= setInterval(() => tickRef.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (isVisible()) {
        tickRef.current();
        start();
      } else {
        stop();
      }
    };
    if (isVisible()) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}

export interface UnreadCountState {
  status: 'loading' | 'ready' | 'error';
  count: number;
  reload: () => void;
}

/** unread_notification_count() for the bell badge: polled while visible and refreshed after any mark. */
export function useUnreadNotificationCount({ intervalMs = NOTIFICATION_POLL_MS }: { intervalMs?: number } = {}): UnreadCountState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [state, setState] = useState<{ status: UnreadCountState['status']; count: number }>({ status: 'loading', count: 0 });
  const seq = useRef(0);

  const reload = useCallback(() => {
    if (!userId || !client) return;
    const mine = ++seq.current;
    unreadNotificationCount(client)
      .then((count) => {
        if (mine === seq.current) setState({ status: 'ready', count });
      })
      .catch(() => {
        // A failed refresh keeps the last known badge; only the first load shows an error.
        if (mine === seq.current) setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', count: 0 }));
      });
  }, [client, userId]);

  useEffect(() => {
    reload();
    return () => {
      seq.current += 1;
    };
  }, [reload]);
  useEffect(() => subscribeNotificationsChanged(reload), [reload]);
  useVisiblePolling(reload, intervalMs, Boolean(userId && client));

  return { status: state.status, count: state.count, reload };
}

export interface NotificationsState {
  status: 'loading' | 'ready' | 'error';
  items: AppNotification[];
  hasMore: boolean;
  loadingMore: boolean;
  /** Vietnamese message for the first load failure or a failed "Xem thêm". */
  error: string | null;
  loadMore: () => Promise<void>;
  reload: () => void;
  /** Marks one notification; never rejects, resolves false on failure. Updates the list and notifies the bell. */
  markRead: (id: string) => Promise<boolean>;
  markClicked: (id: string) => Promise<boolean>;
}

interface ListState {
  status: NotificationsState['status'];
  items: AppNotification[];
  hasMore: boolean;
  error: string | null;
}

/** Newest page first, then older pages kept; ids already shown are updated in place. */
function mergeFirstPage(current: AppNotification[], fresh: AppNotification[]): AppNotification[] {
  const freshIds = new Set(fresh.map((n) => n.id));
  const oldest = fresh[fresh.length - 1]?.created_at;
  const older = current.filter((n) => !freshIds.has(n.id) && (oldest === undefined || n.created_at < oldest));
  return [...fresh, ...older];
}

/** The in-app inbox (list_notifications) with "Xem thêm" paging and 60 s visible-tab polling of the first page. */
export function useNotifications({
  pageSize = NOTIFICATION_PAGE_SIZE,
  intervalMs = NOTIFICATION_POLL_MS,
}: { pageSize?: number; intervalMs?: number } = {}): NotificationsState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [state, setState] = useState<ListState>({ status: 'loading', items: [], hasMore: false, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const itemsRef = useRef<AppNotification[]>([]);
  useEffect(() => {
    itemsRef.current = state.items;
  });

  const refresh = useCallback(
    (initial: boolean) => {
      if (!userId) return;
      if (!client) {
        setState({ status: 'error', items: [], hasMore: false, error: notificationErrorMessage(new Error('supabase_unavailable')) });
        return;
      }
      const mine = ++seq.current;
      if (initial) setState((prev) => (prev.status === 'error' ? { ...prev, status: 'loading', error: null } : prev));
      listNotifications(client, { limit: pageSize })
        .then((page) => {
          if (mine !== seq.current) return;
          setState((prev) => ({
            status: 'ready',
            items: mergeFirstPage(prev.items, page.items),
            // Older pages already loaded keep their own has_more answer.
            hasMore: prev.items.length > page.items.length ? prev.hasMore : page.has_more,
            error: null,
          }));
        })
        .catch((error: unknown) => {
          if (mine !== seq.current) return;
          setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', items: [], hasMore: false, error: notificationErrorMessage(error) }));
        });
    },
    [client, pageSize, userId],
  );

  useEffect(() => {
    refresh(true);
    return () => {
      seq.current += 1;
    };
  }, [refresh, attempt]);

  const poll = useCallback(() => refresh(false), [refresh]);
  useEffect(() => subscribeNotificationsChanged(poll), [poll]);
  useVisiblePolling(poll, intervalMs, Boolean(userId && client));

  const loadMore = useCallback(async () => {
    const last = itemsRef.current[itemsRef.current.length - 1];
    if (!client || !last) return;
    setLoadingMore(true);
    try {
      const page = await listNotifications(client, { limit: pageSize, before: last.created_at });
      setState((prev) => {
        const known = new Set(prev.items.map((n) => n.id));
        return { ...prev, items: [...prev.items, ...page.items.filter((n) => !known.has(n.id))], hasMore: page.has_more, error: null };
      });
    } catch (error) {
      setState((prev) => ({ ...prev, error: notificationErrorMessage(error) }));
    } finally {
      setLoadingMore(false);
    }
  }, [client, pageSize]);

  const mark = useCallback(
    async (id: string, action: NotificationAction): Promise<boolean> => {
      if (!client) return false;
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        items: prev.items.map((n) =>
          n.id === id ? { ...n, read_at: n.read_at ?? now, clicked_at: action === 'clicked' ? (n.clicked_at ?? now) : n.clicked_at } : n,
        ),
      }));
      try {
        await markNotification(client, id, action);
        publishNotificationsChanged();
        return true;
      } catch {
        return false;
      }
    },
    [client],
  );
  const markRead = useCallback((id: string) => mark(id, 'read'), [mark]);
  const markClicked = useCallback((id: string) => mark(id, 'clicked'), [mark]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, loadingMore, loadMore, reload, markRead, markClicked };
}
