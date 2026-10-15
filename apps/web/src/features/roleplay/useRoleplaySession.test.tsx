import { act, renderHook, waitFor } from '@testing-library/react';
import { findRoleplayScenario, type AiSuccess } from '@linguo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiSuccess, quota } from '@/features/ai-tutor/ai-fixtures';
import { loadSession } from './storage';
import { useRoleplaySession } from './useRoleplaySession';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const USER = '11111111-1111-4111-8111-111111111111';
const CAFE = findRoleplayScenario('en', 'cafe_order')!;

const turnOk = (over: Record<string, unknown> = {}, responseId = '50000000-0000-4000-8000-000000000001'): AiSuccess =>
  aiSuccess({
    task: 'roleplay_turn',
    prompt_version: 'roleplay_turn@1',
    response_id: responseId,
    data: { partner_reply: 'Sure! Hot or iced?', hint_vi: null, corrections: [], goal_progress: [], finished: false, ...over },
    quota: quota(4, 20),
  });

const httpFail = async (status: number, body: unknown) => {
  const { FunctionsHttpError } = await import('@supabase/supabase-js');
  return { data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })) };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.client = { functions: { invoke: mocks.invoke }, rpc: vi.fn(), from: vi.fn() };
  sessionStorage.clear();
});
afterEach(() => mocks.invoke.mockReset());

const render = () => renderHook(() => useRoleplaySession(USER, 'en', 'a2'));

async function startedSession() {
  mocks.invoke.mockResolvedValueOnce({ data: turnOk({ partner_reply: 'Hi! What can I get you?' }), error: null });
  const hook = render();
  await act(async () => hook.result.current.start(CAFE));
  await waitFor(() => expect(hook.result.current.session?.messages).toHaveLength(1));
  return hook;
}

