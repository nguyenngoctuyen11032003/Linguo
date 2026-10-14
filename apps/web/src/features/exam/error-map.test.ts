import { EXAM_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { examErrorCode, examErrorMessage, isUnansweredError } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

describe('examErrorMessage', () => {
  it.each(EXAM_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = examErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('maps local failures', () => {
    expect(examErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu bài thi không hợp lệ. Vui lòng thử lại.');
    expect(examErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
    expect(examErrorMessage(new Error('answers_unsaved'))).toBe(
      'Mất kết nối nên chưa lưu được hết câu trả lời. Kiểm tra mạng rồi nộp lại.',
    );
  });

  it('maps network failures', () => {
    const network = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    expect(examErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(network);
    expect(examErrorMessage({ message: 'AbortError: signal timed out', code: '', status: 0 })).toBe(network);
  });

  it('shows the code of unknown errors', () => {
    expect(examErrorMessage({ message: 'something_new' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(examErrorMessage({ message: 'Boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(examErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('extracts codes and detects unanswered requests', () => {
    expect(examErrorCode({ message: 'attempt_closed', code: 'P0001' })).toBe('attempt_closed');
    expect(examErrorCode('nope')).toBeNull();
    expect(isUnansweredError({ message: 'Bad gateway', code: '', status: 502 })).toBe(true);
    expect(isUnansweredError({ message: 'attempt_closed', code: 'P0001', status: 400 })).toBe(false);
  });
});

describe('examErrorMessage fallback', () => {
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
      const message = examErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(examErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
