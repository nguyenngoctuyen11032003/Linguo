import { REMINDER_RULES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { RETENTION, RETENTION_SUMMARY, STORED_DATA_SUMMARY } from './retention';

describe('retention copy', () => {
  it('keeps the notification inbox for as long as the database does', () => {
    expect(RETENTION.notificationInboxDays).toBe(REMINDER_RULES.retention_days);
    expect(RETENTION.notificationInboxDays).toBe(90);
  });

  it('says the inbox expires after 90 days', () => {
    expect(RETENTION_SUMMARY.join('\n')).toMatch(/Hộp thông báo nhắc học tự xoá sau 90 ngày/);
  });

  it('says push subscriptions are deleted on sign-out, when push is turned off and with the account', () => {
    const line = RETENTION_SUMMARY.find((item) => item.includes('thông báo đẩy'));
    expect(line).toBeDefined();
    expect(line).toMatch(/đăng xuất/);
    expect(line).toMatch(/tắt thông báo/);
    expect(line).toMatch(/xoá tài khoản/);
  });

  it('lists the reminder data among the stored data', () => {
    expect(STORED_DATA_SUMMARY.join('\n')).toMatch(/Nhắc học/);
  });

  it('says anonymous technical error reports are kept 180 days and can be turned off', () => {
    expect(RETENTION.analyticsDays).toBe(180);
    expect(RETENTION_SUMMARY.join('\n')).toMatch(/báo cáo lỗi kỹ thuật tự xoá sau 180 ngày; tắt công tắc phân tích/);
    expect(STORED_DATA_SUMMARY.join('\n')).toMatch(/báo cáo lỗi kỹ thuật/);
  });

  it('commits to deleting anonymous usage events (analytics) after 180 days', () => {
    const line = RETENTION_SUMMARY.find((item) => item.startsWith('Sự kiện sử dụng ẩn danh'));
    expect(line).toBeDefined();
    expect(line).toMatch(/tự xoá sau 180 ngày/);
    expect(STORED_DATA_SUMMARY.join('\n')).toMatch(/Sự kiện sử dụng ẩn danh/);
  });

  it('keeps the AI retention lines', () => {
    expect(RETENTION_SUMMARY.join('\n')).toMatch(/lượt dùng AI tự xoá sau 90 ngày/);
  });
});
