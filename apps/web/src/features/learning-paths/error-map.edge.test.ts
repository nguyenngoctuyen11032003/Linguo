import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';
import { learningPathErrorMessage } from './error-map';

const CODES = [
  'not_authenticated', 'path_exists_for_language', 'invalid_language', 'invalid_start_point', 'invalid_goal_for_language',
  'invalid_level', 'target_not_above_current', 'target_not_allowed_for_goal', 'invalid_schedule', 'target_date_in_past',
  'target_date_too_far', 'invalid_date', 'path_not_found', 'invalid_status_transition',
];

describe('learningPathErrorMessage', () => {
  it.each(CODES)('maps %s (as an RPC message) to a specific text', (code) => {
    const msg = learningPathErrorMessage({ message: code, code: 'P0001' });
    expect(msg).not.toBe(GENERIC_ERROR_MESSAGE);
    expect(msg).not.toContain(code);
    expect(msg).not.toContain('_');
  });

  it('never leaks unmapped snake_case codes or SQLSTATEs', () => {
    for (const e of [{ message: 'brand_new_code' }, { message: 'x', code: '23505' }, { message: 'new_code', code: 'P0001' }]) {
      expect(learningPathErrorMessage(e)).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it('ignores prototype keys used as messages', () => {
    for (const message of ['constructor', 'toString', '__proto__']) expect(learningPathErrorMessage({ message })).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('reports network failures, including postgrest-js wrapping', () => {
    expect(learningPathErrorMessage({ message: 'TypeError: Failed to fetch', code: '' })).toContain('Không kết nối');
    expect(learningPathErrorMessage(new TypeError('x'))).toContain('Không kết nối');
  });

  it('a coded server error is not a network error even if its text looks like one', () => {
    expect(learningPathErrorMessage({ message: 'failed to fetch', code: 'P0001' })).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('handles junk input', () => {
    for (const e of [null, undefined, 3, 'str', {}, [], { message: 5 }]) expect(learningPathErrorMessage(e)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
