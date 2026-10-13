import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { PATH_ID, examHistory, topikIForm, topikIIForm } from './exam-fixtures';
import { useExamForms } from './useExamForms';
import { useExamHistory } from './useExamHistory';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function reply(fn: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    const { data = null, error = null } = fn(name, args);
    return Promise.resolve({ data, error });
  });
}

afterEach(() => mocks.rpc.mockReset());

describe('useExamForms', () => {
  it('loads the forms of a language', async () => {
    reply(() => ({ data: [topikIForm(), topikIIForm()] }));
    const { result } = renderHook(() => useExamForms('ko'), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.forms).toEqual([topikIForm(), topikIIForm()]);
    expect(mocks.rpc.mock.calls).toEqual([['list_exam_forms', { p_language: 'ko' }]]);
  });

  it('stays idle without a language', () => {
    reply(() => ({ data: [] }));
    const { result } = renderHook(() => useExamForms(null), { wrapper });
    expect(result.current.status).toBe('idle');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refetches when the language changes', async () => {
    reply((_, args) => ({ data: args.p_language === 'ko' ? [topikIForm()] : [] }));
    const { result, rerender } = renderHook(({ lang }: { lang: 'en' | 'ko' }) => useExamForms(lang), {
      wrapper,
      initialProps: { lang: 'ko' },
    });
    await waitFor(() => expect(result.current.forms).toHaveLength(1));
    rerender({ lang: 'en' });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.forms).toEqual([]);
  });

  it('maps errors and reloads', async () => {
    let fail = true;
    reply(() => (fail ? { error: { message: 'TypeError: Failed to fetch', code: '' } } : { data: [topikIForm()] }));
    const { result } = renderHook(() => useExamForms('ko'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

describe('useExamHistory', () => {
  it('loads the recent attempts of a path', async () => {
    reply(() => ({ data: examHistory() }));
    const { result } = renderHook(() => useExamHistory(PATH_ID, 5), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.entries).toEqual(examHistory());
    expect(mocks.rpc.mock.calls).toEqual([['exam_history', { p_path_id: PATH_ID, p_limit: 5 }]]);
  });

  it('uses a default limit and stays idle without a path', async () => {
    reply(() => ({ data: [] }));
    const { result, rerender } = renderHook(({ path }: { path: string | null }) => useExamHistory(path), {
      wrapper,
      initialProps: { path: null as string | null },
    });
    expect(result.current.status).toBe('idle');
    rerender({ path: PATH_ID });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mocks.rpc.mock.calls).toEqual([['exam_history', { p_path_id: PATH_ID, p_limit: 10 }]]);
  });

  it('maps errors and reloads', async () => {
    let fail = true;
    reply(() => (fail ? { error: { message: 'path_not_found', code: 'P0001' } } : { data: examHistory() }));
    const { result } = renderHook(() => useExamHistory(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.entries).toHaveLength(3));
  });
});
