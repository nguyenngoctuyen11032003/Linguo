import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { getTodaySession, isMissingRpc, reportSessionItem } from './service';

const SID = '3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b';

function fake(response: { data?: unknown; error?: unknown; status?: number }) {
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null, ...response }));
  return { rpc, client: { rpc } as unknown as AppSupabaseClient };
}

afterEach(() => vi.restoreAllMocks());

describe('reportSessionItem', () => {
  it.each([
    [0, 0], [0.4, 0], [0.5, 1], [59.6, 60], [-5, 0], [-0.4, 0], [7200, 7200],
  ])('sends %f seconds as %i', async (given, sent) => {
    const { rpc, client } = fake({});
    await reportSessionItem(client, { sessionId: SID, itemId: 'a1', status: 'done', seconds: given });
    expect(rpc).toHaveBeenCalledWith('update_session_item', { p_session_id: SID, p_item_id: 'a1', p_status: 'done', p_seconds: sent });
  });

  it('refuses a non-finite duration or bad ids before any network call', async () => {
    const { rpc, client } = fake({});
    for (const seconds of [NaN, Infinity]) {
      await expect(reportSessionItem(client, { sessionId: SID, itemId: 'a1', status: 'done', seconds })).rejects.toBeTruthy();
    }
    await expect(reportSessionItem(client, { sessionId: 'nope', itemId: 'a1', status: 'done', seconds: 1 })).rejects.toBeTruthy();
    await expect(reportSessionItem(client, { sessionId: SID, itemId: 'a1', status: 'bogus' as 'done', seconds: 1 })).rejects.toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rethrows the server error and tags it with the HTTP status', async () => {
    const error = { message: 'session_not_found', code: 'P0001' };
    const { client } = fake({ error, status: 404 });
    await expect(reportSessionItem(client, { sessionId: SID, itemId: 'a1', status: 'done', seconds: 1 })).rejects.toMatchObject({ message: 'session_not_found', status: 404 });
  });
});

describe('getTodaySession', () => {
  it('rejects a malformed payload with invalid_payload (no raw zod issues leak)', async () => {
    const { client } = fake({ data: { nonsense: true } });
    await expect(getTodaySession(client, 'p1')).rejects.toThrow('invalid_payload');
  });

  it('passes the path id through', async () => {
    const { rpc, client } = fake({ data: null });
    await getTodaySession(client, 'path-1').catch(() => undefined);
    expect(rpc).toHaveBeenCalledWith('get_today_session', { p_path_id: 'path-1' });
  });
});

describe('isMissingRpc', () => {
  it.each([
    [{ code: 'PGRST202' }, true],
    [{ status: 404 }, true],
    [{ code: 'PGRST202', status: 400 }, true],
    [{ code: 'P0001' }, false],
    [{ status: 500 }, false],
    [{ status: '404' }, false],
    [null, false],
    [undefined, false],
    ['PGRST202', false],
    [404, false],
    [{}, false],
  ])('%j -> %s', (error, expected) => {
    expect(isMissingRpc(error)).toBe(expected);
  });
});
