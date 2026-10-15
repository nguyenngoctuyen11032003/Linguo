import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REPORT_A1,
  REPORT_A2,
  REPORT_TARGET_A,
  auditEntryFixture,
  overviewFixture,
  reportListFixture,
  sourceFixture,
} from '@/features/admin/admin-fixtures';
import { renderAdmin, routeRpcs } from './admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  // One stable client, like the real singleton.
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

afterEach(() => {
  mocks.rpc.mockReset();
});

describe('OverviewPage', () => {
  it('shows metric cards, review warnings and the open report count', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_content_overview: { data: overviewFixture() } });
    renderAdmin('/quan-tri');
    expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
    await screen.findByText('Báo lỗi đang mở');
    expect(screen.getByText('200')).toBeInTheDocument(); // 12 + 3 + 5 + 140 + 40
    expect(screen.getByRole('note')).toHaveTextContent('8 mục nội dung demo');
    expect(screen.getByText('Có 3 báo lỗi đang chờ xử lý.')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Số lượng theo loại nội dung' });
    expect(within(table).getByRole('rowheader', { name: 'Bài học' })).toBeInTheDocument();
  });
});

describe('SourcesPage', () => {
  it('lists sources with license and attribution, linking only http(s) urls', async () => {
    routeRpcs(mocks.rpc, {
      staff_role: { data: 'editor' },
      admin_list_sources: {
        data: [sourceFixture(), sourceFixture({ id: '40000000-0000-4000-8000-000000000002', name: 'Lạ', url: 'javascript:alert(1)', license: null })],
      },
    });
    renderAdmin('/quan-tri/nguon');
    const table = await screen.findByRole('table', { name: 'Danh sách nguồn nội dung' });
    expect(within(table).getByRole('link', { name: 'Tatoeba' })).toHaveAttribute('href', 'https://tatoeba.org/');
    expect(within(table).queryByRole('link', { name: 'Lạ' })).not.toBeInTheDocument();
    expect(within(table).getByText('Chưa khai báo')).toBeInTheDocument();
  });
});

describe('AuditLogPage', () => {
  it('labels the actions and targets the database actually writes', async () => {
    routeRpcs(mocks.rpc, {
      staff_role: { data: 'admin' },
      admin_audit_log_recent: {
        data: [
          auditEntryFixture(),
          auditEntryFixture({ id: '50000000-0000-4000-8000-000000000002', action: 'read_answers', target_kind: 'exercise', detail: { key: 'en.a1.x' } }),
          auditEntryFixture({ id: '50000000-0000-4000-8000-000000000003', action: 'some_new_action', target_kind: 'mystery' }),
        ],
      },
    });
    renderAdmin('/quan-tri/nhat-ky');
    const table = await screen.findByRole('table', { name: 'Các thao tác gần đây' });
    expect(within(table).getByRole('rowheader', { name: 'Xử lý báo lỗi' })).toBeInTheDocument();
    expect(within(table).getByText('Báo lỗi nội dung')).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Xem đáp án' })).toBeInTheDocument();
    expect(within(table).getByText('Bài tập')).toBeInTheDocument();
    // Unknown codes stay readable instead of disappearing.
    expect(within(table).getByRole('rowheader', { name: 'some_new_action' })).toBeInTheDocument();
    expect(within(table).getByText('mystery')).toBeInTheDocument();
  });
});

describe('ReportsPage', () => {
  it('loads open reports and resolves the selected groups in bulk with a note', async () => {
    const resolve = vi.fn(() => ({ data: { updated: 2 } }));
    routeRpcs(mocks.rpc, {
      staff_role: { data: 'reviewer' },
      admin_list_reports: { data: reportListFixture() },
      admin_resolve_report: resolve,
    });
    const user = userEvent.setup();
    renderAdmin('/quan-tri/bao-loi');

    const table = await screen.findByRole('table', { name: 'Hàng đợi báo lỗi, nhóm theo nội dung' });
    expect(mocks.rpc).toHaveBeenCalledWith('admin_list_reports', { p_status: 'open', p_kind: null, p_limit: 20, p_offset: 0 });
    expect(within(table).getByRole('link', { name: /I ___ a student/ })).toHaveAttribute('href', `/quan-tri/noi-dung/exercise/${REPORT_TARGET_A}`);

    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeDisabled();
    await user.click(within(table).getByRole('checkbox', { name: /Chọn "Chọn từ đúng/ }));
    await user.type(screen.getByLabelText(/Ghi chú xử lý/), '  đã sửa  ');
    await user.click(screen.getByRole('button', { name: 'Áp dụng cho 2 báo lỗi' }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith({ p_report_ids: [REPORT_A1, REPORT_A2], p_status: 'fixed', p_resolution_note: 'đã sửa' }));
    expect(await screen.findByText('Đã đánh dấu 2 báo lỗi là "Đã sửa".')).toBeInTheDocument();
    await waitFor(() => expect(mocks.rpc.mock.calls.filter(([name]) => name === 'admin_list_reports').length).toBeGreaterThanOrEqual(2));
  });

  it('shows the Vietnamese error when resolving fails', async () => {
    routeRpcs(mocks.rpc, {
      staff_role: { data: 'editor' },
      admin_list_reports: { data: reportListFixture() },
      admin_resolve_report: { data: null, error: { message: 'staff_forbidden', code: '42501' } },
    });
    const user = userEvent.setup();
    renderAdmin('/quan-tri/bao-loi');
    await user.click(await screen.findByRole('checkbox', { name: 'Chọn tất cả nội dung trên trang' }));
    await user.click(screen.getByRole('button', { name: 'Áp dụng cho 3 báo lỗi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này.');
  });

  it('refetches with the chosen filters', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_list_reports: { data: reportListFixture({ groups: [], total_groups: 0 }) } });
    const user = userEvent.setup();
    renderAdmin('/quan-tri/bao-loi');
    expect(await screen.findByText('Không có báo lỗi')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Loại nội dung'), 'learning_item');
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('admin_list_reports', { p_status: 'open', p_kind: 'learning_item', p_limit: 20, p_offset: 0 }),
    );
  });
});
