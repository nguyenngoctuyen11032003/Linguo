import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { AuthContext } from '../auth/AuthProvider';
import { fetchPreferences, updatePreferences } from '../preferences/service';
import { ProfileProvider, useProfile } from './ProfileProvider';
import { fetchProfile, updateProfile } from './service';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

describe('profile service', () => {
  it('maps the row to a Profile', async () => {
    const q = fakeQuery({ data: { id: 'u1', display_name: null, timezone: 'Asia/Ho_Chi_Minh' }, error: null });
    const profile = await fetchProfile(fakeClient({ profiles: q }), 'u1');
    expect(profile).toEqual({ id: 'u1', displayName: '', timezone: 'Asia/Ho_Chi_Minh', avatarPath: null });
    expect(q.calls).toContainEqual(['eq', ['id', 'u1']]);
  });

  it('stores an empty display name as null, asks for the updated row, and throws on errors', async () => {
    const ok = fakeQuery({ data: [{ id: 'u1' }] });
    await updateProfile(fakeClient({ profiles: ok }), 'u1', { displayName: '', timezone: 'UTC' });
    expect(ok.calls[0]).toEqual(['update', [{ display_name: null, timezone: 'UTC' }]]);
    expect(ok.calls).toContainEqual(['select', ['id']]);

    const failing = fakeQuery({ data: null, error: { message: 'boom' } });
    await expect(updateProfile(fakeClient({ profiles: failing }), 'u1', { displayName: 'A', timezone: 'UTC' })).rejects.toEqual({
      message: 'boom',
    });
  });

  it('throws NO_ROWS_UPDATED when the update matched nothing (e.g. blocked by RLS)', async () => {
    const none = fakeQuery({ data: [] });
    await expect(updateProfile(fakeClient({ profiles: none }), 'u1', { displayName: 'A', timezone: 'UTC' })).rejects.toThrow(
      'NO_ROWS_UPDATED',
    );
  });
});

describe('preferences service', () => {
  it('reads and writes camelCase preferences', async () => {
    const read = fakeQuery({ data: { theme: 'dark', reduce_motion: true }, error: null });
    expect(await fetchPreferences(fakeClient({ user_preferences: read }), 'u1')).toEqual({ theme: 'dark', reduceMotion: true });

    const write = fakeQuery({ data: [{ user_id: 'u1' }] });
    await updatePreferences(fakeClient({ user_preferences: write }), 'u1', { theme: 'light', reduceMotion: false });
    expect(write.calls[0]).toEqual(['update', [{ theme: 'light', reduce_motion: false }]]);
    expect(write.calls).toContainEqual(['select', ['user_id']]);
  });

  it('throws NO_ROWS_UPDATED when no preferences row was updated', async () => {
    const none = fakeQuery({ data: [] });
    await expect(updatePreferences(fakeClient({ user_preferences: none }), 'u1', { theme: 'light', reduceMotion: false })).rejects.toThrow(
      'NO_ROWS_UPDATED',
    );
  });
});

function Probe() {
  const { status, profile } = useProfile();
  return <span>{`${status}:${profile?.displayName ?? ''}`}</span>;
}

function withUser(userId: string | undefined, children: ReactNode) {
  const user = userId ? ({ id: userId } as User) : null;
  return (
    <AuthContext.Provider value={{ status: user ? 'signed-in' : 'signed-out', session: null, user }}>
      <ProfileProvider>{children}</ProfileProvider>
    </AuthContext.Provider>
  );
}

describe('ProfileProvider', () => {
  it('loads the signed-in user profile', async () => {
    mocks.client = fakeClient({
      profiles: fakeQuery({ data: { id: 'u1', display_name: 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh' }, error: null }),
    });
    render(withUser('u1', <Probe />));
    expect(screen.getByText('loading:')).toBeInTheDocument();
    expect(await screen.findByText('ready:Minh Anh')).toBeInTheDocument();
  });

  it('never exposes the previous user profile after the user changes', async () => {
    let finishSecond!: (row: unknown) => void;
    const second = new Promise((resolve) => {
      finishSecond = resolve;
    });
    mocks.client = {
      from: () => {
        let id = '';
        const builder = {
          select: () => builder,
          eq: (_column: string, value: string) => {
            id = value;
            return builder;
          },
          single: () =>
            id === 'u1'
              ? Promise.resolve({ data: { id: 'u1', display_name: 'Minh Anh', timezone: 'UTC' }, error: null })
              : second.then((data) => ({ data, error: null })),
        };
        return builder;
      },
    };

    const { rerender } = render(withUser('u1', <Probe />));
    expect(await screen.findByText('ready:Minh Anh')).toBeInTheDocument();

    rerender(withUser('u2', <Probe />));
    // Same commit as the user change: the old profile is already gone.
    expect(screen.queryByText('ready:Minh Anh')).not.toBeInTheDocument();
    expect(screen.getByText('loading:')).toBeInTheDocument();

    finishSecond({ id: 'u2', display_name: 'Linh', timezone: 'UTC' });
    expect(await screen.findByText('ready:Linh')).toBeInTheDocument();

    rerender(withUser(undefined, <Probe />));
    expect(screen.getByText('loading:')).toBeInTheDocument();
  });
});
