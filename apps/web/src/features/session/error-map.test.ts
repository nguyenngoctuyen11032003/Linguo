import { SESSION_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { sessionErrorMessage } from './error-map';

const GENERIC = /^Đã có lỗi xảy ra/;

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
    expect(sessionErrorMessage({ message: 'something_new' })).toBe('Đã có lỗi xảy ra (mã: something_new). Vui lòng thử lại.');
    expect(sessionErrorMessage({ message: 'Boom', code: '23505' })).toBe('Đã có lỗi xảy ra (mã: 23505). Vui lòng thử lại.');
    expect(sessionErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
