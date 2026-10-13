import { LESSON_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { lessonErrorMessage } from './error-map';

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
