import { act, renderHook, waitFor } from '@testing-library/react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { fakeQuery } from '../../../tests/unit/fake-supabase';
import { aiError, aiSuccess, explainRequest, quota } from './ai-fixtures';
import { useAiNotice } from './useAiNotice';
import { useAiQuota } from './useAiQuota';
import { useAiTutor } from './useAiTutor';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const invoke = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn();
  return { invoke, rpc, from, client: { functions: { invoke }, rpc, from } as unknown, configured: true };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => (mocks.configured ? mocks.client : null) }));

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  mocks.invoke.mockReset();
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.configured = true;
});

describe('useAiTutor', () => {
  it('goes idle → loading → ok', async () => {
    const reply = deferred<unknown>();
    mocks.invoke.mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAiTutor());
    expect(result.current).toMatchObject({ state: 'idle', result: null, error: null });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(explainRequest);
    });
    expect(result.current.state).toBe('loading');
    await act(async () => {
      reply.resolve({ data: aiSuccess(), error: null });
      await pending;
    });
    expect(result.current).toMatchObject({ state: 'ok', result: aiSuccess(), error: null });
  });

  it.each([
    [429, aiError('quota_exceeded', { quota: quota(20, 20) }), 'quota'],
    [503, aiError('ai_unavailable', { retry_after_sec: 30 }), 'unavailable'],
    [502, aiError('invalid_output'), 'error'],
    [401, aiError('unauthorized'), 'error'],
  ] as const)('maps HTTP %i to its state', async (status, body, state) => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(status, body) });
    const { result } = renderHook(() => useAiTutor());
    await act(() => result.current.run(explainRequest));
    expect(result.current).toMatchObject({ state, result: null, error: body });
  });

  it('is unavailable on a network failure or without supabase', async () => {
    mocks.invoke.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAiTutor());
    await act(() => result.current.run(explainRequest));
    expect(result.current.state).toBe('unavailable');
    mocks.configured = false;
    await act(() => result.current.run(explainRequest));
    expect(result.current.state).toBe('unavailable');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps one request in flight', async () => {
    const reply = deferred<unknown>();
    mocks.invoke.mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAiTutor());
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.run(explainRequest);
      second = result.current.run(explainRequest);
    });
    expect(await second).toBeNull();
    await act(async () => {
      reply.resolve({ data: aiSuccess(), error: null });
      await first;
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    mocks.invoke.mockResolvedValue({ data: aiSuccess({ cached: true }), error: null });
    await act(() => result.current.run(explainRequest));
    expect(result.current.result?.cached).toBe(true);
  });

  it('reset discards an answer in flight', async () => {
    const reply = deferred<unknown>();
    mocks.invoke.mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAiTutor());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(explainRequest);
    });
    act(() => result.current.reset());
    expect(result.current.state).toBe('idle');
    await act(async () => {
      reply.resolve({ data: aiSuccess(), error: null });
      expect(await pending).toBeNull();
    });
    expect(result.current).toMatchObject({ state: 'idle', result: null });
  });
});

describe('useAiQuota', () => {
  it('loads the quota with the display default limit', async () => {
    mocks.rpc.mockResolvedValue({ data: quota(5, 20), error: null });
    const { result } = renderHook(() => useAiQuota(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.quota).toEqual(quota(5, 20));
    expect(result.current.remaining).toBe(15);
    expect(mocks.rpc).toHaveBeenCalledWith('ai_quota_status', { p_limit: 20 });
  });

  it('maps errors and refreshes', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'not_authenticated', code: '42501' } });
    const { result } = renderHook(() => useAiQuota(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    mocks.rpc.mockResolvedValue({ data: quota(25, 20), error: null });
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.remaining).toBe(0);
  });

  it('takes the quota of each AI answer, or refetches when it has none', async () => {
    mocks.rpc.mockResolvedValue({ data: quota(3, 20), error: null });
    const quotaHook = renderHook(() => useAiQuota(), { wrapper });
    await waitFor(() => expect(quotaHook.result.current.status).toBe('ready'));
    const tutor = renderHook(() => useAiTutor());

    mocks.invoke.mockResolvedValue({ data: aiSuccess({ quota: quota(4, 30) }), error: null });
    await act(() => tutor.result.current.run(explainRequest));
    expect(quotaHook.result.current.quota).toEqual(quota(4, 30));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockResolvedValue({ data: quota(4, 20), error: null });
    mocks.invoke.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(() => tutor.result.current.run(explainRequest));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(quotaHook.result.current.quota).toEqual(quota(4, 20)));
  });
});

describe('useAiNotice', () => {
  it('reads ai_notice_ack_at of the user', async () => {
    const q = fakeQuery({ data: { ai_notice_ack_at: '2026-10-01T00:00:00Z' } });
    mocks.from.mockReturnValue(q.builder);
    const { result } = renderHook(() => useAiNotice(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ acknowledged: true, ackAt: '2026-10-01T00:00:00Z' });
    expect(mocks.from).toHaveBeenCalledWith('user_preferences');
    expect(q.calls).toEqual([
      ['select', ['ai_notice_ack_at']],
      ['eq', ['user_id', USER_ID]],
      ['maybeSingle', []],
    ]);
  });

  it('acknowledges through ack_ai_notice', async () => {
    mocks.from.mockReturnValue(fakeQuery({ data: { ai_notice_ack_at: null } }).builder);
    mocks.rpc.mockResolvedValue({ data: '2026-10-13T08:00:00Z', error: null });
    const { result } = renderHook(() => useAiNotice(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.acknowledged).toBe(false);
    let saved = false;
    await act(async () => {
      saved = await result.current.ack();
    });
    expect(saved).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('ack_ai_notice', {});
    expect(result.current).toMatchObject({ acknowledged: true, ackAt: '2026-10-13T08:00:00Z', saving: false, error: null });
  });

  it('reports load and ack failures', async () => {
    mocks.from.mockReturnValue(fakeQuery({ data: null }).builder);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    const { result } = renderHook(() => useAiNotice(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.acknowledged).toBe(false);
    let saved = true;
    await act(async () => {
      saved = await result.current.ack();
    });
    expect(saved).toBe(false);
    expect(result.current.acknowledged).toBe(false);
    expect(result.current.error).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');

    mocks.from.mockReturnValue(fakeQuery({ data: null, error: { message: 'boom_failure' } }).builder);
    const failed = renderHook(() => useAiNotice(), { wrapper });
    await waitFor(() => expect(failed.result.current.status).toBe('error'));
  });
});
