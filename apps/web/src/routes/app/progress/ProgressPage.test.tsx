import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressDashboard, ProgressRange } from '@linguo/shared';
import { renderWithProviders } from '../../../../tests/unit/render';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { isEmptyDashboard, parseRange } from './page-logic';
import { ProgressPage } from './ProgressPage';
import { dashboardFixture, FIXTURE_DAYS, motivationFixture } from './progress-test-fixtures';
import { resetCelebratedBadges } from './useBadgeToast';

interface DashboardMock {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: ProgressDashboard | null;
  error: string | null;
  reload: () => void;
}

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  summary: vi.fn(),
  track: vi.fn(),
  online: { value: true },
}));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/progress/useProgressDashboard', () => ({ useProgressDashboard: mocks.dashboard }));
vi.mock('@/features/reviews/useReviewSummary', () => ({ useReviewSummary: mocks.summary }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/useOnline', () => ({ useOnline: () => mocks.online.value }));
// The exam history card has its own tests; here it only has to be placed with the current path.
vi.mock('@/routes/app/exam/ExamHistoryCard', () => ({
  ExamHistoryCard: ({ pathId }: { pathId?: string | null }) => <div data-testid="exam-history" data-path={pathId ?? ''} />,
}));

let state: DashboardMock;
const reload = vi.fn();

function ready(data: ProgressDashboard = dashboardFixture()): DashboardMock {
  return { status: 'ready', data, error: null, reload };
}

beforeEach(() => {
  resetCelebratedBadges();
  mocks.online.value = true;
  state = ready();
  mocks.dashboard.mockReset();
  mocks.dashboard.mockImplementation((pathId: string | null, range: ProgressRange) => {
    void range;
    return pathId ? state : { status: 'idle', data: null, error: null, reload };
  });
  mocks.summary.mockReset();
  mocks.summary.mockReturnValue({
    status: 'ready',
    summary: {
      reviewed_today: 0,
      remaining_today: 0,
      forecast: [],
      retention_30d: 0.86,
      retention_sample: 40,
      mastered_total: 27,
      mastered_this_week: 3,
      recovery_mode: false,
    },
    error: null,
    reload: vi.fn(),
  });
  mocks.track.mockReset();
  reload.mockReset();
});

describe('parseRange', () => {
  it('accepts 7, 14 and 28 and falls back to 7', () => {
    expect(parseRange('14')).toBe(14);
    expect(parseRange('28')).toBe(28);
    expect(parseRange('7')).toBe(7);
    expect(parseRange('30')).toBe(7);
    expect(parseRange('abc')).toBe(7);
    expect(parseRange(null)).toBe(7);
  });
});

describe('isEmptyDashboard', () => {
  it('is false with any activity and true with none', () => {
    expect(isEmptyDashboard(dashboardFixture())).toBe(false);
    const quiet = FIXTURE_DAYS.map((d) => ({ ...d, minutes: 0, answers: 0, reviews: 0, lessons: 0, xp: 0, active: false }));
    const totals = { ...dashboardFixture().totals, lessons_completed: 0, reviews_done: 0, range_minutes: 0, today_minutes: 0, week_minutes: 0 };
    expect(isEmptyDashboard(dashboardFixture({ days: quiet, totals, mistakes: [] }))).toBe(true);
  });
});

describe('ProgressPage', () => {
  it('offers the AI review plan next to the mistakes only when there are mistakes', () => {
    const { unmount } = renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByRole('button', { name: 'Lập kế hoạch ôn bằng AI' })).toBeInTheDocument();
    unmount();
    state = ready(dashboardFixture({ mistakes: [] }));
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.queryByRole('button', { name: 'Lập kế hoạch ôn bằng AI' })).not.toBeInTheDocument();
  });

  it('shows every layer of the dashboard', () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByRole('heading', { level: 1, name: 'Tiến độ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Hoạt động' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Học tập' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Năng lực ước lượng' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Lỗi thường gặp' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Động lực' })).toBeInTheDocument();
    expect(screen.getByText('Cách tính các số liệu')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Theo kỹ năng' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Theo dạng bài' })).toBeInTheDocument();
    expect(mocks.dashboard).toHaveBeenCalledWith(TEST_PATH.id, 7);
    expect(mocks.summary).toHaveBeenCalledWith(TEST_PATH.id);
  });

  it('places the exam history card for the current path', () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByTestId('exam-history')).toHaveAttribute('data-path', TEST_PATH.id);
  });

  it('uses the review summary for retention and mastered items', () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('Trong 30 ngày, trên 40 lượt ôn')).toBeInTheDocument();
  });

  it('reads the range from ?khoang= and writes the new one back', async () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do?khoang=14' });
    expect(mocks.dashboard).toHaveBeenLastCalledWith(TEST_PATH.id, 14);
    const group = screen.getByRole('group', { name: 'Khoảng thời gian' });
    expect(within(group).getByRole('button', { name: '14 ngày' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: '28 ngày' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/tien-do?khoang=28');
    expect(mocks.dashboard).toHaveBeenLastCalledWith(TEST_PATH.id, 28);
  });

  it('ignores an invalid range', () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do?khoang=90' });
    expect(mocks.dashboard).toHaveBeenLastCalledWith(TEST_PATH.id, 7);
  });

  it('keeps the previous numbers on screen while another range loads', () => {
    state = { ...ready(), status: 'loading' };
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByRole('heading', { level: 2, name: 'Hoạt động' }).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows a skeleton while the first load runs', () => {
    state = { status: 'loading', data: null, error: null, reload };
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByText('Đang tải tiến độ…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Hoạt động' })).not.toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    state = { status: 'error', data: null, error: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', reload };
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Không tải được tiến độ' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
  });

  it('explains the offline state', () => {
    mocks.online.value = false;
    state = { status: 'error', data: null, error: 'x', reload };
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByRole('heading', { name: 'Bạn đang ngoại tuyến' })).toBeInTheDocument();
  });

  it('invites to create a path when there is none', () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do', paths: { paths: [], currentId: null } });
    expect(screen.getByRole('heading', { name: 'Bạn chưa có lộ trình' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo lộ trình' })).toHaveAttribute('href', '/app/bat-dau');
    expect(screen.queryByRole('group', { name: 'Khoảng thời gian' })).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing was studied in the window', () => {
    const quiet = FIXTURE_DAYS.map((d) => ({ ...d, minutes: 0, answers: 0, reviews: 0, lessons: 0, xp: 0, active: false }));
    const totals = { ...dashboardFixture().totals, lessons_completed: 0, reviews_done: 0, range_minutes: 0, today_minutes: 0, week_minutes: 0 };
    state = ready(dashboardFixture({ days: quiet, totals, mistakes: [] }));
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.getByRole('heading', { name: 'Chưa có hoạt động trong 7 ngày qua' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đi tới bài học' })).toHaveAttribute('href', '/app/hoc-tap');
    expect(screen.queryByRole('heading', { level: 2, name: 'Hoạt động' })).not.toBeInTheDocument();
    // Estimates and the range picker stay available.
    expect(screen.getByRole('heading', { level: 2, name: 'Năng lực ước lượng' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Khoảng thời gian' })).toBeInTheDocument();
  });

  it('hides the motivation layer when it is switched off', () => {
    state = ready(dashboardFixture({ motivation: null }));
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(screen.queryByRole('heading', { level: 2, name: 'Động lực' })).not.toBeInTheDocument();
  });

  it('records progress_viewed once', async () => {
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do?khoang=14' });
    await userEvent.click(screen.getByRole('button', { name: '28 ngày' }));
    const viewed = mocks.track.mock.calls.filter(([name]) => name === 'progress_viewed');
    expect(viewed).toEqual([['progress_viewed', { range_days: 14 }]]);
  });

  it('celebrates a newly earned badge once', async () => {
    state = ready(dashboardFixture({ motivation: motivationFixture({ new_badges: ['lessons_10'] }) }));
    const { unmount } = renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(await screen.findByText('Bạn vừa nhận huy hiệu "10 bài học".')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('badge_earned', { badge: 'lessons_10' });
    unmount();

    mocks.track.mockClear();
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    await act(async () => {});
    expect(screen.queryByText('Bạn vừa nhận huy hiệu "10 bài học".')).not.toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalledWith('badge_earned', expect.anything());
  });

  it('groups several new badges into one toast', async () => {
    state = ready(dashboardFixture({ motivation: motivationFixture({ new_badges: ['lessons_10', 'reviews_100'] }) }));
    renderWithProviders(<ProgressPage />, { route: '/app/tien-do' });
    expect(await screen.findByText('Bạn vừa nhận 2 huy hiệu mới: "10 bài học", "100 lượt ôn".')).toBeInTheDocument();
  });
});
