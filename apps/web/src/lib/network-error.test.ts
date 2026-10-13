import { describe, expect, it } from 'vitest';
import { isNetworkError } from './network-error';

describe('isNetworkError', () => {
  it('detects fetch failures', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
    // postgrest-js wraps a failed fetch into a plain error object with an empty code.
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' })).toBe(true);
    expect(isNetworkError({ message: 'FetchError: network down', code: '' })).toBe(true);
    expect(isNetworkError({ message: 'AbortError: The operation was aborted', code: '' })).toBe(true);
    expect(isNetworkError({ status: 0 })).toBe(true);
  });

  it('does not flag server errors', () => {
    expect(isNetworkError({ message: 'rate_limited', code: 'P0001' })).toBe(false);
    expect(isNetworkError({ message: 'not_authenticated', code: '42501', status: 401 })).toBe(false);
    expect(isNetworkError(new Error('invalid_payload'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError('offline')).toBe(false);
  });
});
