import { PROGRESS_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { progressErrorMessage } from './error-map';

const GENERIC = /^Đã có lỗi xảy ra/;

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
    expect(progressErrorMessage({ message: 'some_new_code' })).toBe('Đã có lỗi xảy ra (mã: some_new_code). Vui lòng thử lại.');
    expect(progressErrorMessage({ message: 'Boom', code: '22P02' })).toBe('Đã có lỗi xảy ra (mã: 22P02). Vui lòng thử lại.');
    expect(progressErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
