import { DIAGNOSTIC_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { diagnosticErrorCode, diagnosticErrorMessage, formatRetakeDate, isUnansweredError } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;
const TZ = 'Asia/Ho_Chi_Minh';

describe('diagnosticErrorMessage', () => {
  it.each(DIAGNOSTIC_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = diagnosticErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('explains an unknown test mode', () => {
    expect(DIAGNOSTIC_ERROR_CODES).toContain('invalid_mode');
    expect(diagnosticErrorMessage({ message: 'invalid_mode', code: 'P0001' })).toBe('Loại bài kiểm tra không hợp lệ.');
  });

  it('names the retake date of a cooldown from the error details', () => {
    const error = { message: 'diagnostic_cooldown', code: 'P0001', details: '2026-10-27T10:00:00+00:00', hint: null };
    expect(diagnosticErrorMessage(error, { timeZone: TZ })).toBe(
      'Bạn vừa làm bài kiểm tra gần đây. Bạn có thể làm lại từ ngày 27/10/2026.',
    );
  });

  it('names the retake date of a cooldown from diagnostic_status when the error has none', () => {
    const error = { message: 'diagnostic_cooldown', code: 'P0001' };
    // 20:00 UTC is already the next day in Vietnam.
    expect(diagnosticErrorMessage(error, { retakeAfter: '2026-10-27T20:00:00Z', timeZone: TZ })).toBe(
      'Bạn vừa làm bài kiểm tra gần đây. Bạn có thể làm lại từ ngày 28/10/2026.',
    );
    expect(diagnosticErrorMessage(error)).toBe('Bạn vừa làm bài kiểm tra gần đây. Hãy học thêm một thời gian rồi làm lại nhé.');
  });

  it('formats retake dates', () => {
    expect(formatRetakeDate('2026-10-27')).toBe('27/10/2026');
    expect(formatRetakeDate('2026-10-27 01:00:00+07', TZ)).toBe('27/10/2026');
    expect(formatRetakeDate('nope')).toBeNull();
  });

  it('maps local failures', () => {
    expect(diagnosticErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu bài kiểm tra không hợp lệ. Vui lòng thử lại.');
    expect(diagnosticErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
  });

  it('maps network failures', () => {
    expect(diagnosticErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
    expect(diagnosticErrorMessage({ message: 'AbortError: signal timed out', code: '', status: 0 })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
  });

  it('shows the code of unknown errors', () => {
    expect(diagnosticErrorMessage({ message: 'something_new' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(diagnosticErrorMessage({ message: 'Boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(diagnosticErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('extracts codes and detects unanswered requests', () => {
    expect(diagnosticErrorCode({ message: 'item_mismatch', code: 'P0001' })).toBe('item_mismatch');
    expect(diagnosticErrorCode(null)).toBeNull();
    expect(isUnansweredError({ message: 'Bad gateway', code: '', status: 502 })).toBe(true);
    expect(isUnansweredError({ message: 'item_mismatch', code: 'P0001', status: 400 })).toBe(false);
  });
});

describe('diagnosticErrorMessage fallback', () => {
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
      const message = diagnosticErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(diagnosticErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
