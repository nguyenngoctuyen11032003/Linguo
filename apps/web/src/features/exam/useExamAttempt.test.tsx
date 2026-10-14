import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_ID, examAttempt, examQuestionId, examResult } from './exam-fixtures';
import { EXAM_SAVE_DEBOUNCE_MS, useExamAttempt } from './useExamAttempt';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

type Reply = { data?: unknown; error?: unknown };
type Handler = Reply | ((args: Record<string, unknown>) => Reply);

/** Each RPC name maps to a reply, a function of the args, or a queue of those (the last one repeats). */
function server(handlers: Record<string, Handler | Handler[]>) {
  const queues = new Map(Object.entries(handlers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    const queue = queues.get(name);
    if (!queue) return Promise.resolve({ data: null, error: { message: `no_fake_${name}`, code: 'X' } });
    const handler = (queue.length > 1 ? queue.shift() : queue[0]) as Handler;
    const { data = null, error = null } = typeof handler === 'function' ? handler(args) : handler;
    return Promise.resolve({ data, error });
  });
}

const OFFLINE = { error: { message: 'TypeError: Failed to fetch', code: '' } };
const saved = (status: 'in_progress' | 'expired' = 'in_progress') => ({
  data: { saved: status === 'in_progress', status, server_now: '2026-10-13T02:11:00.000Z', replayed: false },
});

const calls = (name: string) => mocks.rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args as Record<string, unknown>);

