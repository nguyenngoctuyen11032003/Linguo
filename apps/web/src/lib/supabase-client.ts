import { createClient } from '@supabase/supabase-js';
import type { Database } from '@linguo/shared';
import { env } from './env';
import type { AppSupabaseClient } from './supabase';

// Only ever loaded through import() (supabase-loader.ts): @supabase/supabase-js (~55 kB gzip) stays out of the
// first load, so the landing page paints without it.
export function createAppSupabase(): AppSupabaseClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // /auth/callback exchanges the code explicitly; auto-detection would exchange it twice.
      detectSessionInUrl: false,
    },
  });
}
