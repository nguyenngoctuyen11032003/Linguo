import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@linguo/shared';
import { env } from './env';
import { loadedSupabase } from './supabase-loader';

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Null when VITE_SUPABASE_* are missing; the UI then shows <NotConfigured />. The client itself is loaded lazily
 * (supabase-loader.ts): every route that uses it awaits the load first, so it is set by the time any screen reads it.
 */
export function getSupabase(): AppSupabaseClient | null {
  if (!env.isSupabaseConfigured) return null;
  return loadedSupabase();
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
