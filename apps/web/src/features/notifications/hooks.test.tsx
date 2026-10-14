import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SW_MESSAGE_NOTIFICATION_CLICKED } from '@linguo/shared';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import type { AppSupabaseClient } from '@/lib/supabase';
import { publishNotificationsChanged, subscribeNotificationPrefs, subscribeNotificationsChanged } from './events';
import { makeNotification, prefs, weeklyNotification } from './notification-fixtures';
import { handleServiceWorkerMessage } from './sw-click';
import { useNotificationPrefs } from './useNotificationPrefs';
import { NOTIFICATION_POLL_MS, useNotifications, useUnreadNotificationCount } from './useNotifications';
import { pickWeeklySummary, useWeeklySummary } from './useWeeklySummary';

const USER_ID = '11111111-1111-4111-8111-111111111111';

type Handler = (args: Record<string, unknown>) => unknown;
const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
}));
// Stable like the real singleton: the hooks depend on the client identity.
const client = vi.hoisted(() => ({ rpc: (...args: unknown[]) => (mocks.rpc as (...a: unknown[]) => unknown)(...args) }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => client }));

beforeEach(() => {
  mocks.handlers = {};
  mocks.rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    const handler = mocks.handlers[name];
    if (!handler) return Promise.resolve({ data: null, error: { message: `no handler for ${name}` } });
    try {
      return Promise.resolve({ data: handler(args), error: null });
    } catch (error) {
      return Promise.resolve({ data: null, error });
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
  document.dispatchEvent(new Event('visibilitychange'));
}

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

const calls = (name: string) => mocks.rpc.mock.calls.filter(([n]) => n === name);

describe('useNotificationPrefs', () => {
  it('loads, saves a patch and broadcasts it', async () => {
    mocks.handlers.get_notification_prefs = () => prefs();
    mocks.handlers.set_notification_prefs = (args) => prefs(args.p as object);
    const heard = vi.fn();
    const off = subscribeNotificationPrefs(heard);
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.prefs).toEqual(prefs());

    let ok = false;
    await act(async () => {
      ok = await result.current.update({ reminders_enabled: true });
    });
    expect(ok).toBe(true);
    expect(result.current.prefs?.reminders_enabled).toBe(true);
    expect(heard).toHaveBeenCalledWith(USER_ID, prefs({ reminders_enabled: true }));
    off();
  });

  it('resets the backoff', async () => {
    mocks.handlers.get_notification_prefs = () => prefs({ backoff_level: 2 });
    mocks.handlers.set_notification_prefs = () => prefs();
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.resetBackoff();
    });
    expect(calls('set_notification_prefs')[0]?.[1]).toEqual({ p: { reset_backoff: true } });
    expect(result.current.prefs?.backoff_level).toBe(0);
  });

  it('keeps the saved prefs and maps a failed save', async () => {
    mocks.handlers.get_notification_prefs = () => prefs();
    mocks.handlers.set_notification_prefs = () => {
      throw { message: 'invalid_prefs', code: 'P0001' };
    };
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let ok = true;
    await act(async () => {
      ok = await result.current.update({ max_per_day: 2 });
    });
    expect(ok).toBe(false);
    expect(result.current.prefs).toEqual(prefs());
    expect(result.current.error).toBe('Cài đặt nhắc học chưa hợp lệ. Kiểm tra lại giờ và ngày nhắc.');
  });

  it('shows a load error and retries', async () => {
    let fail = true;
    mocks.handlers.get_notification_prefs = () => {
      if (fail) throw { message: 'TypeError: Failed to fetch', code: '' };
      return prefs();
    };
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

describe('useUnreadNotificationCount', () => {
  it('polls every 60 s only while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let count = 2;
    mocks.handlers.unread_notification_count = () => count;
    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(calls('unread_notification_count')).toHaveLength(1);

    count = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS);
    });
    expect(result.current.count).toBe(5);
    expect(calls('unread_notification_count')).toHaveLength(2);

    act(() => setVisibility('hidden'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 3);
    });
    expect(calls('unread_notification_count')).toHaveLength(2);

    count = 7;
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.count).toBe(7));
    expect(calls('unread_notification_count')).toHaveLength(3);
  });

  it('refreshes when a notification is marked elsewhere and keeps the badge on a failed refresh', async () => {
    let count = 1;
    mocks.handlers.unread_notification_count = () => count;
    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(1));
    count = 0;
    act(() => publishNotificationsChanged());
    await waitFor(() => expect(result.current.count).toBe(0));

    mocks.handlers.unread_notification_count = () => {
      throw { message: 'TypeError: Failed to fetch' };
    };
    act(() => publishNotificationsChanged());
    await waitFor(() => expect(calls('unread_notification_count')).toHaveLength(3));
    expect(result.current.status).toBe('ready');
  });
});

