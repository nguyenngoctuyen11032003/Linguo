import { SESSION_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { sessionErrorMessage } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

describe('sessionErrorMessage', () => {
  it.each(SESSION_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = sessionErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('maps local failures', () => {
    expect(sessionErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu phiên học không hợp lệ. Vui lòng thử lại.');
    expect(sessionErrorMessage(new Error('planner_failed'))).toMatch(/^Chưa lập được kế hoạch/);
    expect(sessionErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
  });

  it('maps network failures', () => {
    expect(sessionErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  });

  it('shows the code of unknown errors', () => {
    expect(sessionErrorMessage({ message: 'something_new' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(sessionErrorMessage({ message: 'Boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(sessionErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('sessionErrorMessage fallback', () => {
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
      const message = sessionErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(sessionErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
