import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_USER_ID } from '../../../../tests/unit/render';
import { submitArgs } from '@/features/lesson-player/lesson-fixtures';
import { createOutbox } from '@/features/lesson-player/outbox';
import { AccountDataSection } from './AccountDataSection';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signOut: vi.fn(), download: vi.fn(), hardNavigate: vi.fn() }));

vi.mock('@/lib/hard-navigate', () => ({ hardNavigate: mocks.hardNavigate }));

vi.mock('@/lib/supabase', () => {
  const client = { rpc: mocks.rpc, auth: { signOut: mocks.signOut } };
  return { getSupabase: () => client, requireSupabase: () => client };
});
vi.mock('@/features/account/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account/service')>()),
  downloadJson: mocks.download,
}));

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.download.mockReset();
  mocks.hardNavigate.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  // 20:00 UTC on 12 Oct is 13 Oct in Asia/Ho_Chi_Minh (the test profile).
  vi.setSystemTime(new Date('2026-10-12T20:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function render() {
  return renderWithProviders(<AccountDataSection />, { route: '/app/cai-dat' });
}

describe('AccountDataSection', () => {
  it('describes stored data and retention, and links the legal pages', () => {
    render();
    expect(screen.getByRole('heading', { level: 2, name: 'Tài khoản và dữ liệu' })).toBeInTheDocument();
    expect(screen.getByText(/Không lưu nội dung câu hỏi bạn gửi cho AI/)).toBeInTheDocument();
    expect(screen.getByText(/Nhật ký lượt dùng AI tự xoá sau 90 ngày/)).toBeInTheDocument();
    expect(screen.getByText(/tự hết hạn sau 30 ngày/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
    expect(screen.getByRole('link', { name: 'Điều khoản sử dụng' })).toHaveAttribute('href', '/dieu-khoan');
  });

  it('downloads the export as linguo-du-lieu-<local date>.json', async () => {
    const data = { profile: { id: TEST_USER_ID } };
    mocks.rpc.mockResolvedValue({ data, error: null });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu của tôi' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(data, 'linguo-du-lieu-2026-10-13.json'));
    expect(mocks.rpc).toHaveBeenCalledWith('export_my_data');
    expect(await screen.findByText('Đã tải dữ liệu của bạn.')).toBeInTheDocument();
  });

  it('reports a rate-limited export in Vietnamese', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited', code: 'P0001' } });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu của tôi' }));
    expect(await screen.findByText(/tải dữ liệu nhiều lần/)).toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('deletes only after the exact phrase, then clears local data, signs out and goes home', async () => {
    createOutbox(TEST_USER_ID).add({ args: submitArgs(), queueIndex: 0 });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá tài khoản' }));
    const dialog = screen.getByRole('dialog', { name: 'Xoá vĩnh viễn tài khoản?' });
    expect(within(dialog).getByText(/không thể hoàn tác/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Mọi lộ trình/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' });
    const input = within(dialog).getByLabelText(/để xác nhận/);
    await userEvent.type(input, 'xoa tai khoan');
    expect(confirm).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'XOA TAI KHOAN');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.rpc).toHaveBeenCalledWith('delete_my_account', { p_confirm: 'XOA TAI KHOAN' });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.hardNavigate).toHaveBeenCalledWith('/');
    expect(createOutbox(TEST_USER_ID).list()).toEqual([]);
  });

  it('keeps the dialog open with the error when deletion fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá tài khoản' }));
    await userEvent.type(screen.getByLabelText(/để xác nhận/), 'XOA TAI KHOAN');
    await userEvent.click(screen.getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat');
  });

  it('closes on Huỷ and Escape without calling the server', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá tài khoản' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá tài khoản' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
