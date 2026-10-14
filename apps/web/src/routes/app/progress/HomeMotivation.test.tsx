import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { HomeMotivation } from './HomeMotivation';
import { dashboardFixture, FIXTURE_PATH_ID, motivationFixture } from './progress-test-fixtures';
import { resetCelebratedBadges } from './useBadgeToast';

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), track: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/progress/useProgressDashboard', () => ({ useProgressDashboard: mocks.dashboard }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

beforeEach(() => {
  resetCelebratedBadges();
  mocks.dashboard.mockReset();
  mocks.track.mockReset();
});

describe('HomeMotivation', () => {
  it('shows the streak strip for the path with a link to Tiến độ', () => {
    mocks.dashboard.mockReturnValue({ status: 'ready', data: dashboardFixture(), error: null, reload: vi.fn() });
    renderWithProviders(<HomeMotivation pathId={FIXTURE_PATH_ID} />, { route: '/app' });
    expect(mocks.dashboard).toHaveBeenCalledWith(FIXTURE_PATH_ID, 7);
    expect(screen.getByText('Chuỗi 6 buổi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem tiến độ' })).toHaveAttribute('href', '/app/tien-do');
  });

  it('renders nothing when motivation is switched off', () => {
    mocks.dashboard.mockReturnValue({ status: 'ready', data: dashboardFixture({ motivation: null }), error: null, reload: vi.fn() });
    renderWithProviders(<HomeMotivation pathId={FIXTURE_PATH_ID} />, { route: '/app' });
    expect(screen.queryByRole('link', { name: 'Xem tiến độ' })).not.toBeInTheDocument();
  });

  it('renders nothing while loading or on error', () => {
    mocks.dashboard.mockReturnValue({ status: 'error', data: null, error: 'x', reload: vi.fn() });
    renderWithProviders(<HomeMotivation pathId={FIXTURE_PATH_ID} />, { route: '/app' });
    expect(screen.queryByRole('link', { name: 'Xem tiến độ' })).not.toBeInTheDocument();
  });

  it('celebrates a badge earned while loading Home', async () => {
    const data = dashboardFixture({ motivation: motivationFixture({ new_badges: ['first_lesson'] }) });
    mocks.dashboard.mockReturnValue({ status: 'ready', data, error: null, reload: vi.fn() });
    renderWithProviders(<HomeMotivation pathId={FIXTURE_PATH_ID} />, { route: '/app' });
    expect(await screen.findByText('Bạn vừa nhận huy hiệu "Bài đầu tiên".')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('badge_earned', { badge: 'first_lesson' });
  });
});
