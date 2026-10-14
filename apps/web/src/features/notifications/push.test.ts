import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { prefs } from './notification-fixtures';
import type { AppSupabaseClient } from '@/lib/supabase';
import { disablePush, enablePush, getPushState, getPushSupport, releasePushOnSignOut, urlBase64ToUint8Array } from './push';
import { fakeSubscription, installPush, removePush, type PushEnv } from './push-test-utils';

const mocks = vi.hoisted(() => ({ env: { vapidPublicKey: 'AQID' as string | null } }));
vi.mock('@/lib/env', () => ({ env: mocks.env }));

let push: PushEnv | null = null;
let restoreRemoved: (() => void) | null = null;

afterEach(() => {
  push?.restore();
  push = null;
  restoreRemoved?.();
  restoreRemoved = null;
  mocks.env.vapidPublicKey = 'AQID';
});

const rpcs = () =>
  fakeClient(
    {},
    {
      save_push_subscription: { data: null },
      delete_push_subscription: { data: null },
      set_notification_prefs: { data: prefs({ push_enabled: true }) },
    },
  );

describe('push support and state', () => {
  it('is unsupported without the browser APIs', async () => {
    restoreRemoved = removePush();
    expect(getPushSupport()).toBe('browser');
    await expect(getPushState()).resolves.toBe('unsupported');
  });

  it('is unsupported (not configured) without a VAPID key', async () => {
    push = installPush();
    mocks.env.vapidPublicKey = null;
    expect(getPushSupport()).toBe('not_configured');
    await expect(getPushState()).resolves.toBe('unsupported');
  });

  it('reports the permission and subscription state', async () => {
    push = installPush({ permission: 'default' });
    await expect(getPushState()).resolves.toBe('default');
    push.restore();
    push = installPush({ permission: 'denied' });
    await expect(getPushState()).resolves.toBe('denied');
    push.restore();
    push = installPush({ permission: 'granted' });
    await expect(getPushState()).resolves.toBe('granted-unsubscribed');
    push.restore();
    push = installPush({ permission: 'granted', subscription: fakeSubscription() });
    await expect(getPushState()).resolves.toBe('granted-subscribed');
    push.restore();
    push = installPush({ permission: 'granted', registered: false });
    await expect(getPushState()).resolves.toBe('granted-unsubscribed');
  });

  it('decodes a base64url VAPID key', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
});

describe('enablePush', () => {
  it('asks permission, subscribes with the VAPID key, saves it and turns push on', async () => {
    push = installPush({ permission: 'default', answer: 'granted' });
    const client = rpcs();
    const result = await enablePush(client);
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(push.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) });
    expect(result).toEqual({ state: 'granted-subscribed', prefs: prefs({ push_enabled: true }) });
    expect(client.rpcCalls).toEqual([
      [
        'save_push_subscription',
        { p_endpoint: 'https://push.example/new', p_p256dh: 'p256dh-key', p_auth: 'auth-key', p_user_agent: expect.any(String) },
      ],
      ['set_notification_prefs', { p: { push_enabled: true } }],
    ]);
  });

  it('reuses an existing subscription without asking again when already granted', async () => {
    push = installPush({ permission: 'granted', subscription: fakeSubscription('https://push.example/old') });
    const client = rpcs();
    await enablePush(client);
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(push.subscribe).not.toHaveBeenCalled();
    expect(client.rpcCalls[0]?.[1]).toMatchObject({ p_endpoint: 'https://push.example/old' });
  });

  it('stops when the learner blocks or dismisses the prompt', async () => {
    push = installPush({ permission: 'default', answer: 'denied' });
    const client = rpcs();
    await expect(enablePush(client)).resolves.toEqual({ state: 'denied', prefs: null });
    push.restore();
    push = installPush({ permission: 'default', answer: 'default' });
    await expect(enablePush(client)).resolves.toEqual({ state: 'default', prefs: null });
    expect(client.rpcCalls).toEqual([]);
  });

  it('throws coded errors when unsupported, unconfigured or the subscribe fails', async () => {
    restoreRemoved = removePush();
    await expect(enablePush(rpcs())).rejects.toThrow('push_unsupported');
    restoreRemoved();
    restoreRemoved = null;

    push = installPush();
    mocks.env.vapidPublicKey = null;
    await expect(enablePush(rpcs())).rejects.toThrow('push_not_configured');
    expect(push.requestPermission).not.toHaveBeenCalled();

    mocks.env.vapidPublicKey = 'AQID';
    push.subscribe.mockRejectedValueOnce(new Error('AbortError'));
    await expect(enablePush(rpcs())).rejects.toThrow('push_subscribe_failed');
  });
});

