import type { CompleteResult } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { drainLessonOutbox, type LessonDrainHooks, type LessonRunEvent } from './lesson-sync';
import { result, run, submitArgs, LESSON_ID, PATH_ID, RUN_ID } from './lesson-fixtures';
import { enqueueLessonCompletion, enqueueLessonStart, openLessonOps, sendLessonCompletion } from './offline-queue';
import { OUTBOX_MAX_AGE_MS, createOutbox } from './outbox';

const USER = 'u1';
const RUN_B = '40000000-0000-4000-8000-0000000000bb';
const RUN_SERVER = '40000000-0000-4000-8000-0000000000cc';
const AT = '2026-10-20T08:00:00.000Z';
const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };

const COMPLETE: CompleteResult = {
  accuracy_by_stage: { recognition: 1, recall: null, application: null },
  almost_count: 0,
  confident_wrong: 0,
  unsure_right: 0,
  next_review_at: '2026-10-21T08:00:00Z',
  completed_at: '2026-10-20T08:05:00Z',
};

type Handler = (args: Record<string, unknown>) => { data?: unknown; error?: unknown; status?: number };

/** A client whose rpc replies come from per-function handlers; every call is recorded in order. */
function fakeClient(handlers: Record<string, Handler>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const reply = handlers[fn]?.(args) ?? { error: { message: `unexpected ${fn}`, code: 'X' } };
    return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null, status: reply.status });
  });
  return { client: { rpc } as unknown as AppSupabaseClient, calls };
}

function hooks() {
  const results: Array<[string, unknown]> = [];
  const events: LessonRunEvent[] = [];
  const dropped: Array<{ reason: string; count: number; runId?: string }> = [];
  const h: LessonDrainHooks = {
    onResult: (key, outcome) => results.push([key, outcome]),
    onRunEvent: (e) => events.push(e),
    onDropped: (d) => dropped.push(d),
  };
  return { h, results, events, dropped };
}

function queueAnswer(runId: string, overrides: Partial<ReturnType<typeof submitArgs>> = {}) {
  const args = submitArgs({ p_run_id: runId, ...overrides });
  createOutbox(USER).add({ args, queueIndex: 0 });
  return args;
}

beforeEach(() => {
  localStorage.clear();
});

