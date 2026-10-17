import { createClient } from '@supabase/supabase-js';
import type { Database } from '@linguo/shared';
import { authStorageKey, isBrowserOffline, readStoredSession } from './auth-storage';
import { createBoundedFetch } from './bounded-fetch';
import { env } from './env';
import type { AppSupabaseClient } from './supabase';

export { authStorageKey } from './auth-storage';

// Only ever loaded through import() (supabase-loader.ts): @supabase/supabase-js (~55 kB gzip) stays out of the
// first load, so the landing page paints without it.
export function createAppSupabase(): AppSupabaseClient {
  const storageKey = authStorageKey();
  const client = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: {
      storageKey,
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // /auth/callback exchanges the code explicitly; auto-detection would exchange it twice.
      detectSessionInUrl: false,
    },
    global: { fetch: createBoundedFetch() },
  });
  // Every data request first asks the auth client for its token. With no network and an expired access token that
  // call retries the refresh for ~25 s (and again every minute), which would stall every screen on a cold offline
  // start. While the browser reports offline, hand out the stored session at once: the request then fails fast in
  // createBoundedFetch. The stored session is only read, never rewritten, so nothing is lost; the next online
  // call goes through supabase-js and refreshes as usual.
  const getSession = client.auth.getSession.bind(client.auth);
  client.auth.getSession = (async () => {
    if (isBrowserOffline()) {
      const stored = readStoredSession(storageKey);
      if (stored) return { data: { session: stored }, error: null };
    }
    return getSession();
  }) as typeof client.auth.getSession;
  return client;
}
