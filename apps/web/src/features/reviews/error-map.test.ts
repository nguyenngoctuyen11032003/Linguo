import { REVIEW_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isUnansweredError, reviewErrorMessage } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

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
    expect(reviewErrorMessage({ message: 'something_new' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(reviewErrorMessage({ message: 'Boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(reviewErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('treats timeouts and 5xx as unanswered', () => {
    expect(isUnansweredError({ message: 'AbortError: signal timed out', code: '', status: 0 })).toBe(true);
    expect(isUnansweredError({ message: 'Bad gateway', code: '', status: 502 })).toBe(true);
    expect(isUnansweredError({ message: 'card_not_found', code: 'P0001', status: 400 })).toBe(false);
  });
});

describe('reviewErrorMessage fallback', () => {
  it('never shows a raw error code to the learner', () => {
    const unknown = [
      { message: 'brand_new_code' },
      { message: 'Boom', code: '23505' },
      { code: 'weak_password_like_code' },
      new Error('some_other_failure'),
      null,
      undefined,
    ];
    for (const error of unknown) {
      const message = reviewErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(reviewErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