describe('drainLessonOutbox', () => {
  it('replays a run in order: start, then answers, then completion', async () => {
    enqueueLessonStart(USER, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT });
    const a = queueAnswer(RUN_ID);
    const b = queueAnswer(RUN_ID);
    enqueueLessonCompletion(USER, RUN_ID, AT);
    const { client, calls } = fakeClient({
      start_lesson: () => ({ data: run() }),
      submit_exercise: () => ({ data: result() }),
      complete_lesson: () => ({ data: COMPLETE }),
    });
    const { h, results, events } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(calls.map((c) => c.fn)).toEqual(['start_lesson', 'submit_exercise', 'submit_exercise', 'complete_lesson']);
    expect(calls[0]!.args).toEqual({ p_lesson_id: LESSON_ID, p_path_id: PATH_ID, p_run_id: RUN_ID, p_client_at: AT });
    expect(calls[3]!.args).toEqual({ p_run_id: RUN_ID, p_client_at: AT });
    expect(results.map(([key]) => key)).toEqual([a.p_idempotency_key, b.p_idempotency_key]);
    expect(events).toEqual([
      { type: 'started', runId: RUN_ID, serverRunId: RUN_ID },
      { type: 'completed', runId: RUN_ID, result: COMPLETE },
    ]);
    expect(createOutbox(USER).list()).toEqual([]);
    expect(openLessonOps(USER).list()).toEqual([]);
  });

  it('does not complete a run while one of its answers is still queued (outbox_waiting)', async () => {
    queueAnswer(RUN_ID);
    enqueueLessonCompletion(USER, RUN_ID, AT);
    const { client, calls } = fakeClient({ submit_exercise: () => ({ error: NETWORK, status: 0 }), complete_lesson: () => ({ data: COMPLETE }) });
    const { h, events } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(calls.map((c) => c.fn)).toEqual(['submit_exercise']);
    expect(events).toEqual([]);
    expect(createOutbox(USER).list()).toHaveLength(1);
    expect(openLessonOps(USER).list()).toHaveLength(1);
    await expect(
      sendLessonCompletion(client, USER, { op: 'complete', p_idempotency_key: `complete:${RUN_ID}`, p_run_id: RUN_ID, p_client_at: AT }),
    ).rejects.toMatchObject({ message: 'outbox_waiting' });
  });

  it('a waiting run does not hold back another run, and a network failure stops the pass', async () => {
    const stuck = queueAnswer(RUN_ID);
    const other = queueAnswer(RUN_B);
    createOutbox(USER).markFailed(stuck.p_idempotency_key, Date.now(), 60_000); // run 1 is backing off
    const { client, calls } = fakeClient({ submit_exercise: () => ({ data: result() }) });
    const { h, results } = hooks();
    await drainLessonOutbox(client, USER, false, h);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.p_run_id).toBe(RUN_B);
    expect(results.map(([key]) => key)).toEqual([other.p_idempotency_key]);
    expect(createOutbox(USER).list().map((e) => e.args.p_idempotency_key)).toEqual([stuck.p_idempotency_key]);

    const net = fakeClient({ submit_exercise: () => ({ error: NETWORK, status: 0 }) });
    const second = queueAnswer(RUN_B);
    await drainLessonOutbox(net.client, USER, true, hooks().h);
    expect(net.calls).toHaveLength(1); // offline: the next run is not even tried
    const entries = createOutbox(USER).list();
    expect(entries.find((e) => e.args.p_idempotency_key === stuck.p_idempotency_key)).toMatchObject({ tries: 2 });
    expect(entries.find((e) => e.args.p_idempotency_key === second.p_idempotency_key)).toMatchObject({ tries: 0 });
  });

  it('remaps a run when the server already holds an open run for the lesson', async () => {
    enqueueLessonStart(USER, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT });
    queueAnswer(RUN_ID);
    enqueueLessonCompletion(USER, RUN_ID, AT);
    const { client, calls } = fakeClient({
      start_lesson: () => ({ data: run({ id: RUN_SERVER }) }),
      submit_exercise: () => ({ data: result() }),
      complete_lesson: () => ({ data: COMPLETE }),
    });
    const { h, events } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(calls.map((c) => [c.fn, c.args.p_run_id])).toEqual([
      ['start_lesson', RUN_ID],
      ['submit_exercise', RUN_SERVER],
      ['complete_lesson', RUN_SERVER],
    ]);
    expect(events.map((e) => e.type)).toEqual(['started', 'remapped', 'completed']);
    expect(events[1]).toEqual({ type: 'remapped', from: RUN_ID, to: RUN_SERVER });
  });

  it('drops every queued entry of a run whose start is refused and reports it, leaving other runs alone', async () => {
    enqueueLessonStart(USER, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT });
    const a = queueAnswer(RUN_ID);
    const b = queueAnswer(RUN_ID);
    enqueueLessonCompletion(USER, RUN_ID, AT);
    const survivor = queueAnswer(RUN_B);
    const { client, calls } = fakeClient({
      start_lesson: () => ({ error: { message: 'lesson_not_in_path', code: 'P0001' } }),
      submit_exercise: () => ({ data: result() }),
    });
    const { h, results, events, dropped } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(calls.map((c) => c.fn)).toEqual(['start_lesson', 'submit_exercise']);
    expect(results.filter(([, o]) => 'error' in (o as object)).map(([key]) => key)).toEqual([a.p_idempotency_key, b.p_idempotency_key]);
    expect(results.filter(([, o]) => 'result' in (o as object)).map(([key]) => key)).toEqual([survivor.p_idempotency_key]);
    expect(dropped).toEqual([{ reason: 'lesson_not_in_path', count: 4, runId: RUN_ID }]);
    expect(events).toContainEqual({ type: 'dropped', runId: RUN_ID, reason: 'lesson_not_in_path' });
    expect(createOutbox(USER).list()).toEqual([]);
    expect(openLessonOps(USER).list()).toEqual([]);
  });

  it.each(['run_not_active', 'exercise_version_mismatch', 'attempts_incomplete'])('drops the run on a permanent %s answer', async (code) => {
    queueAnswer(RUN_ID);
    queueAnswer(RUN_ID);
    enqueueLessonCompletion(USER, RUN_ID, AT);
    const { client, calls } = fakeClient({ submit_exercise: () => ({ error: { message: code, code: 'P0001' } }) });
    const { h, dropped } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(calls).toHaveLength(1);
    expect(dropped).toEqual([{ reason: code, count: 3, runId: RUN_ID }]);
    expect(createOutbox(USER).list()).toEqual([]);
    expect(openLessonOps(USER).list()).toEqual([]);
  });

  it('drops only the refused answer when the error is about that answer alone', async () => {
    const a = queueAnswer(RUN_ID);
    const b = queueAnswer(RUN_ID);
    let n = 0;
    const { client } = fakeClient({
      submit_exercise: () => (n++ === 0 ? { error: { message: 'invalid_response', code: 'P0001' } } : { data: result() }),
    });
    const { h, results, dropped } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(results.map(([key]) => key)).toEqual([a.p_idempotency_key, b.p_idempotency_key]);
    expect(dropped).toEqual([{ reason: 'invalid_response', count: 1, runId: RUN_ID }]);
  });

  it('a refused completion is dropped and reported', async () => {
    enqueueLessonCompletion(USER, RUN_ID, AT);
    const { client } = fakeClient({ complete_lesson: () => ({ error: { message: 'invalid_cursor', code: 'P0001' } }) });
    const { h, events, dropped } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(events.map((e) => e.type)).toEqual(['complete_failed']);
    expect(dropped).toEqual([{ reason: 'invalid_cursor', count: 1, runId: RUN_ID }]);
    expect(openLessonOps(USER).list()).toEqual([]);
  });

  it('pauses ~11 s after a rate limit, keeps the entry, and asks to be woken', async () => {
    const a = queueAnswer(RUN_ID);
    queueAnswer(RUN_B);
    const { client, calls } = fakeClient({ submit_exercise: () => ({ error: { message: 'rate_limited', code: 'P0001' } }) });
    const now = 1_000_000;
    const report = await drainLessonOutbox(client, USER, true, hooks().h, () => now);
    expect(calls).toHaveLength(1);
    expect(report.wakeAt).toBe(now + 11_000);
    const left = createOutbox(USER).list();
    expect(left).toHaveLength(2);
    expect(left.find((e) => e.args.p_idempotency_key === a.p_idempotency_key)).toMatchObject({ tries: 1, nextAttemptAt: now + 11_000 });
  });

  it('reports entries that expired unsent instead of dropping them silently', async () => {
    const old = new Date(Date.now() - OUTBOX_MAX_AGE_MS - 60_000).toISOString();
    createOutbox(USER).add({ args: submitArgs({ p_run_id: RUN_ID }), queueIndex: 0, createdAt: old });
    const { client, calls } = fakeClient({});
    const { h, dropped } = hooks();
    await drainLessonOutbox(client, USER, true, h);
    expect(calls).toEqual([]);
    expect(dropped).toEqual([{ reason: 'expired', count: 1 }]);
  });
});

describe('offline queue', () => {
  it('queues one start and one completion per run and announces them', () => {
    const listener = vi.fn();
    window.addEventListener('linguo-outbox-enqueued', listener);
    expect(enqueueLessonStart(USER, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT })).toBe(true);
    expect(enqueueLessonStart(USER, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT })).toBe(true);
    expect(enqueueLessonCompletion(USER, RUN_ID)).toBe(true);
    expect(enqueueLessonCompletion(USER, RUN_ID, AT)).toBe(true);
    window.removeEventListener('linguo-outbox-enqueued', listener);
    expect(openLessonOps(USER).list().map((e) => e.args.op)).toEqual(['start', 'complete']);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('keeps the queues of different users apart', () => {
    enqueueLessonStart(USER, { runId: RUN_ID, lessonId: LESSON_ID, pathId: PATH_ID, clientAt: AT });
    expect(openLessonOps('someone-else').list()).toEqual([]);
  });
});
