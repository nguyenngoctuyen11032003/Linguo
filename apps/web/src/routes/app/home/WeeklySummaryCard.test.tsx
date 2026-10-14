import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { WEEKLY_PAYLOAD, weeklyNotification } from '@/features/notifications/notification-fixtures';
import type { WeeklySummaryState } from '@/features/notifications/useWeeklySummary';
import { WeeklySummaryCard } from './WeeklySummaryCard';

const mocks = vi.hoisted(() => ({ state: null as unknown as WeeklySummaryState }));
vi.mock('@/features/notifications/useWeeklySummary', () => ({ useWeeklySummary: () => mocks.state }));

function setState(overrides: Partial<WeeklySummaryState> = {}) {
  mocks.state = {
    status: 'ready',
    value: { notification: weeklyNotification(), summary: { ...WEEKLY_PAYLOAD } },
    dismiss: vi.fn().mockResolvedValue(undefined),
    markClicked: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => setState());

describe('WeeklySummaryCard', () => {
  it('renders nothing without an unread weekly summary', () => {
    setState({ value: null });
    const { container } = renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.queryByRole('heading', { name: 'Báo cáo tuần' })).not.toBeInTheDocument();
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders nothing while loading', () => {
    setState({ status: 'loading' });
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.queryByRole('heading', { name: 'Báo cáo tuần' })).not.toBeInTheDocument();
  });

  it('shows minutes, days, the weak skill and the suggestion', () => {
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.getByRole('heading', { name: 'Báo cáo tuần' })).toBeInTheDocument();
    expect(screen.getByText('84 / 105 phút theo kế hoạch')).toBeInTheDocument();
    expect(screen.getByText('4 / 7 ngày')).toBeInTheDocument();
    expect(screen.getByText(/đúng 62%/)).toBeInTheDocument();
    expect(screen.getByText('Thêm 1 buổi luyện Nghe')).toBeInTheDocument();
  });

  it('does not repeat the heading as a subtitle, but keeps a title that adds information', () => {
    const { unmount } = renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.getAllByText(/Báo cáo tuần/)).toHaveLength(1);
    unmount();
    setState({
      value: { notification: weeklyNotification({ title_vi: 'Tuần này bạn học đều tay' }), summary: { ...WEEKLY_PAYLOAD } },
    });
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.getByText('Tuần này bạn học đều tay')).toBeInTheDocument();
  });

  it('keeps one filled primary on Home: both actions are outlines', () => {
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.getByRole('link', { name: 'Xem tiến độ' })).not.toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: 'Đã xem' })).not.toHaveClass('bg-primary');
  });

  it('hides the weak skill when there is none', () => {
    setState({
      value: { notification: weeklyNotification(), summary: { ...WEEKLY_PAYLOAD, weak_skill: null, weak_accuracy: null } },
    });
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    expect(screen.queryByText('Nên luyện thêm')).not.toBeInTheDocument();
  });

  it('"Đã xem" dismisses the card', async () => {
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    await userEvent.click(screen.getByRole('button', { name: 'Đã xem' }));
    expect(mocks.state.dismiss).toHaveBeenCalled();
  });

  it('opens the progress page and marks it clicked', async () => {
    renderWithProviders(<WeeklySummaryCard />, { route: '/app' });
    await userEvent.click(screen.getByRole('link', { name: 'Xem tiến độ' }));
    expect(mocks.state.markClicked).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/tien-do');
  });
});
