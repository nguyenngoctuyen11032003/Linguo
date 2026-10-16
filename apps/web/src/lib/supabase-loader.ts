import { env } from './env';
import type { AppSupabaseClient } from './supabase';

// The Supabase client is created on demand: supabase-client.ts (and @supabase/supabase-js with it) is a lazy chunk.
// Every screen that talks to Supabase is a lazy route whose loader awaits this (app/app-services.ts), and the
// AuthProvider waits for it before resolving the session, so getSupabase() is already set wherever it is read.
// Kept apart from supabase.ts so tests that mock '@/lib/supabase' keep working unchanged.

let client: AppSupabaseClient | null = null;
let pending: Promise<AppSupabaseClient | null> | null = null;

/** The client once loaded; null before that and when VITE_SUPABASE_* are missing. */
export function loadedSupabase(): AppSupabaseClient | null {
  return client;
}

/** Loads and creates the client once (null when unconfigured). A failed chunk load is retried on the next call. */
export function loadSupabase(): Promise<AppSupabaseClient | null> {
  if (!env.isSupabaseConfigured) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  pending ??= import('./supabase-client').then(
    (m) => {
      client ??= m.createAppSupabase();
      return client;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}
