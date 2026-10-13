import { LESSON_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isUnansweredError, lessonErrorMessage } from './error-map';

const GENERIC = /^Đã có lỗi xảy ra/;

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
    expect(lessonErrorMessage({ message: 'something_else' })).toBe('Đã có lỗi xảy ra (mã: something_else). Vui lòng thử lại.');
    expect(lessonErrorMessage({ message: 'boom', code: '23505' })).toBe('Đã có lỗi xảy ra (mã: 23505). Vui lòng thử lại.');
    expect(lessonErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
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
