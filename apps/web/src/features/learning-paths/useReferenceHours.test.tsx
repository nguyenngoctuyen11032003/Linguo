import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { resetReferenceHoursCache, useReferenceHours } from './useReferenceHours';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

const rows = [{ language_code: 'en', level_code: 'a1', ordinal: 1, cumulative_hours: 90, reviewed: false }];
const clientWith = (query: ReturnType<typeof fakeQuery>) => fakeClient({ level_reference_hours: query });

describe('useReferenceHours', () => {
  beforeEach(() => {
    resetReferenceHoursCache();
    mocks.client = null;
  });

  it('stays idle without loading while disabled', () => {
    const q = fakeQuery({ data: rows });
    mocks.client = clientWith(q);
    const { result } = renderHook(() => useReferenceHours(false));
    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(q.calls).toHaveLength(0);
  });

  it('loads when enabled flips on, then serves later mounts without a loading frame', async () => {
    const q = fakeQuery({ data: rows });
    mocks.client = clientWith(q);
    const { result, rerender } = renderHook(({ enabled }) => useReferenceHours(enabled), { initialProps: { enabled: false } });
    expect(result.current.status).toBe('idle');
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.en).toHaveLength(1);

    const second = renderHook(() => useReferenceHours());
    expect(second.result.current.status).toBe('ready'); // first render, no spinner frame
    expect(q.calls.filter(([m]) => m === 'select')).toHaveLength(1);
  });

  it('reports an error without a client and recovers through a stable retry', async () => {
    const { result } = renderHook(() => useReferenceHours());
    await waitFor(() => expect(result.current.status).toBe('error'));
    const retry = result.current.retry;

    mocks.client = clientWith(fakeQuery({ data: rows }));
    retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.retry).toBe(retry);
  });

  it('errors on a failed load and clears the cache so retry can succeed', async () => {
    mocks.client = clientWith(fakeQuery({ data: null, error: { message: 'boom' } }));
    const { result } = renderHook(() => useReferenceHours());
    await waitFor(() => expect(result.current.status).toBe('error'));

    mocks.client = clientWith(fakeQuery({ data: rows }));
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
