import { describe, expect, it } from 'vitest';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { readLengthParam } from './lengths';
import {
  finishSession,
  firstPending,
  getSessionInputs,
  getSessionRecap,
  getTodaySession,
  reorderSession,
  saveSessionPlan,
  sessionLink,
  sessionProgress,
  updateSessionItem,
} from './service';
import { LESSON_A, SESSION_ID, SESSION_PATH_ID, activity, inputs, mistake, plan, sessionWithStatuses, studySession, todayResult } from './session-fixtures';

describe('session service', () => {
  it('gets the planner inputs', async () => {
    const client = fakeClient({}, { get_session_inputs: { data: inputs() } });
    expect(await getSessionInputs(client, SESSION_PATH_ID)).toEqual(inputs());
    expect(client.rpcCalls).toEqual([['get_session_inputs', { p_path_id: SESSION_PATH_ID }]]);
  });

  it('saves a plan, replacing or not', async () => {
    const client = fakeClient({}, { save_session_plan: { data: studySession() } });
    expect(await saveSessionPlan(client, SESSION_PATH_ID, plan(), false)).toEqual(studySession());
    await saveSessionPlan(client, SESSION_PATH_ID, plan(), true);
    expect(client.rpcCalls).toEqual([
      ['save_session_plan', { p_path_id: SESSION_PATH_ID, p_plan: plan(), p_replace: false }],
      ['save_session_plan', { p_path_id: SESSION_PATH_ID, p_plan: plan(), p_replace: true }],
    ]);
  });

  it("gets today's session, or none", async () => {
    const client = fakeClient({}, { get_today_session: { data: todayResult() } });
    expect(await getTodaySession(client, SESSION_PATH_ID)).toEqual(todayResult());
    const empty = fakeClient({}, { get_today_session: { data: todayResult(null) } });
    expect((await getTodaySession(empty, SESSION_PATH_ID)).session).toBeNull();
  });

  it('updates an item with whole, non-negative seconds', async () => {
    const client = fakeClient({}, { update_session_item: { data: studySession() } });
    await updateSessionItem(client, SESSION_ID, 'a2', 'done', 125.6);
    await updateSessionItem(client, SESSION_ID, 'a3', 'skipped', -4);
    await updateSessionItem(client, SESSION_ID, 'a4', 'skipped');
    expect(client.rpcCalls).toEqual([
      ['update_session_item', { p_session_id: SESSION_ID, p_item_id: 'a2', p_status: 'done', p_seconds: 126 }],
      ['update_session_item', { p_session_id: SESSION_ID, p_item_id: 'a3', p_status: 'skipped', p_seconds: 0 }],
      ['update_session_item', { p_session_id: SESSION_ID, p_item_id: 'a4', p_status: 'skipped', p_seconds: 0 }],
    ]);
  });

  it('reorders and finishes', async () => {
    const client = fakeClient({}, { reorder_session: { data: studySession() }, finish_session: { data: studySession({ status: 'completed' }) } });
    await reorderSession(client, SESSION_ID, ['a2', 'a1', 'a3', 'a4']);
    expect((await finishSession(client, SESSION_ID, 'completed')).status).toBe('completed');
    expect(client.rpcCalls).toEqual([
      ['reorder_session', { p_session_id: SESSION_ID, p_order: ['a2', 'a1', 'a3', 'a4'] }],
      ['finish_session', { p_session_id: SESSION_ID, p_status: 'completed' }],
    ]);
  });

  it('reads the recap, with unknown answer keys and give-ups as null', async () => {
    const rows = [mistake(1), mistake(2, { expected_answer: null, learner_answer: null })];
    const client = fakeClient({}, { session_recap: { data: rows } });
    expect(await getSessionRecap(client, SESSION_ID)).toEqual(rows);
    expect(client.rpcCalls).toEqual([['session_recap', { p_session_id: SESSION_ID }]]);
    const none = fakeClient({}, { session_recap: { data: null } });
    expect(await getSessionRecap(none, SESSION_ID)).toEqual([]);
  });

  it('rethrows the supabase error', async () => {
    const error = { message: 'session_closed', code: 'P0001' };
    const client = fakeClient({}, { update_session_item: { data: null, error } });
    await expect(updateSessionItem(client, SESSION_ID, 'a1', 'done', 1)).rejects.toBe(error);
  });

  it('throws invalid_payload when a response breaks the contract', async () => {
    const client = fakeClient(
      {},
      {
        get_today_session: { data: { session: null } },
        save_session_plan: { data: { id: 'x' } },
        session_recap: { data: [{ prompt: 1 }] },
      },
    );
    await expect(getTodaySession(client, SESSION_PATH_ID)).rejects.toThrow('invalid_payload');
    await expect(saveSessionPlan(client, SESSION_PATH_ID, plan(), false)).rejects.toThrow('invalid_payload');
    await expect(getSessionRecap(client, SESSION_ID)).rejects.toThrow('invalid_payload');
  });
});

describe('sessionLink', () => {
  const session = { id: SESSION_ID };

  it('opens the review with the session params', () => {
    expect(sessionLink(session, activity({ id: 'a1', kind: 'review', lesson_id: null, review_limit: 25 }))).toBe(
      `/app/on-tap?phien=${SESSION_ID}&muc=a1&so-the=25`,
    );
    expect(sessionLink(session, activity({ id: 'a1', kind: 'review', lesson_id: null }))).toBe(`/app/on-tap?phien=${SESSION_ID}&muc=a1`);
  });

  it('opens a lesson or practice lesson with the session params', () => {
    expect(sessionLink(session, activity({ id: 'a2', kind: 'lesson' }))).toBe(`/app/hoc-tap/bai/${LESSON_A}?phien=${SESSION_ID}&muc=a2`);
    expect(sessionLink(session, activity({ id: 'a3', kind: 'practice' }))).toBe(`/app/hoc-tap/bai/${LESSON_A}?phien=${SESSION_ID}&muc=a3`);
  });

  it('has no link for the recap or a lesson without a lesson id', () => {
    expect(sessionLink(session, activity({ id: 'a4', kind: 'recap', lesson_id: null }))).toBeNull();
    expect(sessionLink(session, activity({ id: 'a2', kind: 'lesson', lesson_id: null }))).toBeNull();
  });
});

describe('session helpers', () => {
  it('finds the first pending activity in the learner order', () => {
    expect(firstPending(sessionWithStatuses(['done', 'skipped', 'pending', 'pending']))?.id).toBe('a3');
    expect(firstPending(sessionWithStatuses(['done', 'done', 'skipped', 'done']))).toBeNull();
  });

  it('counts done and skipped as finished', () => {
    expect(sessionProgress(sessionWithStatuses(['done', 'skipped', 'pending', 'pending']))).toEqual({ finished: 2, total: 4 });
  });

  it.each([
    ['?phut=10', 10],
    ['?phut=45', 45],
    ['?phut=11', null],
    ['?phut=abc', null],
    ['', null],
  ])('reads the length param %s', (search, length) => {
    expect(readLengthParam(new URLSearchParams(search))).toBe(length);
  });
});
