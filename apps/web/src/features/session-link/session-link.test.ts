import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { elapsedSeconds, MAX_ITEM_SECONDS, readSessionParams, sessionLinkSearch, SESSION_LINK_QUERY } from './params';
import { getTodaySession, isMissingRpc, reportSessionItem } from './service';
import { FIXTURE_PATH_ID, FIXTURE_SESSION_ID, studySession } from './session-fixtures';

const params = (query: string) => new URLSearchParams(query);

describe('readSessionParams', () => {
  it('reads the session, the item and an optional review limit', () => {
    expect(SESSION_LINK_QUERY).toEqual({ session: 'phien', item: 'muc', reviewLimit: 'so-the' });
    expect(readSessionParams(params(`phien=${FIXTURE_SESSION_ID}&muc=a2`))).toEqual({
      sessionId: FIXTURE_SESSION_ID,
      itemId: 'a2',
      reviewLimit: null,
    });
    expect(readSessionParams(params(`phien=${FIXTURE_SESSION_ID}&muc=a1&so-the=20`))).toEqual({
      sessionId: FIXTURE_SESSION_ID,
      itemId: 'a1',
      reviewLimit: 20,
    });
  });

  it('ignores missing or malformed links', () => {
    expect(readSessionParams(params(''))).toBeNull();
    expect(readSessionParams(params('muc=a1'))).toBeNull();
    expect(readSessionParams(params(`phien=${FIXTURE_SESSION_ID}`))).toBeNull();
    expect(readSessionParams(params('phien=not-a-uuid&muc=a1'))).toBeNull();
    expect(readSessionParams(params(`phien=${FIXTURE_SESSION_ID}&muc=x1`))).toBeNull();
  });

  it('drops an invalid review limit but keeps the link', () => {
    for (const limit of ['0', '-3', '2.5', 'abc', '501', '']) {
      expect(readSessionParams(params(`phien=${FIXTURE_SESSION_ID}&muc=a1&so-the=${limit}`))?.reviewLimit).toBeNull();
    }
  });

  it('round-trips through sessionLinkSearch', () => {
    const link = { sessionId: FIXTURE_SESSION_ID, itemId: 'a3', reviewLimit: 12 };
    const search = sessionLinkSearch(link);
    expect(search).toBe(`?phien=${FIXTURE_SESSION_ID}&muc=a3&so-the=12`);
    expect(readSessionParams(params(search))).toEqual(link);
    expect(sessionLinkSearch({ ...link, reviewLimit: null })).toBe(`?phien=${FIXTURE_SESSION_ID}&muc=a3`);
  });
});

describe('elapsedSeconds', () => {
  it('rounds and caps the time spent', () => {
    expect(elapsedSeconds(1_000, 62_400)).toBe(61);
    expect(elapsedSeconds(5_000, 1_000)).toBe(0);
    expect(elapsedSeconds(0, 10 * 3600 * 1000)).toBe(MAX_ITEM_SECONDS);
    expect(elapsedSeconds(Number.NaN, 1_000)).toBe(0);
  });
});

describe('session-link service', () => {
  it('gets today and validates it with the contract', async () => {
    const result = { session: studySession(), studied_seconds_today: 600, daily_goal_minutes: 30 };
    const client = fakeClient({}, { get_today_session: { data: result } });
    expect(await getTodaySession(client, FIXTURE_PATH_ID)).toEqual(result);
    expect(client.rpcCalls).toEqual([['get_today_session', { p_path_id: FIXTURE_PATH_ID }]]);
  });

  it('rejects a malformed answer', async () => {
    const client = fakeClient({}, { get_today_session: { data: { session: null } } });
    await expect(getTodaySession(client, FIXTURE_PATH_ID)).rejects.toThrow('invalid_payload');
  });

  it('reports an item with whole seconds', async () => {
    const client = fakeClient({}, { update_session_item: { data: null } });
    await reportSessionItem(client, { sessionId: FIXTURE_SESSION_ID, itemId: 'a2', status: 'done', seconds: 61.6 });
    expect(client.rpcCalls).toEqual([
      ['update_session_item', { p_session_id: FIXTURE_SESSION_ID, p_item_id: 'a2', p_status: 'done', p_seconds: 62 }],
    ]);
  });

  it('passes RPC errors through', async () => {
    const client = fakeClient({}, { update_session_item: { data: null, error: { message: 'session_closed' } } });
    await expect(reportSessionItem(client, { sessionId: FIXTURE_SESSION_ID, itemId: 'a2', status: 'done', seconds: 1 })).rejects.toEqual({
      message: 'session_closed',
    });
  });

  it('recognises an RPC that is not deployed', () => {
    expect(isMissingRpc({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true);
    expect(isMissingRpc({ message: 'x', status: 404 })).toBe(true);
    expect(isMissingRpc({ message: 'path_not_found', status: 400 })).toBe(false);
    expect(isMissingRpc(new TypeError('Failed to fetch'))).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
  });
});
