import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAdmin, routeRpcs } from './admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc }, isFramed: vi.fn(() => false), breakOutOfFrame: vi.fn() };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));
vi.mock('@/features/admin/frame-guard', () => ({ isFramed: mocks.isFramed, breakOutOfFrame: mocks.breakOutOfFrame }));

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.isFramed.mockReset().mockReturnValue(false);
  mocks.breakOutOfFrame.mockReset();
});

describe('AdminLayout frame guard', () => {
  it('renders the admin navigation when the page is top-level', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_content_overview: { data: null, error: { message: 'x', code: 'X' } } });
    renderAdmin('/quan-tri');
    expect(await screen.findByRole('navigation', { name: 'Điều hướng quản trị' })).toBeInTheDocument();
    expect(mocks.breakOutOfFrame).not.toHaveBeenCalled();
  });

  it('renders nothing sensitive inside a frame, breaks out and does not load admin data', async () => {
    mocks.isFramed.mockReturnValue(true);
    routeRpcs(mocks.rpc, { staff_role: { data: 'admin' } });
    renderAdmin('/quan-tri');
    expect(await screen.findByText('Trang quản trị không được hiển thị bên trong trang khác.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng quản trị' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang quản trị trong cửa sổ riêng' })).toHaveAttribute('target', '_top');
    expect(mocks.breakOutOfFrame).toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_content_overview', expect.anything());
  });
});
