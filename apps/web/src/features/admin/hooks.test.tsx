import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { ADMIN_USER_ID, auditEntryFixture, overviewFixture, REPORT_A1, reportListFixture, sourceFixture } from './admin-fixtures';
import { useAdminAudit } from './useAdminAudit';
import { useAdminOverview } from './useAdminOverview';
import { useAdminReports } from './useAdminReports';
import { useAdminSources } from './useAdminSources';
import { useStaffRole } from './useStaffRole';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as { rpc: typeof rpc } | null };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper(status: AuthState['status'] = 'signed-in') {
  const auth: AuthState =
    status === 'signed-in' ? { status, session: null, user: { id: ADMIN_USER_ID } as User } : { status, session: null, user: null };
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  };
}

function rpcTable(table: Record<string, { data: unknown; error?: unknown }>) {
  mocks.rpc.mockImplementation((name: string) => {
    const r = table[name];
    return Promise.resolve(r ? { data: r.data, error: r.error ?? null } : { data: null, error: { message: 'unknown_rpc', code: 'X' } });
  });
}

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.client = { rpc: mocks.rpc };
});

describe('useStaffRole', () => {
  it('is null without calling the RPC when signed out', () => {
    const { result } = renderHook(() => useStaffRole(), { wrapper: wrapper('signed-out') });
    expect(result.current).toMatchObject({ status: 'ready', role: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('waits for auth', () => {
    const { result } = renderHook(() => useStaffRole(), { wrapper: wrapper('loading') });
    expect(result.current.status).toBe('loading');
  });

  it('loads the role of the signed-in user', async () => {
    rpcTable({ staff_role: { data: 'editor' } });
    const { result } = renderHook(() => useStaffRole(), { wrapper: wrapper() });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.role).toBe('editor');
  });

  it('reports errors', async () => {
    rpcTable({ staff_role: { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } } });
    const { result } = renderHook(() => useStaffRole(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.role).toBeNull();
  });

  it('does not fetch when disabled', () => {
    renderHook(() => useStaffRole(false), { wrapper: wrapper() });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('admin resources', () => {
  it('load overview, sources and audit log', async () => {
    rpcTable({
      admin_content_overview: { data: overviewFixture() },
      admin_list_sources: { data: [sourceFixture()] },
      admin_audit_log_recent: { data: [auditEntryFixture()] },
    });
    const overview = renderHook(() => useAdminOverview(), { wrapper: wrapper() });
    const sources = renderHook(() => useAdminSources(), { wrapper: wrapper() });
    const audit = renderHook(() => useAdminAudit(10), { wrapper: wrapper() });
    await waitFor(() => expect(overview.result.current.status).toBe('ready'));
    await waitFor(() => expect(sources.result.current.data).toEqual([sourceFixture()]));
    await waitFor(() => expect(audit.result.current.data).toEqual([auditEntryFixture()]));
    expect(mocks.rpc).toHaveBeenCalledWith('admin_audit_log_recent', { p_limit: 10 });
  });

  it('maps errors to Vietnamese and retries on reload', async () => {
    rpcTable({ admin_content_overview: { data: null, error: { message: 'staff_forbidden', code: '42501' } } });
    const { result } = renderHook(() => useAdminOverview(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Bạn không có quyền thực hiện thao tác này.');
    rpcTable({ admin_content_overview: { data: overviewFixture() } });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('reports a missing client', async () => {
    mocks.client = null;
    const { result } = renderHook(() => useAdminSources(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Chưa cấu hình kết nối máy chủ.');
  });
});

describe('useAdminReports', () => {
  it('keeps the previous page on screen while the next loads', async () => {
    rpcTable({ admin_list_reports: { data: reportListFixture() } });
    const { result, rerender } = renderHook(({ page }: { page: number }) => useAdminReports({ status: 'open', kind: null, page }), {
      wrapper: wrapper(),
      initialProps: { page: 0 },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    rerender({ page: 1 });
    expect(result.current.status).toBe('loading');
    expect(result.current.data?.groups).toHaveLength(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith('admin_list_reports', { p_status: 'open', p_kind: null, p_limit: 20, p_offset: 20 });
  });

  it('resolves reports then reloads the queue', async () => {
    rpcTable({ admin_list_reports: { data: reportListFixture() }, admin_resolve_report: { data: { updated: 1 } } });
    const { result } = renderHook(() => useAdminReports({ status: 'open', kind: null, page: 0 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let updated = 0;
    await act(async () => {
      updated = await result.current.resolve([REPORT_A1], 'fixed', 'ok');
    });
    expect(updated).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_resolve_report', { p_report_ids: [REPORT_A1], p_status: 'fixed', p_resolution_note: 'ok' });
    await waitFor(() => expect(mocks.rpc.mock.calls.filter(([name]) => name === 'admin_list_reports')).toHaveLength(2));
    expect(result.current.resolving).toBe(false);
  });

  it('rejects with a Vietnamese message', async () => {
    rpcTable({
      admin_list_reports: { data: reportListFixture() },
      admin_resolve_report: { data: null, error: { message: 'invalid_report_status', code: 'P0001' } },
    });
    const { result } = renderHook(() => useAdminReports({ status: 'open', kind: null, page: 0 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await expect(result.current.resolve([REPORT_A1], 'fixed', '')).rejects.toThrow('Trạng thái báo lỗi không hợp lệ.');
    });
  });
});
