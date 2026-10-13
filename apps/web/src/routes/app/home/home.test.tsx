import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_KO_PATH, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { HomePage } from '../HomePage';
import { pathLesson } from '../lesson/lesson-fixtures';
import { needsSpreadWarning } from './spread';

const mocks = vi.hoisted(() => ({ setPathStatus: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/lesson-player/usePathLessons', () => ({
  usePathLessons: () => ({
    status: 'ready',
    error: null,
    reload: () => {},
    lessons: [pathLesson({ title: { vi: 'Chào hỏi cơ bản' }, run_status: 'in_progress' })],
  }),
}));
vi.mock('@/features/reviews/useReviewDue', () => ({ useReviewDue: () => ({ status: 'ready', count: 8, reload: () => {} }) }));
vi.mock('@/features/diagnostic/useDiagnosticStatus', () => ({
  useDiagnosticStatus: () => ({
    status: 'ready',
    data: { attempt_id: null, status: 'none', completed_at: null, applied_at: null, retake_after: null, can_start: true },
    reload: () => {},
  }),
}));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
}));

describe('HomePage', () => {
  it('greets and summarises the current path without fake progress', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Minh Anh');
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
    expect(screen.getByText('A2 → B1')).toBeInTheDocument();
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();
    expect(screen.getByText('Chưa đủ dữ liệu (tự đánh giá)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bắt đầu phiên học' })).toBeDisabled();
  });

  it('shows the next lesson under the path card', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByText('Bài tiếp theo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Chào hỏi cơ bản' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tiếp tục' })).toHaveAttribute('href', expect.stringMatching(/^\/app\/hoc-tap\/bai\//));
  });

  it('shows the cards due today above the next lesson', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    const review = screen.getByRole('heading', { level: 2, name: 'Ôn tập hôm nay: 8 thẻ' });
    const lesson = screen.getByRole('heading', { level: 2, name: 'Chào hỏi cơ bản' });
    expect(review.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ôn ngay' })).toHaveAttribute('href', '/app/on-tap');
  });

  it('offers the placement test for the current path', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu kiểm tra' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
  });

  it('announces loading in the heading while the profile loads', () => {
    renderWithProviders(<HomePage />, { route: '/app', profile: { status: 'loading', profile: null } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Đang tải…');
  });

  it('falls back to "bạn" without a name', () => {
    renderWithProviders(<HomePage />, {
      route: '/app',
      profile: { profile: { id: 'u', displayName: '', timezone: 'Asia/Ho_Chi_Minh' } },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào bạn');
  });

  it('still renders when the profile time zone is unknown to Intl', () => {
    renderWithProviders(<HomePage />, {
      route: '/app',
      profile: { profile: { id: 'u', displayName: 'Minh Anh', timezone: 'Not/AZone' } },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Minh Anh');
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
  });

  it('redirects to onboarding only when the list loaded empty', () => {
    const { unmount } = renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'loading', paths: [] } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
    unmount();
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [] } });
    expect(screen.getByTestId('location')).toHaveTextContent('/app/bat-dau');
  });

  it('shows an error with retry', async () => {
    const reload = vi.fn();
    renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'error', paths: [], reload } });
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('resumes a paused path', async () => {
    const upsertPath = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'active' });
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [{ ...TEST_PATH, status: 'paused' }], upsertPath } });
    expect(screen.getByText('Đang tạm dừng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục lộ trình' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'active');
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'active' });
    expect(await screen.findByText('Đã tiếp tục lộ trình.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Tiếng Anh/ })).toHaveFocus();
  });

  it('toasts when resuming fails and keeps the button', async () => {
    mocks.setPathStatus.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [{ ...TEST_PATH, status: 'paused' }] } });
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục lộ trình' }));
    expect(await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục lộ trình' })).toBeEnabled();
  });

  it('shows the skeleton only while nothing is loaded yet', () => {
    const { container, unmount } = renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'loading', paths: [] } });
    expect(container.querySelector('.h-64')).not.toBeNull();
    unmount();
    const reloading = renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'loading', paths: [TEST_PATH] } });
    expect(reloading.container.querySelector('.h-64')).toBeNull();
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
  });

  it('notes when the reference hours are not reviewed', () => {
    const unreviewed = { ...TEST_PATH, estimate: { ...TEST_PATH.estimate, assumptions: { ...TEST_PATH.estimate.assumptions, referenceReviewed: false } } };
    const reviewed = { ...TEST_PATH, estimate: { ...TEST_PATH.estimate, assumptions: { ...TEST_PATH.estimate.assumptions, referenceReviewed: true } } };
    const note = 'Số giờ tham chiếu chưa được kiểm duyệt, ước lượng chỉ để tham khảo.';
    const { unmount } = renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [unreviewed] } });
    expect(screen.getByText(note)).toBeInTheDocument();
    unmount();
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [reviewed] } });
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  describe('with a fixed clock', () => {
    // Saturday 2026-10-17 20:00 UTC = Sunday 03:00 in Ho Chi Minh City, Saturday 13:00 in Los Angeles.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-17T20:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    const sundayOff = { ...TEST_PATH, weeklyMinutes: [30, 30, 30, 30, 30, 30, 0] };

    it('shows the scheduled rest day in the profile timezone', () => {
      renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [sundayOff] } });
      expect(screen.getByText('Ngày nghỉ theo lịch')).toBeInTheDocument();
      expect(screen.getByText(/18 tháng 10/)).toBeInTheDocument();
    });

    it('uses the profile timezone for the weekday and the date label', () => {
      renderWithProviders(<HomePage />, {
        route: '/app',
        paths: { paths: [sundayOff] },
        profile: { profile: { id: 'u', displayName: 'An', timezone: 'America/Los_Angeles' } },
      });
      expect(screen.getByText('30 phút theo lịch')).toBeInTheDocument();
      expect(screen.getByText(/17 tháng 10/)).toBeInTheDocument();
    });
  });

  it('warns when two languages share too little time', () => {
    const low = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [10, 10, 10, 10, 10, 10, 10] });
    expect(needsSpreadWarning([low(TEST_PATH), low(TEST_KO_PATH)])).toBe(true);
    expect(needsSpreadWarning([TEST_PATH, low(TEST_KO_PATH)])).toBe(false);
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [low(TEST_PATH), low(TEST_KO_PATH)] } });
    expect(screen.getByRole('note')).toHaveTextContent('Bạn đang học 2 ngôn ngữ');
  });

  it('does not warn when the daily average is exactly 15 minutes', () => {
    const exact = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [15, 15, 15, 15, 15, 15, 15] });
    const justUnder = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [15, 15, 15, 15, 15, 15, 14] });
    expect(needsSpreadWarning([exact(TEST_PATH), exact(TEST_KO_PATH)])).toBe(false);
    expect(needsSpreadWarning([justUnder(TEST_PATH), justUnder(TEST_KO_PATH)])).toBe(true);
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [exact(TEST_PATH), exact(TEST_KO_PATH)] } });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('ignores paused paths when checking the spread', () => {
    const low = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [10, 10, 10, 10, 10, 10, 10] });
    expect(needsSpreadWarning([low(TEST_PATH), { ...low(TEST_KO_PATH), status: 'paused' }])).toBe(false);
    expect(needsSpreadWarning([{ ...low(TEST_PATH), status: 'paused' }, { ...low(TEST_KO_PATH), status: 'paused' }])).toBe(false);
  });
});
