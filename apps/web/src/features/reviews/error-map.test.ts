import { REVIEW_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isUnansweredError, reviewErrorMessage } from './error-map';

const GENERIC = /^Đã có lỗi xảy ra/;

describe('reviewErrorMessage', () => {
  it.each(REVIEW_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = reviewErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('maps not_authenticated raised with SQLSTATE 42501', () => {
    expect(reviewErrorMessage({ message: 'not_authenticated', code: '42501' })).toBe(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
  });

  it('maps local failures', () => {
    expect(reviewErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu ôn tập không hợp lệ. Vui lòng thử lại.');
    expect(reviewErrorMessage(new Error('outbox_unavailable'))).toMatch(/^Không lưu được lượt chấm/);
    expect(reviewErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
  });

  it('maps network failures', () => {
    expect(reviewErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
  });

  it('shows the code of unknown errors', () => {
    expect(reviewErrorMessage({ message: 'something_new' })).toBe('Đã có lỗi xảy ra (mã: something_new). Vui lòng thử lại.');
    expect(reviewErrorMessage({ message: 'Boom', code: '23505' })).toBe('Đã có lỗi xảy ra (mã: 23505). Vui lòng thử lại.');
    expect(reviewErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });

  it('treats timeouts and 5xx as unanswered', () => {
    expect(isUnansweredError({ message: 'AbortError: signal timed out', code: '', status: 0 })).toBe(true);
    expect(isUnansweredError({ message: 'Bad gateway', code: '', status: 502 })).toBe(true);
    expect(isUnansweredError({ message: 'card_not_found', code: 'P0001', status: 400 })).toBe(false);
  });
});
