import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { myReportFixture } from '@/features/content-reports/content-report-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { MyReportsSection } from './MyReportsSection';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as unknown };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

afterEach(() => {
  mocks.rpc.mockReset();
});

describe('MyReportsSection', () => {
  it('lists the reports with Vietnamese status chips, reason, date and resolution note', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        myReportFixture({ note: 'Phải là am' }),
        myReportFixture({
          id: '30000000-0000-4000-8000-0000000000bb',
          target_kind: 'learning_item',
          target_label: '학교',
          reason: 'typo',
          status: 'fixed',
          resolution_note: 'Đã sửa chính tả, cảm ơn bạn.',
          // 20:00 UTC is the next day in Asia/Ho_Chi_Minh (the test profile).
          created_at: '2026-10-10T20:00:00Z',
          resolved_at: '2026-10-12T03:00:00Z',
        }),
        myReportFixture({ id: '30000000-0000-4000-8000-0000000000cc', status: 'triaged', target_label: null }),
        myReportFixture({ id: '30000000-0000-4000-8000-0000000000dd', status: 'rejected' }),
        myReportFixture({ id: '30000000-0000-4000-8000-0000000000ee', status: 'duplicate' }),
      ],
      error: null,
    });
    renderWithProviders(<MyReportsSection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('heading', { level: 2, name: 'Báo lỗi của tôi' })).toBeInTheDocument();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(screen.getAllByTestId('report-status').map((chip) => chip.textContent)).toEqual([
      'Đang chờ xem',
      'Đã sửa',
      'Đang xử lý',
      'Không cần sửa',
      'Trùng báo lỗi khác',
    ]);
    expect(within(items[0]!).getByText('Bài tập')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Đáp án sai/)).toBeInTheDocument();
    expect(within(items[0]!).getByText('Ghi chú: Phải là am')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Thẻ từ vựng')).toBeInTheDocument();
    expect(within(items[1]!).getByText('학교')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/11\/10\/2026/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Đã sửa chính tả, cảm ơn bạn.')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/Phản hồi từ Linguo/)).toBeInTheDocument();
    expect(within(items[2]!).getByText('Nội dung không còn hiển thị')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_reports', { p_limit: 50 });
  });

  it('shows a friendly empty state', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    renderWithProviders(<MyReportsSection />, { route: '/app/cai-dat' });
    expect(await screen.findByTestId('my-reports-empty')).toHaveTextContent('Bạn chưa gửi báo lỗi nào.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    renderWithProviders(<MyReportsSection />, { route: '/app/cai-dat' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ.');
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByTestId('my-reports-empty')).toBeInTheDocument();
  });
});
