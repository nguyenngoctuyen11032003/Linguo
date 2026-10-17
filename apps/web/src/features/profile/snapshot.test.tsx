import { act, render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { AuthContext } from '../auth/AuthProvider';
import { ProfileProvider, useProfile } from './ProfileProvider';
import { readProfileSnapshot, writeProfileSnapshot } from './snapshot';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };
const row = (name: string) => ({ id: 'u1', display_name: name, timezone: 'UTC' });

function Probe() {
  const { status, profile, fromCache } = useProfile();
  return <span data-testid="p">{`${status}:${profile?.displayName ?? ''}:${fromCache ? 'cache' : 'fresh'}`}</span>;
}

const renderFor = (userId = 'u1') =>
  render(
    <AuthContext.Provider value={{ status: 'signed-in', session: null, user: { id: userId } as User }}>
      <ProfileProvider>
        <Probe />
      </ProfileProvider>
    </AuthContext.Provider>,
  );

afterEach(() => {
  mocks.client = null;
});

describe('profile snapshot', () => {
  it('round-trips, is scoped to the user and rejects malformed data', () => {
    writeProfileSnapshot('u1', { id: 'u1', displayName: 'A', timezone: 'UTC', avatarPath: null });
    expect(readProfileSnapshot('u1')).toEqual({ id: 'u1', displayName: 'A', timezone: 'UTC', avatarPath: null });
    expect(readProfileSnapshot('u2')).toBeNull();
    localStorage.setItem('linguo-snap-v1:profile:u3', JSON.stringify({ savedAt: 1, data: { id: 'someone-else', displayName: 'X', timezone: 'UTC' } }));
    expect(readProfileSnapshot('u3')).toBeNull();
    localStorage.setItem('linguo-snap-v1:profile:u4', JSON.stringify({ savedAt: 1, data: { nope: true } }));
    expect(readProfileSnapshot('u4')).toBeNull();
  });
});

describe('ProfileProvider offline snapshot', () => {
  it('saves the profile after a successful load', async () => {
    mocks.client = fakeClient({ profiles: fakeQuery({ data: row('Minh Anh') }) });
    renderFor();
    expect(await screen.findByText('ready:Minh Anh:fresh')).toBeInTheDocument();
    expect(readProfileSnapshot('u1')?.displayName).toBe('Minh Anh');
  });

  it('shows the saved profile at once and keeps it when the revalidation fails on the network', async () => {
    writeProfileSnapshot('u1', { id: 'u1', displayName: 'Đã lưu', timezone: 'UTC', avatarPath: null });
    mocks.client = fakeClient({ profiles: fakeQuery({ data: null, error: NETWORK }) });
    renderFor();
    // Ready on the very first render: no loading flash, no error card.
    expect(screen.getByTestId('p')).toHaveTextContent('ready:Đã lưu:cache');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('p')).toHaveTextContent('ready:Đã lưu:cache');
  });

  it('replaces the saved copy with the server value once it answers', async () => {
    writeProfileSnapshot('u1', { id: 'u1', displayName: 'Cũ', timezone: 'UTC', avatarPath: null });
    mocks.client = fakeClient({ profiles: fakeQuery({ data: row('Mới') }) });
    renderFor();
    expect(await screen.findByText('ready:Mới:fresh')).toBeInTheDocument();
    expect(readProfileSnapshot('u1')?.displayName).toBe('Mới');
  });

  it('still shows an error when there is no saved copy and the network fails', async () => {
    mocks.client = fakeClient({ profiles: fakeQuery({ data: null, error: NETWORK }) });
    renderFor();
    expect(await screen.findByText('error::fresh')).toBeInTheDocument();
  });

  it('does not hide a real server error behind the saved copy', async () => {
    writeProfileSnapshot('u1', { id: 'u1', displayName: 'Đã lưu', timezone: 'UTC', avatarPath: null });
    mocks.client = fakeClient({ profiles: fakeQuery({ data: null, error: { message: 'permission denied', code: '42501' } }) });
    renderFor();
    expect(await screen.findByText('error::fresh')).toBeInTheDocument();
  });

  it("never shows another user's saved profile", () => {
    writeProfileSnapshot('u1', { id: 'u1', displayName: 'Của u1', timezone: 'UTC', avatarPath: null });
    mocks.client = fakeClient({ profiles: fakeQuery({ data: null, error: NETWORK }) });
    renderFor('u2');
    expect(screen.getByTestId('p')).toHaveTextContent('loading::fresh');
  });
});
