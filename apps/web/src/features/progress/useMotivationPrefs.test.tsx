import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { fakeQuery, type FakeQuery } from '../../../tests/unit/fake-supabase';
import { subscribeMotivationPrefs } from './prefs-events';
import { useMotivationPrefs } from './useMotivationPrefs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PREFS = { show_motivation: true, analytics_opt_out: false };

const mocks = vi.hoisted(() => {
  const queries: FakeQuery[] = [];
  const from = vi.fn(() => {
    const q = queries.shift();
    if (!q) throw new Error('no more fake queries');
    return q.builder;
  });
  return { queries, from, client: { from } as unknown };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function queue(...results: Array<{ data: unknown; error?: unknown }>): FakeQuery[] {
  const qs = results.map((r) => fakeQuery(r));
  mocks.queries.push(...qs);
  return qs;
}

afterEach(() => {
  mocks.queries.length = 0;
  mocks.from.mockClear();
  mocks.client = { from: mocks.from };
});

describe('useMotivationPrefs', () => {
  it('loads the preferences of the signed-in user', async () => {
    const [read] = queue({ data: PREFS });
    const { result } = renderHook(() => useMotivationPrefs(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.prefs).toEqual(PREFS);
    expect(read!.calls).toContainEqual(['eq', ['user_id', USER_ID]]);
  });

  it('saves a patch, exposes saving and broadcasts the new values', async () => {
    const [, write] = queue({ data: PREFS }, { data: [{ show_motivation: false, analytics_opt_out: false }] });
    const heard = vi.fn();
    const unsubscribe = subscribeMotivationPrefs(heard);
    const { result } = renderHook(() => useMotivationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let saved!: Promise<void>;
    act(() => {
      saved = result.current.update({ show_motivation: false });
    });
    expect(result.current.saving).toBe(true);
    await act(async () => saved);
    expect(result.current.saving).toBe(false);
    expect(result.current.prefs).toEqual({ show_motivation: false, analytics_opt_out: false });
    expect(write!.calls[0]).toEqual(['update', [{ show_motivation: false }]]);
    expect(heard).toHaveBeenCalledWith(USER_ID, { show_motivation: false, analytics_opt_out: false });
    unsubscribe();
  });

  it('keeps the saved values and reports a failed save without rejecting', async () => {
    queue({ data: PREFS }, { data: [] });
    const { result } = renderHook(() => useMotivationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => result.current.update({ analytics_opt_out: true }));
    expect(result.current.prefs).toEqual(PREFS);
    expect(result.current.error).toBe('Không lưu được cài đặt. Vui lòng thử lại.');
    expect(result.current.saving).toBe(false);
  });

  it('follows a change saved by another instance', async () => {
    queue({ data: PREFS }, { data: PREFS }, { data: [{ show_motivation: true, analytics_opt_out: true }] });
    const reader = renderHook(() => useMotivationPrefs(), { wrapper });
    const writer = renderHook(() => useMotivationPrefs(), { wrapper });
    await waitFor(() => expect(reader.result.current.status).toBe('ready'));
    await waitFor(() => expect(writer.result.current.status).toBe('ready'));
    await act(async () => writer.result.current.update({ analytics_opt_out: true }));
    expect(reader.result.current.prefs).toEqual({ show_motivation: true, analytics_opt_out: true });
  });

  it('maps load errors', async () => {
    queue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    const { result } = renderHook(() => useMotivationPrefs(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  });
});
