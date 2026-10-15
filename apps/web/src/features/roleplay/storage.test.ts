import { findRoleplayScenario } from '@linguo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY_PREFIX, clearSession, loadSession, saveSession } from './storage';
import { newSession, type RoleplayMessage, type RoleplaySession } from './session';

const CAFE = findRoleplayScenario('en', 'cafe_order')!;
const msg = (over: Partial<RoleplayMessage> = {}): RoleplayMessage => ({
  id: 1, role: 'partner', text: 'Hi!', corrections: [], hint_vi: null, responseId: null, status: 'ok', ...over,
});
const withMessages = (messages: RoleplayMessage[]): RoleplaySession => ({ ...newSession(CAFE, 'a2', 5), messages, nextId: messages.length + 1 });

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('roleplay storage', () => {
  it('round-trips a session', () => {
    const s = withMessages([msg(), msg({ id: 2, role: 'learner', text: 'Một ly cà phê, làm ơn' })]);
    saveSession('u1', s);
    expect(loadSession('u1', 'en')).toEqual(s);
  });

  it('keeps users apart', () => {
    saveSession('u1', withMessages([msg()]));
    expect(loadSession('u2', 'en')).toBeNull();
  });

  it('stores only confirmed messages', () => {
    saveSession('u1', withMessages([msg(), msg({ id: 2, role: 'learner', status: 'sending' }), msg({ id: 3, role: 'learner', status: 'failed' })]));
    expect(loadSession('u1', 'en')?.messages.map((m) => m.id)).toEqual([1]);
  });

  it('returns null when only the opening never arrived (nothing to resume)', () => {
    saveSession('u1', withMessages([msg({ status: 'sending' })]));
    expect(loadSession('u1', 'en')).toBeNull();
  });

  it('clears and returns null on a language mismatch', () => {
    saveSession('u1', withMessages([msg()]));
    expect(loadSession('u1', 'ko')).toBeNull();
    expect(sessionStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it('clears an unknown scenario key', () => {
    saveSession('u1', { ...withMessages([msg()]), scenarioKey: 'does_not_exist' });
    expect(loadSession('u1', 'en')).toBeNull();
    expect(sessionStorage.getItem(`${KEY_PREFIX}u1`)).toBeNull();
  });

  it.each([
    ['not json', '{oops'],
    ['array', '[]'],
    ['null', 'null'],
    ['too many messages', JSON.stringify({ ...withMessages([]), messages: Array.from({ length: 41 }, (_, i) => msg({ id: i })) })],
    ['over-long text', JSON.stringify(withMessages([msg({ text: 'x'.repeat(501) })]))],
    ['a failed message', JSON.stringify(withMessages([msg({ status: 'failed' as 'ok' })]))],
    ['non-integer id', JSON.stringify(withMessages([msg({ id: 1.5 })]))],
  ])('rejects corrupted data (%s) without throwing', (_name, raw) => {
    sessionStorage.setItem(`${KEY_PREFIX}u1`, raw);
    expect(loadSession('u1', 'en')).toBeNull();
  });

  it('keeps Vietnamese and Hangul text byte-for-byte (NFC and NFD)', () => {
    const nfd = 'Cà phê'.normalize('NFD');
    const hangul = '안녕하세요'.normalize('NFD');
    saveSession('u1', withMessages([msg({ text: nfd }), msg({ id: 2, text: hangul })]));
    const back = loadSession('u1', 'en')!;
    expect(back.messages[0]!.text).toBe(nfd);
    expect(back.messages[1]!.text).toBe(hangul);
  });

  it('clearSession removes only that user', () => {
    saveSession('u1', withMessages([msg()]));
    saveSession('u2', withMessages([msg()]));
    clearSession('u1');
    expect(loadSession('u1', 'en')).toBeNull();
    expect(loadSession('u2', 'en')).not.toBeNull();
  });

  it('survives blocked storage', () => {
    const fail = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.stubGlobal('sessionStorage', { getItem: fail, setItem: fail, removeItem: fail });
    expect(() => saveSession('u1', withMessages([msg()]))).not.toThrow();
    expect(loadSession('u1', 'en')).toBeNull();
    expect(() => clearSession('u1')).not.toThrow();
  });
});