describe('useNotifications', () => {
  it('lists, pages with "before" and marks clicked', async () => {
    const first = [makeNotification({}, { minutesAgo: 1 }), makeNotification({}, { minutesAgo: 2 })];
    const older = [makeNotification({}, { minutesAgo: 90 })];
    mocks.handlers.list_notifications = (args) =>
      args.p_before ? { items: older, has_more: false } : { items: first, has_more: true };
    mocks.handlers.mark_notification = (args) => {
      // The server records the click, so the refresh that follows returns it.
      const at = new Date().toISOString();
      const index = first.findIndex((n) => n.id === args.p_id);
      if (index >= 0) first[index] = { ...first[index]!, read_at: at, clicked_at: at };
      return null;
    };
    const changed = vi.fn();
    const off = subscribeNotificationsChanged(changed);

    const { result } = renderHook(() => useNotifications({ pageSize: 2 }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    expect(calls('list_notifications')[1]?.[1]).toEqual({ p_limit: 2, p_before: first[1]!.created_at });
    expect(result.current.items.map((n) => n.id)).toEqual([...first, ...older].map((n) => n.id));
    expect(result.current.hasMore).toBe(false);

    let ok = false;
    await act(async () => {
      ok = await result.current.markClicked(first[0]!.id);
    });
    expect(ok).toBe(true);
    expect(calls('mark_notification')[0]?.[1]).toEqual({ p_id: first[0]!.id, p_action: 'clicked' });
    const marked = result.current.items[0]!;
    expect(marked.clicked_at).not.toBeNull();
    expect(marked.read_at).not.toBeNull();
    expect(changed).toHaveBeenCalled();
    // The refresh after the mark keeps the older page that was already loaded.
    await waitFor(() => expect(calls('list_notifications')).toHaveLength(3));
    expect(result.current.items).toHaveLength(3);
    off();
  });

  it('shows a first-load error and retries', async () => {
    let fail = true;
    mocks.handlers.list_notifications = () => {
      if (fail) throw { message: 'not_authenticated' };
      return { items: [], has_more: false };
    };
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toEqual([]);
  });

  it('polls the first page while visible and adds new notifications on top', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const a = makeNotification({}, { minutesAgo: 10 });
    const b = makeNotification({}, { minutesAgo: 0 });
    let items = [a];
    mocks.handlers.list_notifications = () => ({ items, has_more: false });
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    items = [b, a];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS);
    });
    expect(result.current.items.map((n) => n.id)).toEqual([b.id, a.id]);
  });
});

describe('weekly summary', () => {
  it('picks the newest unread weekly summary of the last 7 days', () => {
    const now = new Date();
    const fresh = weeklyNotification({}, 60);
    expect(pickWeeklySummary([makeNotification(), fresh], now)?.notification.id).toBe(fresh.id);
    expect(pickWeeklySummary([weeklyNotification({ read_at: now.toISOString() })], now)).toBeNull();
    expect(pickWeeklySummary([weeklyNotification({}, 8 * 24 * 60)], now)).toBeNull();
    expect(pickWeeklySummary([weeklyNotification({ payload: { minutes: 'lots' } })], now)).toBeNull();
  });

  it('dismiss hides the card and marks it read', async () => {
    const weekly = weeklyNotification();
    let read = false;
    mocks.handlers.list_notifications = () => ({ items: [read ? { ...weekly, read_at: new Date().toISOString() } : weekly], has_more: false });
    mocks.handlers.mark_notification = () => {
      read = true;
      return null;
    };
    const { result } = renderHook(() => useWeeklySummary(), { wrapper });
    await waitFor(() => expect(result.current.value).not.toBeNull());
    await act(async () => result.current.dismiss());
    expect(result.current.value).toBeNull();
    expect(calls('mark_notification')[0]?.[1]).toEqual({ p_id: weekly.id, p_action: 'read' });
    await waitFor(() => expect(calls('list_notifications')).toHaveLength(2));
    expect(result.current.value).toBeNull();
  });
});

describe('handleServiceWorkerMessage', () => {
  it('marks the clicked notification and ignores other messages', async () => {
    mocks.handlers.mark_notification = () => null;
    const client = { rpc: mocks.rpc } as unknown as AppSupabaseClient;
    const changed = vi.fn();
    const off = subscribeNotificationsChanged(changed);
    const payload = { notification_id: makeNotification().id, title: 't', body: 'b', url: '/app/on-tap' };
    await expect(handleServiceWorkerMessage(client, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload })).resolves.toBe(true);
    await expect(handleServiceWorkerMessage(client, { type: SW_MESSAGE_NOTIFICATION_CLICKED, ...payload })).resolves.toBe(true);
    await expect(handleServiceWorkerMessage(client, { type: 'other' })).resolves.toBe(false);
    await expect(handleServiceWorkerMessage(client, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload: {} })).resolves.toBe(false);
    expect(calls('mark_notification')).toHaveLength(2);
    expect(calls('mark_notification')[0]?.[1]).toEqual({ p_id: payload.notification_id, p_action: 'clicked' });
    expect(changed).toHaveBeenCalledTimes(2);
    off();
  });
});
