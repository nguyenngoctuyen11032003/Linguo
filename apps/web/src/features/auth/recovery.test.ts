import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRecovery, isRecoveryPending, markRecoveryPending } from './recovery';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('recovery flag', () => {
  it('is off by default, on after mark, off after clear', () => {
    expect(isRecoveryPending()).toBe(false);
    markRecoveryPending();
    expect(isRecoveryPending()).toBe(true);
    clearRecovery();
    expect(isRecoveryPending()).toBe(false);
  });

  it('is idempotent', () => {
    markRecoveryPending();
    markRecoveryPending();
    expect(isRecoveryPending()).toBe(true);
    clearRecovery();
    clearRecovery();
    expect(isRecoveryPending()).toBe(false);
  });

  it('is per tab: never written to localStorage', () => {
    markRecoveryPending();
    expect(localStorage.length).toBe(0);
  });

  it('only the exact marker counts', () => {
    sessionStorage.setItem('linguo-recovery', 'true');
    expect(isRecoveryPending()).toBe(false);
  });

  it('never throws when storage is blocked and reports not pending', () => {
    const fail = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('sessionStorage', { getItem: fail, setItem: fail, removeItem: fail });
    expect(() => markRecoveryPending()).not.toThrow();
    expect(isRecoveryPending()).toBe(false);
    expect(() => clearRecovery()).not.toThrow();
  });
});
