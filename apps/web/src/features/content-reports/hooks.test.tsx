import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { myReportFixture, REPORT_ITEM_ID, reportResultFixture } from './content-report-fixtures';
import { useMyReports } from './useMyReports';
import { useReportContent } from './useReportContent';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as unknown };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.client = { rpc: mocks.rpc };
});

const INPUT = { targetKind: 'learning_item' as const, targetId: REPORT_ITEM_ID, reason: 'typo' as const, note: '' };

describe('useReportContent', () => {
  it('submits, exposes the submitting state and the result', async () => {
    let answer!: (v: unknown) => void;
    mocks.rpc.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useReportContent());
    expect(result.current.status).toBe('idle');

    let sent!: Promise<unknown>;
    act(() => {
      sent = result.current.submit(INPUT);
    });
    expect(result.current.status).toBe('submitting');
    await act(async () => {
      answer({ data: reportResultFixture({ status: 'duplicate' }), error: null });
      await sent;
    });
    expect(result.current.status).toBe('success');
    expect(result.current.result?.status).toBe('duplicate');
    expect(mocks.rpc).toHaveBeenCalledWith('report_content', {
      p_target_kind: 'learning_item',
      p_target_id: REPORT_ITEM_ID,
      p_reason: 'typo',
      p_note: null,
    });
  });

  it('ignores a second submit while one is in flight', async () => {
    mocks.rpc.mockResolvedValue({ data: reportResultFixture(), error: null });
    const { result } = renderHook(() => useReportContent());
    await act(async () => {
      await Promise.all([result.current.submit(INPUT), result.current.submit(INPUT)]);
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('maps failures to Vietnamese and never rejects', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited', code: 'P0001' } });
    const { result } = renderHook(() => useReportContent());
    let returned: unknown = 'unset';
    await act(async () => {
      returned = await result.current.submit(INPUT);
    });
    expect(returned).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Bạn đã gửi nhiều báo lỗi hôm nay, thử lại vào ngày mai nhé');

    act(() => result.current.reset());
    expect(result.current).toMatchObject({ status: 'idle', error: null, result: null });
  });

  it('reports a missing Supabase configuration', async () => {
    mocks.client = null;
    const { result } = renderHook(() => useReportContent());
    await act(async () => {
      await result.current.submit(INPUT);
    });
    expect(result.current.error).toBe('Chưa cấu hình kết nối máy chủ.');
  });
});

describe('useMyReports', () => {
  it('loads the reports with the default limit', async () => {
    mocks.rpc.mockResolvedValue({ data: [myReportFixture()], error: null });
    const { result } = renderHook(() => useMyReports());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.reports).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_reports', { p_limit: 50 });
  });

  it('shows an error and reloads on demand', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'not_authenticated', code: 'P0001' } });
    const { result } = renderHook(() => useMyReports(10));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.reports).toEqual([]);
    expect(mocks.rpc).toHaveBeenLastCalledWith('list_my_reports', { p_limit: 10 });
  });
});
