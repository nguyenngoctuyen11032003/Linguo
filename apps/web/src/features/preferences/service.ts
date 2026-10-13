import type { PreferencesUpdateInput, ThemePreference } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

export interface Preferences {
  theme: ThemePreference;
  reduceMotion: boolean;
}

export async function fetchPreferences(client: AppSupabaseClient, userId: string): Promise<Preferences> {
  const { data, error } = await client.from('user_preferences').select('theme, reduce_motion').eq('user_id', userId).single();
  if (error) throw error;
  return { theme: data.theme as ThemePreference, reduceMotion: data.reduce_motion };
}

export async function updatePreferences(client: AppSupabaseClient, userId: string, input: PreferencesUpdateInput): Promise<void> {
  const { data, error } = await client
    .from('user_preferences')
    .update({ theme: input.theme, reduce_motion: input.reduceMotion })
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('NO_ROWS_UPDATED');
}
