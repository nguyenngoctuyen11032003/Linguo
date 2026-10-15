import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { makeNotification } from '@/features/notifications/notification-fixtures';
import type { NotificationsState } from '@/features/notifications/useNotifications';
import { NotificationsPage } from './NotificationsPage';

const mocks = vi.hoisted(() => ({ state: null as unknown as NotificationsState }));
vi.mock('@/features/notifications/useNotifications', () => ({ useNotifications: () => mocks.state }));

function setState(overrides: Partial<NotificationsState> = {}) {
  mocks.state = {
    status: 'ready',
    items: [],
    hasMore: false,
    loadingMore: false,
    error: null,
    loadMore: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    markRead: vi.fn().mockResolvedValue(true),
    markClicked: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => setState());

describe('NotificationsPage', () => {
  it('shows a loading state', () => {
    setState({ status: 'loading' });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    expect(screen.getByText('Đang tải thông báo…')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    setState({ status: 'error', error: 'Không kết nối được máy chủ.' });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    expect(screen.getByText('Không tải được thông báo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /thử lại/i }));
    expect(mocks.state.reload).toHaveBeenCalled();
  });

  it('shows a friendly empty state', () => {
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    expect(screen.getByText('Chưa có thông báo nào')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cài đặt nhắc học' })).toHaveAttribute('href', '/app/cai-dat');
  });

  it('lists notifications, marking unread ones', () => {
    const unread = makeNotification({ title_vi: 'Đến giờ ôn tập' });
    const read = makeNotification({ title_vi: 'Học tiếp bài dở', kind: 'resume_lesson', read_at: '2026-10-14T08:00:00Z' });
    setState({ items: [unread, read] });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    const list = screen.getByRole('list', { name: 'Danh sách thông báo' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getAllByText(/Chưa đọc/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Đến giờ ôn tập/ })).toHaveTextContent('Chưa đọc');
  });

  it('marks unread with a dot and screen-reader text, never a visible word beside the title', () => {
    setState({ items: [makeNotification({ title_vi: 'Một tiêu đề khá dài cho màn hình hẹp' })] });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    expect(screen.getByText(/Chưa đọc/)).toHaveClass('sr-only');
    expect(screen.getByTestId('unread-dot')).toHaveAttribute('aria-hidden', 'true');
  });

  it('moves focus to the first newly loaded notification after "Xem thêm"', async () => {
    const first = makeNotification({ title_vi: 'Thông báo đầu' });
    const older = makeNotification({ title_vi: 'Thông báo cũ hơn', created_at: '2026-10-01T08:00:00Z' });
    const loadMore = vi.fn(async () => {
      mocks.state = { ...mocks.state, items: [first, older], hasMore: false };
    });
    setState({ items: [first], hasMore: true, loadMore });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Thông báo cũ hơn/ })).toHaveFocus());
  });

  it('keeps focus on "Xem thêm" when nothing new arrived', async () => {
    setState({ items: [makeNotification()], hasMore: true });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    const more = screen.getByRole('button', { name: 'Xem thêm' });
    await userEvent.click(more);
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('marks a notification clicked and follows its action', async () => {
    const item = makeNotification({ title_vi: 'Đến giờ ôn tập', action_url: '/app/on-tap' });
    setState({ items: [item] });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    await userEvent.click(screen.getByRole('button', { name: /Đến giờ ôn tập/ }));
    expect(mocks.state.markClicked).toHaveBeenCalledWith(item.id);
    expect(screen.getByTestId('location')).toHaveTextContent('/app/on-tap');
  });

  it('still navigates when the mark fails', async () => {
    const item = makeNotification({ title_vi: 'Kiểm tra nhanh', action_url: '/app/kiem-tra' });
    setState({ items: [item], markClicked: vi.fn().mockResolvedValue(false) });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra nhanh/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/kiem-tra');
  });

  it('loads older notifications', async () => {
    setState({ items: [makeNotification()], hasMore: true });
    renderWithProviders(<NotificationsPage />, { route: '/app/thong-bao' });
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    expect(mocks.state.loadMore).toHaveBeenCalled();
  });
});
