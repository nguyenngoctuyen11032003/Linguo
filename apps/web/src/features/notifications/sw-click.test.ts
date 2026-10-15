import { SW_MESSAGE_NOTIFICATION_CLICKED } from '@linguo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { subscribeNotificationsChanged } from './events';
import { handleServiceWorkerMessage } from './sw-click';

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b';
const payload = { notification_id: ID, title: 'Đến giờ học', body: 'Ôn 10 thẻ', url: '/app/on-tap' };

function client(result: { error: unknown } = { error: null }) {
  const rpc = vi.fn().mockResolvedValue({ data: null, ...result });
  return { rpc, client: { rpc } as unknown as AppSupabaseClient };
}

afterEach(() => vi.restoreAllMocks());

describe('handleServiceWorkerMessage', () => {
  it('marks the notification clicked for the nested payload shape', async () => {
    const { rpc, client: c } = client();
    expect(await handleServiceWorkerMessage(c, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload })).toBe(true);
    expect(rpc).toHaveBeenCalledWith('mark_notification', { p_id: ID, p_action: 'clicked' });
  });

  it('accepts the flat shape too', async () => {
    const { rpc, client: c } = client();
    expect(await handleServiceWorkerMessage(c, { type: SW_MESSAGE_NOTIFICATION_CLICKED, ...payload })).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('refreshes the bell exactly once on success', async () => {
    const { client: c } = client();
    const listener = vi.fn();
    const off = subscribeNotificationsChanged(listener);
    await handleServiceWorkerMessage(c, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('does not refresh the bell when the RPC failed', async () => {
    const { client: c } = client({ error: { message: 'x_y', code: 'P0001' } });
    const listener = vi.fn();
    const off = subscribeNotificationsChanged(listener);
    await handleServiceWorkerMessage(c, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload });
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it.each([
    ['null', null],
    ['string', 'x'],
    ['number', 3],
    ['other type', { type: 'something-else', payload }],
    ['no type', payload],
    ['bad uuid', { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload: { ...payload, notification_id: 'nope' } }],
    ['missing url', { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload: { notification_id: ID, title: 't', body: 'b' } }],
    ['null payload', { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload: null }],
  ])('ignores %s without calling the server', async (_n, data) => {
    const { rpc, client: c } = client();
    expect(await handleServiceWorkerMessage(c, data)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns false (and does not throw) when the RPC fails', async () => {
    const { client: c } = client({ error: { message: 'notification_not_found', code: 'P0001' } });
    expect(await handleServiceWorkerMessage(c, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload })).toBe(false);
  });

  it('returns false when the transport rejects', async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await handleServiceWorkerMessage({ rpc } as unknown as AppSupabaseClient, { type: SW_MESSAGE_NOTIFICATION_CLICKED, payload })).toBe(false);
  });
});
