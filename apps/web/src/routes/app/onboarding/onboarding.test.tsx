import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { OnboardingPage } from './OnboardingPage';

const mocks = vi.hoisted(() => ({ createPath: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/useReferenceHours', () => ({
  useReferenceHours: () => ({ status: 'ready', data: REFERENCE, retry: vi.fn() }),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  createPath: mocks.createPath,
}));

const page = (paths: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/bat-dau" element={<OnboardingPage />} />
      <Route path="*" element={null} />
    </Routes>,
    { route: '/app/bat-dau', paths: { paths: [] }, ...paths },
  );

const next = () => userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

beforeEach(() => {
  mocks.createPath.mockReset();
});

describe('OnboardingPage', () => {
  it('walks all steps and creates the path', async () => {
    const upsertPath = vi.fn();
    page({ paths: { paths: [], upsertPath } });
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Trình độ hiện tại của bạn' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    expect(screen.getByRole('radio', { name: /^B1/ })).toBeChecked();
    await next();
    expect(screen.getByRole('radio', { name: '30 phút mỗi ngày' })).toBeChecked();
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Xem lại lộ trình' })).toBeInTheDocument();
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();

    mocks.createPath.mockResolvedValue(TEST_PATH);
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(mocks.createPath).toHaveBeenCalledWith(
      {},
      {
        language: 'en',
        startPoint: 'some',
        goalType: 'daily_communication',
        currentLevel: 'a2',
        targetLevel: 'b1',
        weeklyMinutes: [30, 30, 30, 30, 30, 30, 30],
        targetDate: null,
      },
    );
    expect(upsertPath).toHaveBeenCalledWith(TEST_PATH, { makeCurrent: true });
    expect(await screen.findByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeInTheDocument();
    expect(localStorage.getItem('linguo-onboarding-draft')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Vào trang chủ' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('skips the level step for complete beginners', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi mới hoàn toàn' }));
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'Mục tiêu của bạn' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ tạo lộ trình' })).toHaveAttribute('aria-valuetext', 'Bước 3 trên 5');
  });

  it('restores the draft after a reload and discards a corrupt one', async () => {
    const first = page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    first.unmount();
    const second = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn đang ở đâu?' })).toBeInTheDocument();
    second.unmount();

    localStorage.setItem('linguo-onboarding-draft', '{not json');
    const again = page();
    expect(screen.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeInTheDocument();
    expect(await screen.findByText(/Bản nháp cũ không dùng được nữa/)).toBeInTheDocument();
    again.unmount();
  });

  it('locks languages that already have a path and preselects ?lang', () => {
    renderWithProviders(
      <Routes>
        <Route path="/app/bat-dau" element={<OnboardingPage />} />
      </Routes>,
      { route: '/app/bat-dau?lang=en', paths: { paths: [TEST_PATH] } },
    );
    const en = screen.getByRole('radio', { name: /Tiếng Anh/ });
    expect(en).toBeDisabled();
    expect(screen.getByText('Đã có lộ trình')).toBeInTheDocument();
  });

  it('keeps the draft and shows a Vietnamese error when creation fails', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    await next();
    await next();
    mocks.createPath.mockRejectedValue({ code: 'P0001', message: 'path_exists_for_language' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lộ trình' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã có lộ trình cho ngôn ngữ này.');
    expect(localStorage.getItem('linguo-onboarding-draft')).not.toBeNull();
  });

  it('offers to raise daily minutes when the deadline is too close', async () => {
    page();
    await userEvent.click(screen.getByRole('radio', { name: /Tiếng Anh/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Tôi đã học một ít' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: /^A2/ }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Giao tiếp đời sống' }));
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'Trong số tuần' }));
    await userEvent.type(screen.getByLabelText('Số tuần'), '4');
    await next();
    expect(screen.getByText('Cần tăng thời lượng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dùng 397 phút/ngày' }));
    await waitFor(() => expect(screen.getByText('Thời hạn khá căng')).toBeInTheDocument());
  });
});
