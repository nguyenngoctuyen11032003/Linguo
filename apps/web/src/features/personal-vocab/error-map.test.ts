import { PERSONAL_VOCAB_ERROR_CODES } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { isUnansweredError, personalVocabErrorMessage, rowReasonMessage } from './error-map';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const GENERIC = /^Có lỗi xảy ra/;

describe('personalVocabErrorMessage', () => {
  it.each(PERSONAL_VOCAB_ERROR_CODES.map((code) => [code]))('has a Vietnamese message for %s', (code) => {
    const message = personalVocabErrorMessage({ message: code, code: 'P0001' });
    expect(message).not.toMatch(GENERIC);
    expect(message).not.toContain(code);
  });

  it('maps local failures and network failures', () => {
    expect(personalVocabErrorMessage(new Error('invalid_payload'))).toBe('Dữ liệu từ vựng không hợp lệ. Vui lòng thử lại.');
    expect(personalVocabErrorMessage(new Error('supabase_unavailable'))).toBe('Chưa cấu hình kết nối máy chủ.');
    expect(personalVocabErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  });

  it('shows the code of unknown errors and a generic text for non-errors', () => {
    expect(personalVocabErrorMessage({ message: 'something_new' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(personalVocabErrorMessage({ message: 'Boom', code: '23505' })).toBe(GENERIC_ERROR_MESSAGE);
    expect(personalVocabErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('treats timeouts and 5xx as unanswered', () => {
    expect(isUnansweredError({ message: 'x', status: 503 })).toBe(true);
    expect(isUnansweredError({ message: 'word_not_due', code: 'P0001', status: 400 })).toBe(false);
  });
});

describe('rowReasonMessage', () => {
  it('translates parser and server reasons', () => {
    expect(rowReasonMessage('term_required')).toBe('Thiếu từ');
    expect(rowReasonMessage('meaning_required')).toBe('Thiếu nghĩa');
    expect(rowReasonMessage('something_else')).toBe('Dòng không hợp lệ');
  });
});

describe('personalVocabErrorMessage fallback', () => {
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
      const message = personalVocabErrorMessage(error as never);
      expect(message).not.toMatch(/mã/i);
      expect(message).not.toMatch(/23505|brand_new_code|weak_password_like_code|some_other_failure/);
    }
    expect(personalVocabErrorMessage({ message: 'brand_new_code' } as never)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
