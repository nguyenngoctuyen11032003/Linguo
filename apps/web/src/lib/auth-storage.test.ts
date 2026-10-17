import { afterEach, describe, expect, it } from 'vitest';
import { authStorageKey, readStoredSession } from './auth-storage';

afterEach(() => localStorage.clear());

describe('authStorageKey', () => {
  it('matches the supabase-js default key for the project ref', () => {
    expect(authStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
    expect(authStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
    expect(authStorageKey('not a url')).toBe('sb-unknown-auth-token');
  });
});

describe('readStoredSession', () => {
  const key = 'sb-test-auth-token';
  it('returns a well-formed stored session', () => {
    localStorage.setItem(key, JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } }));
    expect(readStoredSession(key)?.user.id).toBe('u1');
  });
  it.each([
    ['missing', null],
    ['not json', '{nope'],
    ['no user', JSON.stringify({ access_token: 'a', refresh_token: 'r' })],
    ['no refresh token', JSON.stringify({ access_token: 'a', user: { id: 'u' } })],
    ['array', '[]'],
  ])('returns null for %s', (_name, raw) => {
    if (raw !== null) localStorage.setItem(key, raw);
    expect(readStoredSession(key)).toBeNull();
  });
  it('never modifies storage', () => {
    localStorage.setItem(key, '{nope');
    readStoredSession(key);
    expect(localStorage.getItem(key)).toBe('{nope');
  });
});
