import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { NotificationBell } from './NotificationBell';

const mocks = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/features/notifications/useNotifications', () => ({
  useUnreadNotificationCount: () => ({ status: 'ready', count: mocks.count, reload: () => {} }),
}));

beforeEach(() => {
  mocks.count = 0;
});

describe('NotificationBell', () => {
  it('has no badge when everything is read', () => {
    renderWithProviders(<NotificationBell />, { route: '/app' });
    expect(screen.getByRole('link', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('shows the unread count with an accessible name', () => {
    mocks.count = 3;
    renderWithProviders(<NotificationBell />, { route: '/app' });
    expect(screen.getByRole('link', { name: 'Thông báo, 3 thông báo chưa đọc' })).toBeInTheDocument();
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');
  });

  it('caps the badge at 9+', () => {
    mocks.count = 14;
    renderWithProviders(<NotificationBell />, { route: '/app' });
    expect(screen.getByRole('link', { name: 'Thông báo, hơn 9 thông báo chưa đọc' })).toBeInTheDocument();
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('9+');
  });

  it('opens the inbox', async () => {
    renderWithProviders(<NotificationBell />, { route: '/app' });
    await userEvent.click(screen.getByRole('link', { name: 'Thông báo' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/thong-bao');
  });
});
