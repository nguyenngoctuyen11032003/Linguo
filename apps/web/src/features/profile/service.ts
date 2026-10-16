import type { ProfileUpdateInput } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

export interface Profile {
  id: string;
  displayName: string;
  timezone: string;
  /** Object path in the avatars bucket; null/absent = initial-letter avatar. */
  avatarPath?: string | null;
}

export async function fetchProfile(client: AppSupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await client.from('profiles').select('id, display_name, timezone').eq('id', userId).single();
  if (error) throw error;
  // The avatar column comes from a later migration: a missing column or any failure here must never break the profile.
  let avatarPath: string | null = null;
  try {
    const res = await client.from('profiles').select('avatar_path').eq('id', userId).single();
    if (!res.error) avatarPath = res.data?.avatar_path ?? null;
  } catch {
    // Initial-letter avatar.
  }
  return { id: data.id, displayName: data.display_name ?? '', timezone: data.timezone, avatarPath };
}

export async function updateProfile(client: AppSupabaseClient, userId: string, input: ProfileUpdateInput): Promise<void> {
  const { data, error } = await client
    .from('profiles')
    .update({ display_name: input.displayName || null, timezone: input.timezone })
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  // RLS (or a missing row) lets an UPDATE succeed while touching nothing; never report that as saved.
  if (!data || data.length === 0) throw new Error('NO_ROWS_UPDATED');
}