/** Lets resolved RPC promises (and React updates) settle without moving the clock. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

async function renderRunning() {
  const view = renderHook(() => useExamAttempt(ATTEMPT_ID));
  await settle();
  expect(view.result.current.status).toBe('running');
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  // The client clock runs 5 s ahead of the server (server_now = 02:10:00).
  vi.setSystemTime(new Date('2026-10-13T02:10:05.000Z'));
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  mocks.rpc.mockReset();
  setOnline(true);
});

describe('useExamAttempt: loading and clock', () => {
  it('loads the attempt and counts down from the server clock', async () => {
    server({ get_exam_attempt: { data: examAttempt() } });
    const { result } = renderHook(() => useExamAttempt(ATTEMPT_ID));
    expect(result.current.status).toBe('loading');
    await settle();
    expect(result.current.status).toBe('running');
    expect(result.current.attempt?.questions).toHaveLength(4);
    expect(result.current.saveState).toBe('idle');
    // Deadline 03:10:00 minus server time 02:10:00, despite the skewed client clock.
    expect(result.current.remainingMs).toBe(60 * 60_000);
    await advance(1000);
    expect(result.current.remainingMs).toBe(60 * 60_000 - 1000);
    await advance(3000);
    expect(result.current.remainingMs).toBe(60 * 60_000 - 4000);
    expect(calls('get_exam_attempt')).toEqual([{ p_attempt_id: ATTEMPT_ID }]);
  });

  it('has no clock for an untimed practice', async () => {
    server({ get_exam_attempt: { data: examAttempt({ mode: 'section', section: 'reading', deadline_at: null }) } });
    const { result } = renderHook(() => useExamAttempt(ATTEMPT_ID));
    await settle();
    expect(result.current.status).toBe('running');
    expect(result.current.remainingMs).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the result of an attempt that is already closed', async () => {
    server({ get_exam_attempt: { data: examResult({ status: 'expired' }) } });
    const { result } = renderHook(() => useExamAttempt(ATTEMPT_ID));
    await settle();
    expect(result.current.status).toBe('finished');
    expect(result.current.result?.status).toBe('expired');
    expect(result.current.attempt).toBeNull();
  });

  it('maps a load failure to Vietnamese', async () => {
    server({ get_exam_attempt: { error: { message: 'attempt_not_found', code: 'P0001' } } });
    const { result } = renderHook(() => useExamAttempt(ATTEMPT_ID));
    await settle();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Không tìm thấy lượt làm bài. Hãy bắt đầu lại.');
  });

  it('clears its interval on unmount', async () => {
    server({ get_exam_attempt: { data: examAttempt() } });
    const { unmount } = await renderRunning();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useExamAttempt: autosave', () => {
  it('updates the answer at once and saves it after 800 ms of quiet', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved() });
    const { result } = await renderRunning();
    const q2 = examQuestionId(2);
    act(() => result.current.setAnswer(q2, 'a'));
    expect(result.current.attempt?.questions[1]?.answer).toBe('a');
    expect(result.current.saveState).toBe('saving');
    await advance(500);
    act(() => result.current.setAnswer(q2, 'b'));
    await advance(EXAM_SAVE_DEBOUNCE_MS - 1);
    expect(calls('save_exam_answer')).toEqual([]);
    await advance(1);
    const sent = calls('save_exam_answer');
    expect(sent).toHaveLength(1);
    // Q2 is flagged in the fixture: the save carries the flag too.
    expect(sent[0]).toMatchObject({ p_attempt_id: ATTEMPT_ID, p_question_id: q2, p_answer: 'b', p_flagged: true });
    expect(sent[0]?.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.saveState).toBe('saved');
  });

  it('debounces per question and uses a fresh key for each new payload', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved() });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(3), '도와줄 수 있어요'));
    await advance(400);
    act(() => result.current.setAnswer(examQuestionId(4), '요즘 혼자 사는 사람이 많다.'));
    await advance(400);
    expect(calls('save_exam_answer').map((a) => a.p_question_id)).toEqual([examQuestionId(3)]);
    await advance(400);
    expect(calls('save_exam_answer').map((a) => a.p_question_id)).toEqual([examQuestionId(3), examQuestionId(4)]);
    act(() => result.current.setAnswer(examQuestionId(3), '도와주시겠어요'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    const keys = calls('save_exam_answer').map((a) => a.p_idempotency_key);
    expect(new Set(keys).size).toBe(3);
  });

  it('saves a flag toggle immediately with the current answer', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved() });
    const { result } = await renderRunning();
    act(() => result.current.toggleFlag(examQuestionId(1)));
    expect(result.current.attempt?.questions[0]?.flagged).toBe(true);
    await settle();
    expect(calls('save_exam_answer')).toEqual([
      expect.objectContaining({ p_question_id: examQuestionId(1), p_answer: 'a', p_flagged: true }),
    ]);
  });

  it('queues a failed save and resends it with the same key when back online', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: [OFFLINE, saved()] });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(3), '도와줄 수 있어요'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(result.current.saveState).toBe('offline');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    const sent = calls('save_exam_answer');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(result.current.saveState).toBe('saved');
  });

  it('does not call the server while the browser is offline', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved() });
    const { result } = await renderRunning();
    setOnline(false);
    act(() => result.current.setAnswer(examQuestionId(2), 'b'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(calls('save_exam_answer')).toEqual([]);
    expect(result.current.saveState).toBe('offline');
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls('save_exam_answer')).toHaveLength(1);
    expect(result.current.saveState).toBe('saved');
  });

  it('flushes pending saves on pagehide', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved() });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(2), 'b'));
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls('save_exam_answer')).toHaveLength(1);
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(calls('save_exam_answer')).toHaveLength(1);
  });

  it('flushes pending saves on unmount', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved() });
    const { result, unmount } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(2), 'd'));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(calls('save_exam_answer')).toEqual([expect.objectContaining({ p_answer: 'd' })]);
  });

  it('switches to the result when a save reports the attempt expired', async () => {
    server({
      get_exam_attempt: [{ data: examAttempt() }, { data: examResult({ status: 'expired' }) }],
      save_exam_answer: saved('expired'),
    });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(2), 'b'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(result.current.status).toBe('finished');
    expect(result.current.result?.status).toBe('expired');
    expect(calls('get_exam_attempt')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a rejected save in Vietnamese', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: { error: { message: 'answer_too_long', code: 'P0001' } } });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(4), 'x'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(result.current.saveState).toBe('error');
    expect(result.current.error).toBe('Câu trả lời quá dài so với giới hạn cho phép.');
    expect(result.current.status).toBe('running');
  });
});

describe('useExamAttempt: submit', () => {
  it('flushes pending saves, then submits', async () => {
    server({ get_exam_attempt: { data: examAttempt() }, save_exam_answer: saved(), submit_exam: { data: examResult() } });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(2), 'c'));
    await act(() => result.current.submit());
    const order = mocks.rpc.mock.calls.map(([name]) => name);
    expect(order).toEqual(['get_exam_attempt', 'save_exam_answer', 'submit_exam']);
    expect(result.current.status).toBe('finished');
    expect(result.current.result).toEqual(examResult());
    expect(vi.getTimerCount()).toBe(0);
    // Later edits are ignored.
    act(() => result.current.setAnswer(examQuestionId(2), 'a'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(calls('save_exam_answer')).toHaveLength(1);
  });

  it('auto-submits once when the clock reaches zero', async () => {
    server({
      get_exam_attempt: { data: examAttempt({ deadline_at: '2026-10-13T02:10:03.000Z' }) },
      submit_exam: { data: examResult({ status: 'submitted' }) },
    });
    const { result } = await renderRunning();
    expect(result.current.remainingMs).toBe(3000);
    await advance(2000);
    expect(calls('submit_exam')).toHaveLength(0);
    await advance(1000);
    expect(result.current.remainingMs).toBe(0);
    expect(calls('submit_exam')).toHaveLength(1);
    expect(result.current.status).toBe('finished');
    await advance(5000);
    expect(calls('submit_exam')).toHaveLength(1);
  });

  it('keeps the attempt open and explains a failed submit', async () => {
    server({
      get_exam_attempt: { data: examAttempt() },
      submit_exam: [{ error: { message: 'Bad gateway', code: '', status: 502 } }, { data: examResult() }],
    });
    const { result } = await renderRunning();
    await act(() => result.current.submit());
    expect(result.current.status).toBe('running');
    expect(result.current.error).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
    await act(() => result.current.submit());
    expect(result.current.status).toBe('finished');
    expect(result.current.error).toBeNull();
  });

  it('refuses to submit while answers are stuck offline, then auto-submits an expired attempt when back online', async () => {
    server({
      get_exam_attempt: { data: examAttempt({ deadline_at: '2026-10-13T02:10:02.000Z' }) },
      save_exam_answer: [OFFLINE, OFFLINE, saved()],
      submit_exam: { data: examResult() },
    });
    const { result } = await renderRunning();
    act(() => result.current.setAnswer(examQuestionId(3), '도와줄 수 있어요'));
    await advance(EXAM_SAVE_DEBOUNCE_MS);
    expect(result.current.saveState).toBe('offline');
    // Clock hits zero: the auto-submit flushes (fails again) and stops short of submit_exam.
    await advance(2000);
    expect(calls('submit_exam')).toHaveLength(0);
    expect(result.current.status).toBe('running');
    expect(result.current.error).toBe('Mất kết nối nên chưa lưu được hết câu trả lời. Kiểm tra mạng rồi nộp lại.');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls('save_exam_answer')).toHaveLength(3);
    expect(calls('submit_exam')).toHaveLength(1);
    expect(result.current.status).toBe('finished');
  });

  it('loads the stored result when submit finds the attempt already closed', async () => {
    server({
      get_exam_attempt: [{ data: examAttempt() }, { data: examResult({ status: 'expired' }) }],
      submit_exam: { error: { message: 'attempt_closed', code: 'P0001' } },
    });
    const { result } = await renderRunning();
    await act(() => result.current.submit());
    expect(result.current.status).toBe('finished');
    expect(result.current.result?.status).toBe('expired');
  });
});
