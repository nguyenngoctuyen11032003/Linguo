import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
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
    expect(profile).toEqual({ id: 'u1', displayName: '', timezone: 'Asia/Ho_Chi_Minh' });
    expect(q.calls).toContainEqual(['eq', ['id', 'u1']]);
  });

  it('stores an empty display name as null and throws on errors', async () => {
    const ok = fakeQuery({ data: null, error: null });
    await updateProfile(fakeClient({ profiles: ok }), 'u1', { displayName: '', timezone: 'UTC' });
    expect(ok.calls[0]).toEqual(['update', [{ display_name: null, timezone: 'UTC' }]]);

    const failing = fakeQuery({ data: null, error: { message: 'boom' } });
    await expect(updateProfile(fakeClient({ profiles: failing }), 'u1', { displayName: 'A', timezone: 'UTC' })).rejects.toEqual({
      message: 'boom',
    });
  });
});

describe('preferences service', () => {
  it('reads and writes camelCase preferences', async () => {
    const read = fakeQuery({ data: { theme: 'dark', reduce_motion: true }, error: null });
    expect(await fetchPreferences(fakeClient({ user_preferences: read }), 'u1')).toEqual({ theme: 'dark', reduceMotion: true });

    const write = fakeQuery({ data: null, error: null });
    await updatePreferences(fakeClient({ user_preferences: write }), 'u1', { theme: 'light', reduceMotion: false });
    expect(write.calls[0]).toEqual(['update', [{ theme: 'light', reduce_motion: false }]]);
  });
});

describe('ProfileProvider', () => {
  it('loads the signed-in user profile', async () => {
    mocks.client = fakeClient({
      profiles: fakeQuery({ data: { id: 'u1', display_name: 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh' }, error: null }),
    });
    function Probe() {
      const { status, profile } = useProfile();
      return <span>{`${status}:${profile?.displayName ?? ''}`}</span>;
    }
    render(
      <AuthContext.Provider value={{ status: 'signed-in', session: null, user: { id: 'u1' } as User }}>
        <ProfileProvider>
          <Probe />
        </ProfileProvider>
      </AuthContext.Provider>,
    );
    expect(screen.getByText('loading:')).toBeInTheDocument();
    expect(await screen.findByText('ready:Minh Anh')).toBeInTheDocument();
  });
});
