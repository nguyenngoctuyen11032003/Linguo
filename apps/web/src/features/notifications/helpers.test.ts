import { NOTIFICATION_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { notificationErrorMessage } from './error-map';
import { formatRelativeTimeVi, unreadBadgeText, unreadLabel } from './format';
import { prefs } from './notification-fixtures';
import {
  draftFromPrefs,
  draftToPatch,
  isDraftDirty,
  isInQuietHours,
  toggleDay,
  validateReminderDraft,
  type ReminderDraft,
} from './validation';

describe('notificationErrorMessage', () => {
  it('has a Vietnamese message for every contract code', () => {
    for (const code of NOTIFICATION_ERROR_CODES) {
      expect(notificationErrorMessage({ message: code })).not.toMatch(/mã:/);
    }
  });

  it('maps push, network and unknown errors', () => {
    expect(notificationErrorMessage(new Error('push_unsupported'))).toBe('Trình duyệt này chưa hỗ trợ thông báo thiết bị.');
    expect(notificationErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
    expect(notificationErrorMessage({ message: 'boom', code: '42501' })).toBe('Đã có lỗi xảy ra (mã: 42501). Vui lòng thử lại.');
    expect(notificationErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});

describe('format', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('formats relative times in Vietnamese', () => {
    expect(formatRelativeTimeVi(ago(10_000), now)).toBe('Vừa xong');
    expect(formatRelativeTimeVi(ago(5 * 60_000), now)).toBe('5 phút trước');
    expect(formatRelativeTimeVi(ago(3 * 3_600_000), now)).toBe('3 giờ trước');
    expect(formatRelativeTimeVi(ago(30 * 3_600_000), now)).toBe('Hôm qua');
    expect(formatRelativeTimeVi(ago(4 * 86_400_000), now)).toBe('4 ngày trước');
    expect(formatRelativeTimeVi(ago(20 * 86_400_000), now)).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(formatRelativeTimeVi('nope', now)).toBe('');
  });

  it('caps the badge at 9+ and names it for screen readers', () => {
    expect(unreadBadgeText(3)).toBe('3');
    expect(unreadBadgeText(10)).toBe('9+');
    expect(unreadLabel(0)).toBe('Thông báo');
    expect(unreadLabel(3)).toBe('Thông báo, 3 thông báo chưa đọc');
    expect(unreadLabel(42)).toBe('Thông báo, hơn 9 thông báo chưa đọc');
  });
});

describe('reminder validation', () => {
  const draft = (overrides: Partial<ReminderDraft> = {}): ReminderDraft => ({
    ...draftFromPrefs(prefs({ reminders_enabled: true })),
    ...overrides,
  });

  it('accepts the defaults', () => {
    expect(validateReminderDraft(draft())).toEqual({});
  });

  it('handles quiet hours that cross midnight', () => {
    expect(isInQuietHours('23:00', '22:00', '07:00')).toBe(true);
    expect(isInQuietHours('06:59', '22:00', '07:00')).toBe(true);
    expect(isInQuietHours('07:00', '22:00', '07:00')).toBe(false);
    expect(isInQuietHours('19:30', '22:00', '07:00')).toBe(false);
    expect(isInQuietHours('13:00', '12:00', '14:00')).toBe(true);
    expect(isInQuietHours('14:00', '12:00', '14:00')).toBe(false);
  });

  it('flags a reminder time inside quiet hours', () => {
    expect(validateReminderDraft(draft({ remind_at: '23:15' })).remind_at).toMatch(/giờ yên lặng/);
    // Off reminders are not judged on schedule rules.
    expect(validateReminderDraft(draft({ reminders_enabled: false, remind_at: '23:15' }))).toEqual({});
  });

  it('needs at least one day while reminders are on', () => {
    expect(validateReminderDraft(draft({ remind_days: [] })).remind_days).toBe('Chọn ít nhất một ngày để nhận nhắc.');
    expect(validateReminderDraft(draft({ reminders_enabled: false, remind_days: [] }))).toEqual({});
  });

  it('checks time formats, equal quiet bounds and the max per day', () => {
    expect(validateReminderDraft(draft({ remind_at: '' })).remind_at).toMatch(/giờ:phút/);
    expect(validateReminderDraft(draft({ quiet_start: '25:00' })).quiet).toMatch(/giờ:phút/);
    expect(validateReminderDraft(draft({ quiet_start: '08:00', quiet_end: '08:00' })).quiet).toBe(
      'Giờ bắt đầu và giờ kết thúc yên lặng cần khác nhau.',
    );
    expect(validateReminderDraft(draft({ max_per_day: 4 })).max_per_day).toBe('Chọn từ 1 đến 3 lần mỗi ngày.');
    expect(validateReminderDraft(draft({ max_per_day: 0 })).max_per_day).toBeDefined();
  });

  it('toggles days and keeps them sorted', () => {
    expect(toggleDay([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleDay([1], 9)).toEqual([1]);
  });

  it('builds the patch and detects changes', () => {
    const saved = prefs({ remind_days: [5, 1] });
    const d = draftFromPrefs(saved);
    expect(isDraftDirty(d, saved)).toBe(false);
    expect(isDraftDirty({ ...d, remind_days: [1, 5] }, saved)).toBe(false);
    expect(isDraftDirty({ ...d, max_per_day: 2 }, saved)).toBe(true);
    expect(draftToPatch({ ...d, remind_days: [7, 1] })).toEqual({
      reminders_enabled: false,
      remind_at: '19:30',
      remind_days: [1, 7],
      quiet_start: '22:00',
      quiet_end: '07:00',
      max_per_day: 1,
      weekly_summary: true,
    });
  });
});
