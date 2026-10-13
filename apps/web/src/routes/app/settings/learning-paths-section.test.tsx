import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { LearningPathsSection } from './LearningPathsSection';

const mocks = vi.hoisted(() => ({ setPathStatus: vi.fn(), updatePlan: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/useReferenceHours', () => ({
  useReferenceHours: () => ({ status: 'ready', data: REFERENCE, retry: vi.fn() }),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
  updatePlan: mocks.updatePlan,
}));

beforeEach(() => {
  mocks.setPathStatus.mockReset();
  mocks.updatePlan.mockReset();
});

describe('LearningPathsSection', () => {
  it('lists the learning paths', () => {
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    const section = screen.getByRole('region', { name: 'Lộ trình học' });
    expect(within(section).getByText('Tiếng Anh · Giao tiếp đời sống')).toBeInTheDocument();
    expect(within(section).getByText('A2 → B1 · khoảng 43–69 tuần')).toBeInTheDocument();
  });

  it('links to add the missing language', () => {
    renderWithProviders(<LearningPathsSection />, { route: '/app/cai-dat' });
    const section = screen.getByRole('region', { name: 'Lộ trình học' });
    expect(within(section).getByRole('link', { name: '+ Thêm Tiếng Hàn' })).toHaveAttribute('href', '/app/bat-dau?lang=ko');
  });

  it('pauses a path', async () => {
    const upsertPath = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'paused' });
    renderWithProviders(<LearningPathsSection />, { paths: { upsertPath } });
    await userEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'paused');
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'paused' });
    expect(await screen.findByText('Đã tạm dừng lộ trình.')).toBeInTheDocument();
  });

  it('archives only after confirmation and reloads', async () => {
    const reload = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'archived' });
    renderWithProviders(<LearningPathsSection />, { paths: { reload } });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    expect(mocks.setPathStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/Lịch sử học vẫn được giữ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'archived');
    expect(reload).toHaveBeenCalled();
  });

  it('edits the plan with a live estimate', async () => {
    const upsertPath = vi.fn();
    mocks.updatePlan.mockResolvedValue({ ...TEST_PATH, targetLevel: 'b2' });
    renderWithProviders(<LearningPathsSection />, { paths: { upsertPath } });
    await userEvent.click(screen.getByRole('button', { name: 'Sửa kế hoạch' }));
    await userEvent.selectOptions(screen.getByLabelText('Bậc mục tiêu'), 'b2');
    await userEvent.click(screen.getByRole('radio', { name: '45–60 phút mỗi ngày' }));
    expect(screen.getByText('Khoảng 44–72 tuần')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
    expect(mocks.updatePlan).toHaveBeenCalledWith({}, 'path-en', {
      goalType: 'daily_communication',
      targetLevel: 'b2',
      weeklyMinutes: [60, 60, 60, 60, 60, 60, 60],
      targetDate: null,
    });
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, targetLevel: 'b2' });
  });

  it('rejects a past target date', async () => {
    renderWithProviders(<LearningPathsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Sửa kế hoạch' }));
    const date = screen.getByLabelText('Ngày mục tiêu (không bắt buộc)');
    fireEvent.change(date, { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu kế hoạch' }));
    expect(screen.getAllByText('Ngày mục tiêu đã qua.').length).toBeGreaterThan(0);
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });
});
