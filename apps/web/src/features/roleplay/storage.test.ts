import { findRoleplayScenario } from '@linguo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY_PREFIX, LEGACY_KEY_PREFIX, ROLEPLAY_TTL_MS, clearSession, loadSession, saveSession } from './storage';
import { newSession, type RoleplayMessage, type RoleplaySession } from './session';

const CAFE = findRoleplayScenario('en', 'cafe_order')!;
const msg = (over: Partial<RoleplayMessage> = {}): RoleplayMessage => ({
  id: 1, role: 'partner', text: 'Hi!', corrections: [], hint_vi: null, responseId: null, status: 'ok', ...over,
});
const withMessages = (messages: RoleplayMessage[]): RoleplaySession => ({ ...newSession(CAFE, 'a2', 5), messages, nextId: messages.length + 1 });
const envelope = (session: unknown, savedAt = Date.now()) => JSON.stringify({ savedAt, session });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('roleplay storage', () => {
  it('round-trips a session through localStorage (survives closing the tab)', () => {
    const s = withMessages([msg(), msg({ id: 2, role: 'learner', text: 'Một ly cà phê, làm ơn' })]);
    saveSession('u1', s);
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(loadSession('u1', 'en')).toEqual(s);
  });

  it('keeps users apart: another account on the same device never sees it', () => {
    saveSession('u1', withMessages([msg()]));
    expect(loadSession('u2', 'en')).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u2`)).toBeNull();
    // u2 looking does not clear u1's conversation either.
    expect(loadSession('u1', 'en')).not.toBeNull();
  });

  it('stores only confirmed messages', () => {
    saveSession('u1', withMessages([msg(), msg({ id: 2, role: 'learner', status: 'sending' }), msg({ id: 3, role: 'learner', status: 'failed' })]));
    expect(loadSession('u1', 'en')?.messages.map((m) => m.id)).toEqual([1]);
  });

  it('returns null when only the opening never arrived (nothing to resume)', () => {
    saveSession('u1', withMessages([msg({ status: 'sending' })]));
    expect(loadSession('u1', 'en')).toBeNull();
  });

  it('expires 24 h after the last saved message, counted from the last save', () => {
    const t0 = 1_000_000_000_000;
    saveSession('u1', withMessages([msg()]), t0);
    saveSession('u1', withMessages([msg(), msg({ id: 2, role: 'learner' })]), t0 + 10 * 60 * 60 * 1000);
    expect(loadSession('u1', 'en', t0 + 10 * 60 * 60 * 1000 + ROLEPLAY_TTL_MS)?.messages).toHaveLength(2);
    expect(loadSession('u1', 'en', t0 + 10 * 60 * 60 * 1000 + ROLEPLAY_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it('keeps a finished session (recap not done yet) within the TTL, and expires it like any other', () => {
    const t0 = 1_000_000_000_000;
    const done = { ...withMessages([msg()]), finished: true };
    saveSession('u1', done, t0);
    expect(loadSession('u1', 'en', t0 + 1000)).toEqual(done);
    expect(loadSession('u1', 'en', t0 + ROLEPLAY_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it('reads a legacy v1 session from this tab once, moves it to localStorage and removes the old key', () => {
    const s = withMessages([msg()]);
    sessionStorage.setItem(`${LEGACY_KEY_PREFIX}u1`, JSON.stringify(s));
    const now = 2_000_000_000_000;
    expect(loadSession('u1', 'en', now)).toEqual(s);
    expect(sessionStorage.getItem(`${LEGACY_KEY_PREFIX}u1`)).toBeNull();
    expect(JSON.parse(localStorage.getItem(`${KEY_PREFIX}u1`)!)).toEqual({ savedAt: now, session: s });
    expect(loadSession('u1', 'en', now + 1)).toEqual(s);
    // Another user's legacy key is not read for u2's lookup.
    sessionStorage.setItem(`${LEGACY_KEY_PREFIX}u3`, JSON.stringify(s));
    expect(loadSession('u2', 'en')).toBeNull();
  });

  it('clears a corrupted legacy v1 entry', () => {
    sessionStorage.setItem(`${LEGACY_KEY_PREFIX}u1`, '{oops');
    expect(loadSession('u1', 'en')).toBeNull();
    expect(sessionStorage.getItem(`${LEGACY_KEY_PREFIX}u1`)).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it('clears and returns null on a language mismatch', () => {
    saveSession('u1', withMessages([msg()]));
    expect(loadSession('u1', 'ko')).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it('clears an unknown scenario key', () => {
    saveSession('u1', { ...withMessages([msg()]), scenarioKey: 'does_not_exist' });
    expect(loadSession('u1', 'en')).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it.each([
    ['not json', '{oops'],
    ['array', '[]'],
    ['null', 'null'],
    ['a bare v1 session without the envelope', JSON.stringify(withMessages([msg()]))],
    ['missing savedAt', JSON.stringify({ session: withMessages([msg()]) })],
    ['too many messages', envelope({ ...withMessages([]), messages: Array.from({ length: 41 }, (_, i) => msg({ id: i })) })],
    ['over-long text', envelope(withMessages([msg({ text: 'x'.repeat(501) })]))],
    ['a failed message', envelope(withMessages([msg({ status: 'failed' as 'ok' })]))],
    ['non-integer id', envelope(withMessages([msg({ id: 1.5 })]))],
  ])('rejects corrupted data (%s) without throwing and clears it', (_name, raw) => {
    localStorage.setItem(`${KEY_PREFIX}u1`, raw);
    expect(loadSession('u1', 'en')).toBeNull();
    expect(localStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it('keeps Vietnamese and Hangul text byte-for-byte (NFC and NFD)', () => {
    const nfd = 'Cà phê'.normalize('NFD');
    const hangul = '안녕하세요'.normalize('NFD');
    saveSession('u1', withMessages([msg({ text: nfd }), msg({ id: 2, text: hangul })]));
    const back = loadSession('u1', 'en')!;
    expect(back.messages[0]!.text).toBe(nfd);
    expect(back.messages[1]!.text).toBe(hangul);
  });

  it('clearSession removes only that user, in both storages', () => {
    saveSession('u1', withMessages([msg()]));
    saveSession('u2', withMessages([msg()]));
    sessionStorage.setItem(`${LEGACY_KEY_PREFIX}u1`, 'x');
    clearSession('u1');
    expect(loadSession('u1', 'en')).toBeNull();
    expect(sessionStorage.getItem(`${LEGACY_KEY_PREFIX}u1`)).toBeNull();
    expect(loadSession('u2', 'en')).not.toBeNull();
  });

  it('survives blocked storage', () => {
    const fail = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail });
    vi.stubGlobal('sessionStorage', { getItem: fail, setItem: fail, removeItem: fail });
    expect(() => saveSession('u1', withMessages([msg()]))).not.toThrow();
    expect(loadSession('u1', 'en')).toBeNull();
    expect(() => clearSession('u1')).not.toThrow();
  });
});
