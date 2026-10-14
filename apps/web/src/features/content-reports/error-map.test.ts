import { CONTENT_REPORT_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { contentReportErrorMessage } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

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
    expect(contentReportErrorMessage({ message: 'some_new_code' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(contentReportErrorMessage({ message: 'Boom', code: '22P02' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(contentReportErrorMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('contentReportErrorMessage fallback', () => {
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
      const message = contentReportErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(contentReportErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
