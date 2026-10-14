import { LESSON_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isUnansweredError, lessonErrorMessage } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

describe('lessonErrorMessage', () => {
  it.each(LESSON_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = lessonErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('maps not_authenticated raised with SQLSTATE 42501', () => {
    expect(lessonErrorMessage({ message: 'not_authenticated', code: '42501' })).toBe(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
  });

  it('maps specific codes', () => {
    expect(lessonErrorMessage({ message: 'lesson_not_found' })).toBe('Không tìm thấy bài học.');
    expect(lessonErrorMessage({ message: 'rate_limited' })).toBe('Bạn đang gửi quá nhanh. Đợi một chút rồi thử lại.');
  });

  it('maps invalid_payload', () => {
    expect(lessonErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu bài học không hợp lệ. Vui lòng thử lại.');
  });

  it('maps an outbox that cannot be written', () => {
    expect(lessonErrorMessage(new Error('outbox_unavailable'))).toMatch(/^Không lưu được câu trả lời trên thiết bị/);
  });

  it('maps network failures', () => {
    expect(lessonErrorMessage(new TypeError('Failed to fetch'))).toMatch(/^Không kết nối được máy chủ/);
    expect(lessonErrorMessage({ message: 'TypeError: fetch failed', code: '' })).toMatch(/^Không kết nối được máy chủ/);
  });

  it('falls back with the code', () => {
    expect(lessonErrorMessage({ message: 'something_else' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(lessonErrorMessage({ message: 'boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(lessonErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('isUnansweredError', () => {
  it('covers network failures, timeouts and server failures before grading', () => {
    expect(isUnansweredError({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true);
    // postgrest-js resolves an aborted (timed out) request with status 0.
    expect(isUnansweredError({ message: 'AbortError: signal timed out', code: '', status: 0 })).toBe(true);
    expect(isUnansweredError({ message: '<html>Bad gateway</html>', code: '', status: 502 })).toBe(true);
    expect(isUnansweredError({ message: 'boom', code: 'XX000', status: 500 })).toBe(true);
    expect(isUnansweredError({ message: 'timeout', code: '', status: 408 })).toBe(true);
  });

  it('does not cover answers the server gave', () => {
    expect(isUnansweredError({ message: 'rate_limited', code: 'P0001', status: 400 })).toBe(false);
    expect(isUnansweredError({ message: 'not_authenticated', code: '42501', status: 401 })).toBe(false);
    expect(isUnansweredError(new Error('invalid_payload'))).toBe(false);
    expect(isUnansweredError(null)).toBe(false);
  });
});

describe('lessonErrorMessage fallback', () => {
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
      const message = lessonErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(lessonErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
