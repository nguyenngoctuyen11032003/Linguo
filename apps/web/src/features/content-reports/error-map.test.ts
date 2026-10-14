import { CONTENT_REPORT_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { contentReportErrorMessage } from './error-map';

const GENERIC = /^Đã có lỗi xảy ra/;

describe('contentReportErrorMessage', () => {
  it.each(CONTENT_REPORT_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = contentReportErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('tells a rate-limited learner to come back tomorrow', () => {
    expect(contentReportErrorMessage({ message: 'rate_limited', code: 'P0001' })).toBe(
      'Bạn đã gửi nhiều báo lỗi hôm nay, thử lại vào ngày mai nhé',
    );
  });

  it('maps local and network failures', () => {
    expect(contentReportErrorMessage(new Error('note_too_long'))).toBe('Ghi chú tối đa 500 ký tự.');
    expect(contentReportErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu báo lỗi không hợp lệ. Vui lòng thử lại.');
    expect(contentReportErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
    expect(contentReportErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
  });

  it('falls back to the code, then to a generic message', () => {
    expect(contentReportErrorMessage({ message: 'some_new_code' })).toBe('Đã có lỗi xảy ra (mã: some_new_code). Vui lòng thử lại.');
    expect(contentReportErrorMessage({ message: 'Boom', code: '22P02' })).toBe('Đã có lỗi xảy ra (mã: 22P02). Vui lòng thử lại.');
    expect(contentReportErrorMessage(undefined)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
