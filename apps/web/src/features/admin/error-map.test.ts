import { ADMIN_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { adminErrorCode, adminErrorMessage } from './error-map';

describe('adminErrorMessage', () => {
  it.each(ADMIN_ERROR_CODES)('has a Vietnamese message for %s', (code) => {
    const message = adminErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(/mã lỗi:/);
    expect(message).not.toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });

  it('maps the forbidden and wrong-answer cases', () => {
    expect(adminErrorMessage({ message: 'staff_forbidden', code: '42501' })).toBe('Bạn không có quyền thực hiện thao tác này.');
    expect(adminErrorMessage(new Error('open_wrong_answer_reports'))).toMatch(/Đáp án sai/);
    expect(adminErrorMessage(new Error('note_too_long'))).toMatch(/500/);
    expect(adminErrorMessage({ message: 'user_not_found', code: 'P0001' })).toBe('Không tìm thấy người dùng này.');
    expect(adminErrorMessage({ message: 'last_admin_required', code: 'P0001' })).toMatch(/ít nhất một quản trị viên/);
  });

  it('extracts the error code', () => {
    expect(adminErrorCode({ message: 'open_wrong_answer_reports', code: 'P0001' })).toBe('open_wrong_answer_reports');
    expect(adminErrorCode({ message: 'boom', code: 'XX000' })).toBe('XX000');
    expect(adminErrorCode(null)).toBeNull();
  });

  it('recognises network failures', () => {
    expect(adminErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toMatch(/kết nối/);
    expect(adminErrorMessage(new TypeError('Failed to fetch'))).toMatch(/kết nối/);
  });

  it('keeps the code of unknown server errors (staff-only screen) in a separate suffix and a generic fallback otherwise', () => {
    expect(adminErrorMessage({ message: 'boom', code: 'XX000' })).toBe('Đã có lỗi xảy ra. Vui lòng thử lại. (mã lỗi: XX000)');
    expect(adminErrorMessage(new Error('something_else'))).toBe('Đã có lỗi xảy ra. Vui lòng thử lại. (mã lỗi: something_else)');
    expect(adminErrorMessage(null)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
