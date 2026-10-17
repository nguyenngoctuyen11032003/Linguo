import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoundedFetch, isBoundedRequest, REST_TIMEOUT_MS } from './bounded-fetch';

const REST = 'https://x.supabase.co/rest/v1/profiles?select=id';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isBoundedRequest', () => {
  it('bounds REST and RPC, never auth, functions or storage', () => {
    expect(isBoundedRequest(REST)).toBe(true);
    expect(isBoundedRequest('https://x.supabase.co/rest/v1/rpc/get_lesson')).toBe(true);
    expect(isBoundedRequest(new URL('https://x.supabase.co/rest/v1/rpc/start_lesson'))).toBe(true);
    expect(isBoundedRequest('https://x.supabase.co/auth/v1/token?grant_type=refresh_token')).toBe(false);
    expect(isBoundedRequest('https://x.supabase.co/functions/v1/tutor')).toBe(false);
    expect(isBoundedRequest('https://x.supabase.co/storage/v1/object/avatars/a.png')).toBe(false);
  });
});

describe('createBoundedFetch', () => {
  it('fails a data request at once with a TypeError when offline, without touching the network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const base = vi.fn();
    await expect(createBoundedFetch(base as never)(REST)).rejects.toThrow(TypeError);
    expect(base).not.toHaveBeenCalled();
  });

  it('lets auth, functions and storage requests through offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const base = vi.fn().mockResolvedValue(new Response('{}'));
    const f = createBoundedFetch(base as never);
    await f('https://x.supabase.co/auth/v1/token?grant_type=refresh_token');
    await f('https://x.supabase.co/functions/v1/tutor');
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('passes online data requests through with a signal and the original init', async () => {
    const base = vi.fn().mockResolvedValue(new Response('[]'));
    await createBoundedFetch(base as never)(REST, { method: 'GET', headers: { a: 'b' } });
    const init = base.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a request that hangs past the timeout with a TimeoutError', async () => {
    vi.useFakeTimers();
    const base = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const result = createBoundedFetch(base as never)(REST).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REST_TIMEOUT_MS + 1);
    const error = (await result) as DOMException;
    expect(error.name).toBe('TimeoutError');
  });

  it('still honours the caller\'s own abort signal', async () => {
    const base = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const caller = new AbortController();
    const result = createBoundedFetch(base as never)(REST, { signal: caller.signal }).catch((e: unknown) => e);
    caller.abort(new DOMException('gone', 'AbortError'));
    expect(((await result) as DOMException).name).toBe('AbortError');
  });
});
