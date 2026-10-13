import type { ProfileUpdateInput } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

export interface Profile {
  id: string;
  displayName: string;
  timezone: string;
}

export async function fetchProfile(client: AppSupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await client.from('profiles').select('id, display_name, timezone').eq('id', userId).single();
  if (error) throw error;
  return { id: data.id, displayName: data.display_name ?? '', timezone: data.timezone };
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
