import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { result, submitArgs } from './lesson-fixtures';
import { createOutbox } from './outbox';
import { OutboxSyncProvider, useOutboxSyncContext } from './OutboxSyncProvider';
import type { OutboxResultHandler } from './useOutboxSync';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };

function Pending({ onResult }: { onResult?: OutboxResultHandler }) {
  const { pendingCount, subscribe } = useOutboxSyncContext();
  useEffect(() => (onResult ? subscribe(onResult) : undefined), [onResult, subscribe]);
  return <output data-testid="pending">{pendingCount}</output>;
}

describe('OutboxSyncProvider', () => {
  it('replays queued answers on any signed-in screen and hands results to subscribers', async () => {
    const args = submitArgs();
    createOutbox(USER_ID).add({ args, queueIndex: 0 });
    const graded = result();
    mocks.rpc.mockResolvedValue({ data: graded, error: null });
    const onResult = vi.fn();
    render(
      <AuthContext.Provider value={auth}>
        <OutboxSyncProvider>
          <Pending onResult={onResult} />
        </OutboxSyncProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('0'));
    expect(mocks.rpc).toHaveBeenCalledWith('submit_exercise', args);
    expect(onResult).toHaveBeenCalledWith(args.p_idempotency_key, { result: graded }, expect.objectContaining({ args }));
  });

  it('stops notifying a handler once it unsubscribes', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    createOutbox(USER_ID).add({ args: submitArgs(), queueIndex: 0 });
    const onResult = vi.fn();
    const view = render(
      <AuthContext.Provider value={auth}>
        <OutboxSyncProvider>
          <Pending onResult={onResult} />
        </OutboxSyncProvider>
      </AuthContext.Provider>,
    );
    expect(screen.getByTestId('pending')).toHaveTextContent('1');
    view.rerender(
      <AuthContext.Provider value={auth}>
        <OutboxSyncProvider>
          <Pending />
        </OutboxSyncProvider>
      </AuthContext.Provider>,
    );
    mocks.rpc.mockResolvedValue({ data: result(), error: null });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('0'));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('requires the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Pending />)).toThrow('useOutboxSyncContext must be used inside OutboxSyncProvider');
  });
});
