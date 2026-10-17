import type { Session } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The localStorage key supabase-js persists the session under. It is the library default (`sb-<project ref>-auth-token`),
 * computed here (no supabase-js import) so the boot code can read the stored session without loading the client chunk,
 * and passed to createClient explicitly so both always agree.
 */
export function authStorageKey(supabaseUrl: string = env.supabaseUrl): string {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-unknown-auth-token';
  }
}

/**
 * The session supabase-js last persisted, exactly as stored (the access token may be expired). null when absent or
 * malformed. Read-only: never writes or removes anything, so a transient network failure can never sign the learner out.
 */
export function readStoredSession(key: string = authStorageKey()): Session | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Partial<Session>;
    if (typeof s.access_token !== 'string' || typeof s.refresh_token !== 'string') return null;
    if (!s.user || typeof s.user !== 'object' || typeof s.user.id !== 'string') return null;
    return s as Session;
  } catch {
    return null;
  }
}

/** True when the browser reports no connection (reliable for "off", but "on" can still be a dead network). */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
