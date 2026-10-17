import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMeteredConnection, isSaveDataActive, useMeteredConnection, useSaveData } from './useSaveData';

function stubConnection(initial: Record<string, unknown>) {
  const listeners = new Set<() => void>();
  const connection = {
    ...initial,
    addEventListener: vi.fn((_: string, l: () => void) => listeners.add(l)),
    removeEventListener: vi.fn((_: string, l: () => void) => listeners.delete(l)),
  };
  vi.stubGlobal('navigator', { ...navigator, connection });
  return {
    connection,
    change(next: Record<string, unknown>) {
      Object.assign(connection, next);
      listeners.forEach((l) => l());
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useSaveData', () => {
  it('is false without the Network Information API', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: undefined });
    expect(isSaveDataActive()).toBe(false);
    expect(renderHook(() => useSaveData()).result.current).toBe(false);
  });

  it('follows saveData / slow connections and reacts to change events', () => {
    const net = stubConnection({ saveData: false, effectiveType: '4g' });
    const { result, unmount } = renderHook(() => useSaveData());
    expect(result.current).toBe(false);
    act(() => net.change({ saveData: true }));
    expect(result.current).toBe(true);
    act(() => net.change({ saveData: false, effectiveType: '2g' }));
    expect(result.current).toBe(true);
    act(() => net.change({ effectiveType: '4g' }));
    expect(result.current).toBe(false);
    unmount();
    expect(net.listeners.size).toBe(0);
  });
});

describe('isMeteredConnection', () => {
  it('counts data saver, slow links and cellular', () => {
    stubConnection({ type: 'wifi', effectiveType: '4g' });
    expect(isMeteredConnection()).toBe(false);
    stubConnection({ type: 'cellular', effectiveType: '4g' });
    expect(isMeteredConnection()).toBe(true);
    stubConnection({ saveData: true });
    expect(isMeteredConnection()).toBe(true);
  });

  it('is reactive through useMeteredConnection', () => {
    const net = stubConnection({ type: 'wifi' });
    const { result } = renderHook(() => useMeteredConnection());
    expect(result.current).toBe(false);
    act(() => net.change({ type: 'cellular' }));
    expect(result.current).toBe(true);
  });
});
