import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readCached, writeCached } from './read-cache';
import { useReadThrough } from './useReadThrough';

const schema = z.object({ n: z.number() });
type Data = z.infer<typeof schema>;
const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function useIt(props: { userId?: string | null; scope?: string; request?: string; fetcher: () => Promise<Data>; enabled?: boolean; forCache?: (d: Data) => Data }) {
  return useReadThrough<Data>({
    enabled: props.enabled ?? true,
    userId: props.userId === undefined ? 'u1' : props.userId,
    scope: props.scope ?? 'u1:a',
    request: props.request ?? 'a',
    cacheName: 'thing:' + (props.request ?? 'a'),
    schema,
    fetcher: props.fetcher,
    forCache: props.forCache,
  });
}

afterEach(() => {
  localStorage.clear();
  setOnline(true);
});

describe('useReadThrough', () => {
  it('fetches, shows the data, and saves it', async () => {
    const { result } = renderHook(() => useIt({ fetcher: () => Promise.resolve({ n: 1 }) }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual({ n: 1 });
    expect(result.current.stale).toBe(false);
    expect(readCached('thing:a', 'u1', schema)?.data).toEqual({ n: 1 });
  });

  it('shows the saved copy at once and replaces it with the fresh answer', async () => {
    writeCached('thing:a', 'u1', { n: 1 });
    let resolve!: (d: Data) => void;
    const { result } = renderHook(() => useIt({ fetcher: () => new Promise<Data>((r) => (resolve = r)) }));
    expect(result.current).toMatchObject({ status: 'ready', data: { n: 1 } });
    await act(async () => resolve({ n: 2 }));
    expect(result.current).toMatchObject({ status: 'ready', data: { n: 2 }, stale: false });
  });

  it('keeps the saved copy, flagged stale, when the server cannot be reached', async () => {
    writeCached('thing:a', 'u1', { n: 1 });
    const { result } = renderHook(() => useIt({ fetcher: () => Promise.reject(NETWORK) }));
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current).toMatchObject({ status: 'ready', data: { n: 1 }, error: null });
    expect(result.current.updatedAt).toBeGreaterThan(0);
  });

  it('offline: does not call the server at all', async () => {
    writeCached('thing:a', 'u1', { n: 1 });
    setOnline(false);
    const fetcher = vi.fn().mockResolvedValue({ n: 9 });
    const { result } = renderHook(() => useIt({ fetcher }));
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ n: 1 });
    // Back online: revalidates by itself.
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toMatchObject({ data: { n: 9 }, stale: false }));
  });

  it('offline with nothing saved is an error, not a hang', async () => {
    setOnline(false);
    const { result } = renderHook(() => useIt({ fetcher: () => Promise.resolve({ n: 1 }) }));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('a server refusal is an error even when a copy exists', async () => {
    writeCached('thing:a', 'u1', { n: 1 });
    const { result } = renderHook(() => useIt({ fetcher: () => Promise.reject({ message: 'path_not_found', code: 'P0001' }) }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
  });

  it('discards a saved copy that fails the schema or is older than the TTL', async () => {
    localStorage.setItem('linguo-snap-v1:thing:a:u1', JSON.stringify({ savedAt: Date.now(), data: { n: 'x' } }));
    expect(readCached('thing:a', 'u1', schema)).toBeNull();
    writeCached('thing:a', 'u1', { n: 1 });
    expect(readCached('thing:a', 'u1', schema, 1000, Date.now() + 5000)).toBeNull();
    expect(readCached('thing:a', 'u2', schema)).toBeNull();
  });

  it('never shows the data of another scope while the new one loads', async () => {
    const { result, rerender } = renderHook((p: { scope: string; request: string; value: number }) => useIt({ scope: p.scope, request: p.request, fetcher: () => Promise.resolve({ n: p.value }) }), {
      initialProps: { scope: 'u1:a', request: 'a', value: 1 },
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    rerender({ scope: 'u1:b', request: 'b', value: 2 });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
  });

  it('keeps the data of the same scope while another request loads, and saves what forCache returns', async () => {
    const { result, rerender } = renderHook((p: { request: string; value: number }) => useIt({ request: p.request, fetcher: () => Promise.resolve({ n: p.value }), forCache: (d) => ({ n: d.n * 10 }) }), {
      initialProps: { request: 'a', value: 1 },
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    expect(readCached('thing:a', 'u1', schema)?.data).toEqual({ n: 10 });
    rerender({ request: 'b', value: 2 });
    expect(result.current.data).toEqual({ n: 1 });
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
  });

  it('update replaces and saves the data', async () => {
    const { result } = renderHook(() => useIt({ fetcher: () => Promise.resolve({ n: 1 }) }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update((d) => ({ n: d.n + 1 })));
    expect(result.current.data).toEqual({ n: 2 });
    expect(readCached('thing:a', 'u1', schema)?.data).toEqual({ n: 2 });
  });

  it('stays loading while disabled and without a user', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const { result } = renderHook(() => useIt({ fetcher, enabled: false }));
    const anonymous = renderHook(() => useIt({ fetcher, userId: null }));
    await act(async () => undefined);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
    expect(anonymous.result.current.status).toBe('loading');
  });
});
