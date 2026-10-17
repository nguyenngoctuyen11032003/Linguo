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
vi.mock('@/features/session-link/useTodaySession', () => ({
  useTodaySession: () => ({ status: 'ready', data: { session: null, studied_seconds_today: 0, daily_goal_minutes: 30 }, reload: () => {} }),
}));
vi.mock('@/features/diagnostic/useDiagnosticStatus', () => ({
  useDiagnosticStatus: () => ({
    status: 'ready',
    data: { attempt_id: null, status: 'none', completed_at: null, applied_at: null, retake_after: null, can_start: true },
    reload: () => {},
  }),
}));
vi.mock('@/features/progress/useProgressDashboard', async () => {
  const { dashboardFixture } = await import('../progress/progress-test-fixtures');
  return { useProgressDashboard: () => ({ status: 'ready', data: dashboardFixture(), error: null, reload: () => {} }) };
});
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
}));

describe('HomePage', () => {
  it('greets and summarises the current path without fake progress', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Anh');
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: /Lộ trình của bạn/ });
    expect(row).toHaveAttribute('href', '/app/hoc-tap');
    expect(row).toHaveTextContent('A2 → B1');
    expect(row).toHaveTextContent('Khoảng 10–16 tháng');
    expect(screen.queryByText(/Chưa đủ dữ liệu/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /Tiếng Anh/ })).not.toBeInTheDocument();
  });

  it('orders the cards: Hôm nay, reviews due, next lesson, path row, then the placement-test pitch', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    const order = [
      screen.getByRole('heading', { level: 2, name: 'Hôm nay' }),
      screen.getByRole('heading', { level: 2, name: 'Ôn tập hôm nay: 8 thẻ' }),
      screen.getByRole('heading', { level: 2, name: 'Chào hỏi cơ bản' }),
      screen.getByRole('link', { name: /Lộ trình của bạn/ }),
      screen.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' }),
      screen.getByRole('heading', { level: 2, name: 'Luyện nói' }),
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('shows a single filled primary button, with distinct labels for the other actions', () => {
    const { container } = renderWithProviders(<HomePage />, { route: '/app' });
    const filled = [...container.querySelectorAll('a, button')].filter(
      (el) => el.classList.contains('bg-primary') || el.classList.contains('bg-accent'),
    );
    expect(filled.map((el) => el.textContent)).toEqual(['Bắt đầu phiên học']);
    expect(screen.getByRole('link', { name: 'Tiếp tục bài này' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Làm bài kiểm tra' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bắt đầu' })).not.toBeInTheDocument();
  });

  it('puts the study session card of today first', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    const today = screen.getByRole('heading', { level: 2, name: 'Hôm nay' });
    expect(today.compareDocumentPosition(screen.getByText('Lộ trình của bạn')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bắt đầu phiên học' })).toHaveAttribute('href', '/app/phien-hoc');
    expect(screen.queryByRole('button', { name: 'Bắt đầu phiên học' })).not.toBeInTheDocument();
  });

  it('shows the next lesson right under the reviews due', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByText('Bài tiếp theo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Chào hỏi cơ bản' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tiếp tục bài này' })).toHaveAttribute('href', expect.stringMatching(/^\/app\/hoc-tap\/bai\//));
  });

  it('shows the cards due today above the next lesson', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    const review = screen.getByRole('heading', { level: 2, name: 'Ôn tập hôm nay: 8 thẻ' });
    const lesson = screen.getByRole('heading', { level: 2, name: 'Chào hỏi cơ bản' });
    expect(review.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ôn ngay' })).toHaveAttribute('href', '/app/on-tap');
  });

  it('ends with the motivation strip linking to Tiến độ', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    const link = screen.getByRole('link', { name: 'Xem tiến độ' });
    expect(link).toHaveAttribute('href', '/app/tien-do');
    const lesson = screen.getByRole('heading', { level: 2, name: 'Chào hỏi cơ bản' });
    expect(lesson.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers the placement test for the current path', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Làm bài kiểm tra' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Anh');
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
    expect(screen.queryByRole('heading', { level: 2, name: 'Hôm nay' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /Lộ trình của bạn/ })).toHaveTextContent('(ước lượng tham khảo)');
    unmount();
    const paused = renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [{ ...unreviewed, status: 'paused' }] } });
    expect(screen.getByText(note)).toBeInTheDocument();
    paused.unmount();
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [reviewed] } });
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lộ trình của bạn/ })).not.toHaveTextContent('tham khảo');
  });

  describe('with a fixed clock', () => {
    // Saturday 2026-10-17 20:00 UTC = Sunday 03:00 in Ho Chi Minh City, Saturday 13:00 in Los Angeles.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-17T20:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    const sundayOff = { ...TEST_PATH, weeklyMinutes: [30, 30, 30, 30, 30, 30, 0] };

    it('shows the date in the profile timezone', () => {
      renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [sundayOff] } });
      expect(screen.getByText(/18 tháng 10/)).toBeInTheDocument();
    });

    it('uses the profile timezone for the weekday and the date label', () => {
      renderWithProviders(<HomePage />, {
        route: '/app',
        paths: { paths: [sundayOff] },
        profile: { profile: { id: 'u', displayName: 'An', timezone: 'America/Los_Angeles' } },
      });
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

  it('counts every active language in the spread warning', () => {
    const low = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [10, 10, 10, 10, 10, 10, 10] });
    const ja = { ...low(TEST_KO_PATH), id: 'path-ja', language: 'ja' as const };
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [low(TEST_PATH), low(TEST_KO_PATH), ja] } });
    expect(screen.getByRole('note')).toHaveTextContent('Bạn đang học 3 ngôn ngữ');
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

describe('HomePage with saved data (offline-first)', () => {
  afterEach(() => vi.restoreAllMocks());
  const offline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

  it('shows the learning screen plus a quiet hint when the saved copy is on screen offline', () => {
    offline();
    renderWithProviders(<HomePage />, { route: '/app', profile: { fromCache: true }, paths: { fromCache: true } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Anh');
    expect(screen.getByText('Đang dùng dữ liệu đã lưu trên thiết bị')).toBeInTheDocument();
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
    expect(screen.queryByText(/Không tải được/)).not.toBeInTheDocument();
  });

  it('shows the hint online too once a revalidation failed (stale), but not during a normal load', () => {
    const { unmount } = renderWithProviders(<HomePage />, { route: '/app', paths: { fromCache: true } });
    expect(screen.queryByText('Đang dùng dữ liệu đã lưu trên thiết bị')).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<HomePage />, { route: '/app', paths: { fromCache: true, stale: true } });
    expect(screen.getByText('Đang dùng dữ liệu đã lưu trên thiết bị')).toBeInTheDocument();
  });

  it('explains what to do when offline with nothing saved, instead of two generic load errors', () => {
    offline();
    renderWithProviders(<HomePage />, {
      route: '/app',
      profile: { status: 'error', profile: null },
      paths: { status: 'error', paths: [], current: null },
    });
    expect(screen.getByRole('heading', { name: 'Chưa có dữ liệu để học ngoại tuyến' })).toBeInTheDocument();
    expect(screen.queryByText('Không tải được hồ sơ')).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được lộ trình')).not.toBeInTheDocument();
  });
});
