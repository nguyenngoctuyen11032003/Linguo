import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@linguo/shared';
import { env } from './env';

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

/** Null when VITE_SUPABASE_* are missing; the UI then shows <NotConfigured />. */
export function getSupabase(): AppSupabaseClient | null {
  if (!env.isSupabaseConfigured) return null;
  client ??= createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // /auth/callback exchanges the code explicitly; auto-detection would exchange it twice.
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function requireSupabase(): AppSupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase chưa được cấu hình');
  return c;
}

/** Absolute URL for auth redirects (email links, OAuth), including the GitHub Pages base path. */
export function authRedirect(path: string): string {
  return `${env.siteUrl}${path}`;
}
