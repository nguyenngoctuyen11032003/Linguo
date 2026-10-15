import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiUsageFixture, analyticsFixture } from '@/features/admin/content-fixtures';
import { renderAdmin, routeRpcs } from '../admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  // One stable client, like the real singleton.
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

afterEach(() => {
  mocks.rpc.mockReset();
});

function rpcs(role: string) {
  routeRpcs(mocks.rpc, {
    staff_role: { data: role },
    admin_analytics: (args) => ({ data: analyticsFixture(args.p_days === 7 ? 7 : 28) }),
    admin_ai_usage: (args) => ({ data: aiUsageFixture(Number(args.p_days)) }),
  });
}

describe('AnalyticsPage', () => {
  it('shows usage, the funnel and AI usage for the default 28 days', async () => {
    rpcs('admin');
    renderAdmin('/quan-tri/thong-ke');
    expect(await screen.findByText('Số liệu 28 ngày gần nhất.')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('admin_analytics', { p_days: 28 });
    expect(mocks.rpc).toHaveBeenCalledWith('admin_ai_usage', { p_days: 28 });
    expect(screen.getByRole('button', { name: '28 ngày' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /Người dùng hoạt động mỗi ngày trong 28 ngày/ })).toBeInTheDocument();

    const funnel = screen.getByRole('list', { name: 'Phễu người dùng' });
    expect(within(funnel).getAllByRole('listitem')).toHaveLength(5);
    expect(funnel).toHaveTextContent('30% so với đăng ký');

    const ai = screen.getByRole('table', { name: 'Số request AI theo tác vụ và trạng thái' });
    expect(within(ai).getByRole('rowheader', { name: 'Giải thích khái niệm' })).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
  });

  it('lists client errors by kind and route', async () => {
    rpcs('admin');
    renderAdmin('/quan-tri/thong-ke');
    await screen.findByText('Số liệu 28 ngày gần nhất.');
    const table = screen.getByRole('table', { name: /Lỗi phía người dùng theo loại và màn hình/ });
    expect(within(table).getByText('/app/hoc-tap/bai/:lessonId')).toBeInTheDocument();
    expect(within(table).getByText('Không tải được mã trang')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lỗi phía người dùng' })).toBeInTheDocument();
  });

  it('switches the range', async () => {
    rpcs('admin');
    const user = userEvent.setup();
    renderAdmin('/quan-tri/thong-ke');
    await screen.findByText('Số liệu 28 ngày gần nhất.');
    await user.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('admin_analytics', { p_days: 7 }));
    expect(await screen.findByText('Số liệu 7 ngày gần nhất.')).toBeInTheDocument();
  });

  it('is reserved for admins', async () => {
    rpcs('reviewer');
    renderAdmin('/quan-tri/thong-ke');
    expect(await screen.findByRole('heading', { name: 'Trang này chỉ dành cho quản trị viên' })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_analytics', expect.anything());
  });
});
