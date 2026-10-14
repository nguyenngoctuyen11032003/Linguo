import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEntryFixture, overviewFixture } from '@/features/admin/admin-fixtures';
import { renderAdmin, routeRpcs } from './admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  // One stable client, like the real singleton: a new object per call would re-run every effect forever.
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const robots = () => document.head.querySelector('meta[name="robots"]');

beforeEach(() => {
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
});
afterEach(() => {
  mocks.rpc.mockReset();
});

describe('AdminGuard', () => {
  it('shows the ordinary 404 page to signed-out visitors without asking the server', async () => {
    renderAdmin('/quan-tri', 'signed-out');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('shows the 404 page to learners (staff_role null)', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: null } });
    renderAdmin('/quan-tri/bao-loi');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng quản trị' })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_list_reports', expect.anything());
    expect(robots()).toBeNull();
  });

  it('shows the 404 page when staff_role fails with a server error', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: null, error: { message: 'boom', code: 'XX000' } } });
    renderAdmin('/quan-tri');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
  });

  it('shows a neutral loader while the role loads', () => {
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    renderAdmin('/quan-tri');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
  });

  it('renders the admin layout for staff, with noindex while mounted', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_content_overview: { data: overviewFixture() } });
    const { unmount } = renderAdmin('/quan-tri');
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(screen.getByText('Quản trị')).toBeInTheDocument();
    const links = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Tổng quan', 'Nội dung', 'Báo lỗi', 'Nguồn']);
    expect(screen.getByRole('link', { name: 'Về ứng dụng' })).toHaveAttribute('href', '/app');
    await waitFor(() => expect(robots()).toHaveAttribute('content', 'noindex'));
    unmount();
    expect(robots()).toBeNull();
  });

  it('restores an existing robots tag on unmount', async () => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'index, follow';
    document.head.appendChild(meta);
    routeRpcs(mocks.rpc, { staff_role: { data: 'admin' }, admin_content_overview: { data: overviewFixture() } });
    const { unmount } = renderAdmin('/quan-tri');
    await screen.findByRole('navigation', { name: 'Điều hướng quản trị' });
    // The layout sets the tag in an effect, which can run a moment after the nav is drawn.
    await waitFor(() => expect(meta.content).toBe('noindex'));
    unmount();
    expect(meta.content).toBe('index, follow');
  });

  it('lists the admin-only entries for admins', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'admin' }, admin_content_overview: { data: overviewFixture() } });
    renderAdmin('/quan-tri');
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(within(nav).getByRole('link', { name: 'Thống kê' })).toHaveAttribute('href', '/quan-tri/thong-ke');
    expect(within(nav).getByRole('link', { name: 'Nhật ký' })).toHaveAttribute('href', '/quan-tri/nhat-ky');
  });

  it('keeps Nhật ký for admins only', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'reviewer' }, admin_audit_log_recent: { data: [auditEntryFixture()] } });
    renderAdmin('/quan-tri/nhat-ky');
    expect(await screen.findByRole('heading', { name: 'Trang này chỉ dành cho quản trị viên' })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_audit_log_recent', expect.anything());
  });

  it('opens Nhật ký for admins', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'admin' }, admin_audit_log_recent: { data: [auditEntryFixture()] } });
    renderAdmin('/quan-tri/nhat-ky');
    expect(await screen.findByRole('heading', { name: 'Nhật ký quản trị' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('table', { name: 'Các thao tác gần đây' })).toBeInTheDocument());
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'staff_role')).toHaveLength(1);
  });

  it('offers a retry when the role check cannot reach the server', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } } });
    renderAdmin('/quan-tri');
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
  });
});
