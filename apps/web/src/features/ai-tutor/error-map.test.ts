import { AI_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { aiError, quota } from './ai-fixtures';
import { aiErrorMessage, aiRpcErrorMessage, formatResetTime } from './error-map';

describe('aiErrorMessage', () => {
  it.each(AI_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = aiErrorMessage(aiError(code));
    expect(message).not.toMatch(/^Đã có lỗi xảy ra/);
    expect(message).not.toContain(code);
    expect(message).not.toContain('server says');
  });

  it('accepts a bare code', () => {
    expect(aiErrorMessage('unauthorized')).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  });

  it('shows when the quota resets', () => {
    const message = aiErrorMessage(aiError('quota_exceeded', { quota: quota(20, 20) }), { timeZone: 'Asia/Ho_Chi_Minh' });
    expect(message).toBe('Bạn đã dùng hết lượt hỏi AI hôm nay. Lượt mới sẽ có lúc 00:00.');
  });

  it('falls back to "tomorrow" without a quota', () => {
    expect(aiErrorMessage(aiError('quota_exceeded'))).toBe('Bạn đã dùng hết lượt hỏi AI hôm nay. Lượt mới sẽ có vào ngày mai.');
  });

  it('mentions the retry delay of an open breaker', () => {
    expect(aiErrorMessage(aiError('ai_unavailable', { retry_after_sec: 30 }))).toMatch(/Thử lại sau khoảng 30 giây\.$/);
    expect(aiErrorMessage(aiError('ai_unavailable', { retry_after_sec: 90 }))).toMatch(/Thử lại sau khoảng 2 phút\.$/);
    expect(aiErrorMessage(aiError('ai_unavailable'))).not.toMatch(/Thử lại sau/);
  });
});

describe('formatResetTime', () => {
  it('formats in a zone and rejects bad input', () => {
    expect(formatResetTime('2026-10-13T17:00:00.000Z', 'Asia/Seoul')).toBe('02:00');
    expect(formatResetTime('2026-10-13T17:00:00.000Z', 'Not/AZone')).toMatch(/^\d{2}:\d{2}$/);
    expect(formatResetTime('nope')).toBeNull();
  });
});

describe('aiRpcErrorMessage', () => {
  it('maps known, network and unknown failures', () => {
    expect(aiRpcErrorMessage({ message: 'not_authenticated', code: '42501' })).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    expect(aiRpcErrorMessage(new Error('invalid_note'))).toBe('Ghi chú quá dài (tối đa 500 ký tự).');
    expect(aiRpcErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(aiRpcErrorMessage({ message: 'something_new' })).toBe('Đã có lỗi xảy ra (mã: something_new). Vui lòng thử lại.');
    expect(aiRpcErrorMessage({ message: 'Boom', code: '23505' })).toBe('Đã có lỗi xảy ra (mã: 23505). Vui lòng thử lại.');
    expect(aiRpcErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
