import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { prefs } from '@/features/notifications/notification-fixtures';
import type { NotificationPrefsState } from '@/features/notifications/useNotificationPrefs';
import type { PushNotificationsState } from '@/features/notifications/usePushNotifications';
import { RemindersSection } from './RemindersSection';

const mocks = vi.hoisted(() => ({
  prefs: null as unknown as NotificationPrefsState,
  push: null as unknown as PushNotificationsState,
}));
vi.mock('@/features/notifications/useNotificationPrefs', () => ({ useNotificationPrefs: () => mocks.prefs }));
vi.mock('@/features/notifications/usePushNotifications', () => ({ usePushNotifications: () => mocks.push }));

function setPrefs(overrides: Partial<NotificationPrefsState> = {}) {
  mocks.prefs = {
    status: 'ready',
    prefs: prefs({ reminders_enabled: true }),
    update: vi.fn().mockResolvedValue(true),
    resetBackoff: vi.fn().mockResolvedValue(true),
    reload: vi.fn(),
    saving: false,
    error: null,
    ...overrides,
  };
}

function setPush(overrides: Partial<PushNotificationsState> = {}) {
  mocks.push = {
    state: 'default',
    support: 'supported',
    busy: false,
    error: null,
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  setPrefs();
  setPush();
});

const render = () => renderWithProviders(<RemindersSection />, { route: '/app/cai-dat' });
const saveButton = () => screen.getByRole('button', { name: 'Lưu cài đặt nhắc học' });

describe('RemindersSection', () => {
  it('shows a load error with a retry', async () => {
    setPrefs({ status: 'error', prefs: null, error: 'Không kết nối được máy chủ.' });
    render();
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được cài đặt nhắc học');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(mocks.prefs.reload).toHaveBeenCalled();
  });

  it('pre-fills the saved prefs and keeps save off until something changes', () => {
    render();
    expect(screen.getByRole('switch', { name: 'Nhắc tôi học' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Giờ nhắc')).toHaveValue('19:30');
    expect(screen.getByRole('button', { name: 'Thứ Hai' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: '1 lần' })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it('toggles days, changes the max per day and saves the patch', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Chủ nhật' }));
    expect(screen.getByRole('button', { name: 'Chủ nhật' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('radio', { name: '3 lần' }));
    fireEvent.change(screen.getByLabelText('Giờ nhắc'), { target: { value: '20:15' } });
    await userEvent.click(saveButton());
    expect(mocks.prefs.update).toHaveBeenCalledWith({
      reminders_enabled: true,
      remind_at: '20:15',
      remind_days: [1, 2, 3, 4, 5, 6],
      quiet_start: '22:00',
      quiet_end: '07:00',
      max_per_day: 3,
      weekly_summary: true,
    });
    expect(await screen.findByText('Đã lưu cài đặt nhắc học.')).toBeInTheDocument();
  });

  it('needs at least one day', async () => {
    setPrefs({ prefs: prefs({ reminders_enabled: true, remind_days: [1] }) });
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Thứ Hai' }));
    await userEvent.click(saveButton());
    expect(screen.getByText('Chọn ít nhất một ngày để nhận nhắc.')).toBeInTheDocument();
    expect(mocks.prefs.update).not.toHaveBeenCalled();
  });

  it('refuses a reminder time inside quiet hours that cross midnight', async () => {
    render();
    fireEvent.change(screen.getByLabelText('Giờ nhắc'), { target: { value: '23:30' } });
    await userEvent.click(saveButton());
    expect(screen.getByText(/Giờ nhắc đang nằm trong giờ yên lặng/)).toBeInTheDocument();
    expect(mocks.prefs.update).not.toHaveBeenCalled();
  });

  it('refuses equal quiet hour bounds', async () => {
    render();
    fireEvent.change(screen.getByLabelText('Đến'), { target: { value: '22:00' } });
    await userEvent.click(saveButton());
    expect(screen.getByText('Giờ bắt đầu và giờ kết thúc yên lặng cần khác nhau.')).toBeInTheDocument();
    expect(mocks.prefs.update).not.toHaveBeenCalled();
  });

  it('turns the weekly summary off', async () => {
    render();
    await userEvent.click(screen.getByRole('switch', { name: 'Báo cáo tuần' }));
    await userEvent.click(saveButton());
    expect(mocks.prefs.update).toHaveBeenCalledWith(expect.objectContaining({ weekly_summary: false }));
  });

  it('offers to undo the backoff', async () => {
    setPrefs({ prefs: prefs({ reminders_enabled: true, backoff_level: 2 }) });
    render();
    expect(screen.getByText(/Linguo đang nhắc thưa hơn/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nhắc như cũ' }));
    expect(mocks.prefs.resetBackoff).toHaveBeenCalled();
  });

  it('explains why the save button is disabled', () => {
    render();
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAccessibleDescription('Chưa có thay đổi nào để lưu.');
  });

  it('has no backoff banner at level 0', () => {
    render();
    expect(screen.queryByText(/nhắc thưa hơn/)).not.toBeInTheDocument();
  });

  it('always explains that in-app reminders still show', () => {
    render();
    expect(screen.getByText('Bạn vẫn thấy nhắc nhở trong app kể cả khi không bật thông báo thiết bị.')).toBeInTheDocument();
  });

  it('asks for device permission only when the learner clicks', async () => {
    render();
    expect(mocks.push.enable).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Bật thông báo trên thiết bị này' }));
    expect(mocks.push.enable).toHaveBeenCalledTimes(1);
  });

  it('explains how to unblock denied notifications', () => {
    setPush({ state: 'denied' });
    render();
    expect(screen.getByText('Thông báo đang bị chặn trên trình duyệt này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bật thông báo trên thiết bị này' })).not.toBeInTheDocument();
  });

  it('says when the browser does not support device notifications', () => {
    setPush({ state: 'unsupported', support: 'browser' });
    render();
    expect(screen.getByText(/Trình duyệt này chưa hỗ trợ thông báo thiết bị/)).toBeInTheDocument();
  });

  it('turns device notifications off when subscribed', async () => {
    setPrefs({ prefs: prefs({ reminders_enabled: true, push_enabled: true }) });
    setPush({ state: 'granted-subscribed' });
    render();
    expect(screen.getByText('Đã bật trên thiết bị này.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tắt trên thiết bị này' }));
    expect(mocks.push.disable).toHaveBeenCalled();
  });

  it('shows a push error', () => {
    setPush({ error: 'Không đăng ký được thông báo trên thiết bị này. Vui lòng thử lại.' });
    render();
    expect(screen.getByRole('alert')).toHaveTextContent('Không đăng ký được thông báo');
  });
});
