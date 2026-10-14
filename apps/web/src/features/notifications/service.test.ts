import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { makeNotification, prefs } from './notification-fixtures';
import {
  deletePushSubscription,
  getNotificationPrefs,
  listNotifications,
  markNotification,
  savePushSubscription,
  setNotificationPrefs,
  unreadNotificationCount,
} from './service';

describe('notifications service', () => {
  it('reads the prefs and trims Postgres seconds off time columns', async () => {
    const client = fakeClient({}, { get_notification_prefs: { data: { ...prefs(), remind_at: '19:30:00', quiet_start: '22:00:00' } } });
    await expect(getNotificationPrefs(client)).resolves.toEqual(prefs());
    expect(client.rpcCalls).toEqual([['get_notification_prefs', {}]]);
  });

  it('rejects a prefs row that breaks the contract', async () => {
    const client = fakeClient({}, { get_notification_prefs: { data: { ...prefs(), max_per_day: 9 } } });
    await expect(getNotificationPrefs(client)).rejects.toThrow('invalid_payload');
  });

  it('sends a validated patch as p and returns the saved row', async () => {
    const saved = prefs({ reminders_enabled: true, remind_days: [1, 3] });
    const client = fakeClient({}, { set_notification_prefs: { data: saved } });
    await expect(setNotificationPrefs(client, { reminders_enabled: true, remind_days: [1, 3] })).resolves.toEqual(saved);
    expect(client.rpcCalls).toEqual([['set_notification_prefs', { p: { reminders_enabled: true, remind_days: [1, 3] } }]]);
  });

  it('refuses an invalid patch before calling the server', async () => {
    const client = fakeClient({}, {});
    await expect(setNotificationPrefs(client, { remind_at: '7pm' })).rejects.toThrow('invalid_prefs');
    expect(client.rpcCalls).toEqual([]);
  });

  it('saves and deletes push subscriptions, truncating the user agent', async () => {
    const client = fakeClient({}, { save_push_subscription: { data: null }, delete_push_subscription: { data: null } });
    await savePushSubscription(client, { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a', userAgent: 'x'.repeat(300) });
    await deletePushSubscription(client, 'https://push.example/1');
    expect(client.rpcCalls).toEqual([
      ['save_push_subscription', { p_endpoint: 'https://push.example/1', p_p256dh: 'k', p_auth: 'a', p_user_agent: 'x'.repeat(200) }],
      ['delete_push_subscription', { p_endpoint: 'https://push.example/1' }],
    ]);
  });

  it('refuses a subscription without keys', async () => {
    const client = fakeClient({}, {});
    await expect(savePushSubscription(client, { endpoint: 'e', p256dh: '', auth: 'a', userAgent: '' })).rejects.toThrow('invalid_subscription');
  });

  it('lists notifications with paging arguments', async () => {
    const item = makeNotification();
    const client = fakeClient({}, { list_notifications: { data: { items: [item], has_more: true } } });
    await expect(listNotifications(client)).resolves.toEqual({ items: [item], has_more: true });
    await listNotifications(client, { limit: 5, before: item.created_at });
    expect(client.rpcCalls).toEqual([
      ['list_notifications', { p_limit: 20, p_before: null }],
      ['list_notifications', { p_limit: 5, p_before: item.created_at }],
    ]);
  });

  it('rejects an external action_url', async () => {
    const client = fakeClient({}, { list_notifications: { data: { items: [makeNotification({ action_url: 'https://evil.example' })], has_more: false } } });
    await expect(listNotifications(client)).rejects.toThrow('invalid_payload');
  });

  it('reads the unread count and marks a notification', async () => {
    const client = fakeClient({}, { unread_notification_count: { data: 3 }, mark_notification: { data: null } });
    await expect(unreadNotificationCount(client)).resolves.toBe(3);
    await markNotification(client, 'id-1', 'clicked');
    expect(client.rpcCalls[1]).toEqual(['mark_notification', { p_id: 'id-1', p_action: 'clicked' }]);
  });

  it('rethrows RPC errors', async () => {
    const client = fakeClient({}, { unread_notification_count: { data: null, error: { message: 'not_authenticated', code: 'P0001' } } });
    await expect(unreadNotificationCount(client)).rejects.toMatchObject({ message: 'not_authenticated' });
  });
});