describe('disablePush', () => {
  it('unsubscribes, deletes the subscription and turns push off', async () => {
    const sub = fakeSubscription();
    push = installPush({ permission: 'granted', subscription: sub });
    const client = fakeClient({}, { delete_push_subscription: { data: null }, set_notification_prefs: { data: prefs() } });
    const result = await disablePush(client);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([
      ['delete_push_subscription', { p_endpoint: 'https://push.example/sub-1' }],
      ['set_notification_prefs', { p: { push_enabled: false } }],
    ]);
    expect(result.prefs).toEqual(prefs());
  });

  it('still turns push off when this device has no subscription', async () => {
    push = installPush({ permission: 'granted' });
    const client = fakeClient({}, { set_notification_prefs: { data: prefs() } });
    await disablePush(client);
    expect(client.rpcCalls).toEqual([['set_notification_prefs', { p: { push_enabled: false } }]]);
  });
});

describe('releasePushOnSignOut', () => {
  it('unsubscribes this browser and deletes its endpoint server-side, without touching the prefs', async () => {
    const sub = fakeSubscription();
    push = installPush({ permission: 'granted', subscription: sub });
    const client = fakeClient({}, { delete_push_subscription: { data: null } });
    await releasePushOnSignOut(client);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([['delete_push_subscription', { p_endpoint: 'https://push.example/sub-1' }]]);
  });

  it('does nothing without a subscription, without push support or without a registration', async () => {
    push = installPush({ permission: 'granted' });
    const none = fakeClient({});
    await releasePushOnSignOut(none);
    expect(none.rpcCalls).toEqual([]);
    push.restore();
    push = installPush({ permission: 'granted', registered: false });
    await releasePushOnSignOut(none);
    push.restore();
    push = null;
    restoreRemoved = removePush();
    await releasePushOnSignOut(none);
    expect(none.rpcCalls).toEqual([]);
  });

  it('never throws: an offline RPC or a failing unsubscribe is tolerated', async () => {
    const sub = fakeSubscription();
    sub.unsubscribe.mockRejectedValue(new Error('boom'));
    push = installPush({ permission: 'granted', subscription: sub });
    const client = fakeClient({}, { delete_push_subscription: { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } } });
    await expect(releasePushOnSignOut(client)).resolves.toBeUndefined();
    expect(client.rpcCalls).toEqual([['delete_push_subscription', { p_endpoint: 'https://push.example/sub-1' }]]);

    push.restore();
    push = installPush({ permission: 'granted', subscription: fakeSubscription() });
    const throwing = { rpc: () => Promise.reject(new Error('offline')) } as unknown as AppSupabaseClient;
    await expect(releasePushOnSignOut(throwing)).resolves.toBeUndefined();
  });

  it('gives up after the timeout when the browser or the network hangs', async () => {
    vi.useFakeTimers();
    try {
      const sub = fakeSubscription();
      sub.unsubscribe.mockReturnValue(new Promise(() => {}));
      push = installPush({ permission: 'granted', subscription: sub });
      let done = false;
      const pending = releasePushOnSignOut(fakeClient({}), 1500).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(600);
      await pending;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