describe('useRoleplaySession', () => {
  it('starts with the opening turn (turn_index 0, no history)', async () => {
    const hook = await startedSession();
    expect(mocks.invoke.mock.calls[0]![1].body).toMatchObject({ task: 'roleplay_turn', turn_index: 0, history: [], learner_message: '', scenario_key: 'cafe_order' });
    expect(hook.result.current.session?.messages[0]).toMatchObject({ role: 'partner', text: 'Hi! What can I get you?' });
  });

  it('sends a learner message and adds the reply with its corrections and goals', async () => {
    const hook = await startedSession();
    mocks.invoke.mockResolvedValueOnce({
      data: turnOk({
        partner_reply: 'Hot or iced?',
        corrections: [{ original: 'I want', corrected: 'I would like', note_vi: 'Lịch sự hơn.' }],
        goal_progress: ['order_drink'],
      }),
      error: null,
    });
    let sent = false;
    act(() => {
      sent = hook.result.current.send('  I want a latte  ');
    });
    expect(sent).toBe(true);
    await waitFor(() => expect(hook.result.current.session?.messages).toHaveLength(3));
    const body = mocks.invoke.mock.calls[1]![1].body;
    expect(body).toMatchObject({ turn_index: 1, learner_message: 'I want a latte', history: [{ role: 'partner', text: 'Hi! What can I get you?' }] });
    expect(hook.result.current.session?.messages[1]).toMatchObject({ role: 'learner', status: 'ok' });
    expect(hook.result.current.session?.messages[1]?.corrections).toHaveLength(1);
    expect(hook.result.current.session?.goals).toEqual(['order_drink']);
  });

  it('guards against a double submit while a turn is in flight', async () => {
    const hook = await startedSession();
    const gate = deferred<unknown>();
    mocks.invoke.mockReturnValueOnce(gate.promise);
    act(() => {
      expect(hook.result.current.send('one')).toBe(true);
    });
    act(() => {
      expect(hook.result.current.send('two')).toBe(false);
    });
    await act(async () => {
      gate.resolve({ data: turnOk(), error: null });
    });
    await waitFor(() => expect(hook.result.current.session?.messages).toHaveLength(3));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed turn once and retries it without duplicating the learner message', async () => {
    const hook = await startedSession();
    mocks.invoke.mockResolvedValueOnce(await httpFail(503, { error: 'ai_unavailable', message: 'x', retry_after_sec: 30, quota: null }));
    act(() => {
      hook.result.current.send('I want a latte');
    });
    await waitFor(() => expect(hook.result.current.state).toBe('unavailable'));
    expect(hook.result.current.failedMessage?.text).toBe('I want a latte');
    expect(hook.result.current.stalled).toBe(true);
    // Nothing new can be sent while a turn waits for retry.
    act(() => {
      expect(hook.result.current.send('another')).toBe(false);
    });
    mocks.invoke.mockResolvedValueOnce({ data: turnOk(), error: null });
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.session?.messages).toHaveLength(3));
    expect(hook.result.current.session?.messages.filter((m) => m.role === 'learner')).toHaveLength(1);
    expect(hook.result.current.failedMessage).toBeNull();
    // Same request both times.
    expect(mocks.invoke.mock.calls[1]![1].body).toEqual(mocks.invoke.mock.calls[2]![1].body);
  });

  it('lets the learner take a failed message back to edit it', async () => {
    const hook = await startedSession();
    mocks.invoke.mockResolvedValueOnce(await httpFail(429, { error: 'quota_exceeded', message: 'x', retry_after_sec: null, quota: quota(20, 20) }));
    act(() => {
      hook.result.current.send('my words');
    });
    await waitFor(() => expect(hook.result.current.state).toBe('quota'));
    let text: string | null = null;
    act(() => {
      text = hook.result.current.takeBackFailed();
    });
    expect(text).toBe('my words');
    expect(hook.result.current.session?.messages).toHaveLength(1);
    expect(hook.result.current.stalled).toBe(false);
  });

  it('treats an answer that is not a role-play turn as a failed turn', async () => {
    const hook = await startedSession();
    mocks.invoke.mockResolvedValueOnce({ data: aiSuccess(), error: null });
    act(() => {
      hook.result.current.send('hello');
    });
    await waitFor(() => expect(hook.result.current.badAnswer).toBe(true));
    expect(hook.result.current.failedMessage?.text).toBe('hello');
  });

  it('retries a failed opening line', async () => {
    mocks.invoke.mockResolvedValueOnce(await httpFail(503, { error: 'ai_unavailable', message: 'x', retry_after_sec: null, quota: null }));
    const hook = render();
    await act(async () => hook.result.current.start(CAFE));
    await waitFor(() => expect(hook.result.current.state).toBe('unavailable'));
    expect(hook.result.current.stalled).toBe(true);
    mocks.invoke.mockResolvedValueOnce({ data: turnOk({ partner_reply: 'Welcome!' }), error: null });
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.session?.messages).toHaveLength(1));
  });

  it('stops accepting turns once the session is finished', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: turnOk({ finished: true }), error: null });
    const hook = render();
    await act(async () => hook.result.current.start(CAFE));
    await waitFor(() => expect(hook.result.current.session?.finished).toBe(true));
    act(() => {
      expect(hook.result.current.send('hello')).toBe(false);
    });
  });

  it('keeps the confirmed conversation in sessionStorage, restores it, and clears it on discard', async () => {
    const hook = await startedSession();
    expect(loadSession(USER, 'en')?.messages).toHaveLength(1);
    const restored = render();
    expect(restored.result.current.session?.messages[0]?.text).toBe('Hi! What can I get you?');
    // A session of another language is not restored.
    expect(renderHook(() => useRoleplaySession(USER, 'ko', 'topik1')).result.current.session).toBeNull();
    act(() => hook.result.current.discard());
    expect(hook.result.current.session).toBeNull();
    expect(loadSession(USER, 'en')).toBeNull();
  });

  it('drops a late answer after unmount', async () => {
    const gate = deferred<unknown>();
    mocks.invoke.mockReturnValueOnce(gate.promise);
    const hook = render();
    act(() => hook.result.current.start(CAFE));
    hook.unmount();
    await act(async () => {
      gate.resolve({ data: turnOk(), error: null });
    });
    // The opening line never arrived, so nothing resumable was saved.
    expect(loadSession(USER, 'en')).toBeNull();
  });
});
