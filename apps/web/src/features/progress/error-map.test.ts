import { PROGRESS_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { progressErrorMessage } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

describe('progressErrorMessage', () => {
  it.each(PROGRESS_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = progressErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('maps local failures', () => {
    expect(progressErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu tiến độ không hợp lệ. Vui lòng thử lại.');
    expect(progressErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
    expect(progressErrorMessage(new Error('NO_ROWS_UPDATED'))).toBe('Không lưu được cài đặt. Vui lòng thử lại.');
  });

  it('maps network failures', () => {
    expect(progressErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
  });

  it('falls back to the code, then to a generic message', () => {
    expect(progressErrorMessage({ message: 'some_new_code' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(progressErrorMessage({ message: 'Boom', code: '22P02' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(progressErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('progressErrorMessage fallback', () => {
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
      const message = progressErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(progressErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
