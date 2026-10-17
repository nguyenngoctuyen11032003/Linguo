import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { clearRecovery } from './recovery';
import { isBrowserOffline, readStoredSession } from '@/lib/auth-storage';
import { env } from '@/lib/env';
import type { AppSupabaseClient } from '@/lib/supabase';
import { loadSupabase } from '@/lib/supabase-loader';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unconfigured';
  session: Session | null;
  user: User | null;
}

export const AuthContext = createContext<AuthState | null>(null);

const fromSession = (session: Session | null): AuthState =>
  session ? { status: 'signed-in', session, user: session.user } : { status: 'signed-out', session: null, user: null };

interface AuthProviderProps {
  children: ReactNode;
  /** Injected in tests; null means unconfigured. Without it the app client is loaded with `loadClient`. */
  client?: AppSupabaseClient | null;
  /**
   * Resolves the app client (null when unconfigured). The client lives in a lazy chunk (lib/supabase-loader.ts);
   * App passes whenAppServicesReady so analytics is wired before a session is reported.
   */
  loadClient?: () => Promise<AppSupabaseClient | null>;
}

/** With a stored session but no answer from supabase-js after this long (dead network), open the app on the stored session. */
export const SESSION_LOOKUP_GRACE_MS = 4_000;

/**
 * Starts the session lookup and the auth-change subscription.
 *
 * Offline-first: supabase-js answers `getSession()` with `session: null` plus an AuthRetryableFetchError when the
 * access token has expired and the refresh cannot reach the server (a phone opened without signal the next morning),
 * after ~25 s of retries. Treating that as signed out would bounce an offline learner to the sign-in screen. The
 * session itself is still in storage (supabase-js keeps it on a retryable failure), so we fall back to it: the
 * learner stays signed in on the stored session and the library upgrades it (TOKEN_REFRESHED) once the network is
 * back. We only ever read storage here; a real sign-out (SIGNED_OUT) or a refresh the server rejects removes the
 * stored session first, so those still end in the signed-out state.
 */
function watchSession(client: AppSupabaseClient, setState: (state: AuthState) => void, isActive: () => boolean): () => void {
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const apply = (session: Session | null) => {
    if (graceTimer) clearTimeout(graceTimer);
    if (isActive()) setState(fromSession(session));
  };

  const storedAtStart = readStoredSession();
  if (storedAtStart && isBrowserOffline()) {
    // Offline cold start: no point holding the loader for a refresh that cannot succeed.
    apply(storedAtStart);
  } else if (storedAtStart) {
    // Online but the network may be dead (lie-fi): do not hold the loader for the library's whole retry budget.
    graceTimer = setTimeout(() => apply(readStoredSession()), SESSION_LOOKUP_GRACE_MS);
  }

  client.auth
    .getSession()
    .then(({ data }) => apply(data.session ?? readStoredSession()))
    .catch((error: unknown) => {
      // A failed lookup (e.g. blocked storage) must not leave the app on the loader forever.
      if (import.meta.env.DEV) console.error(error);
      apply(readStoredSession());
    });
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') clearRecovery(); // a recovery session must not outlive the sign-out
    // INITIAL_SESSION carries null when the first refresh failed on the network; the stored session is still good.
    apply(event === 'INITIAL_SESSION' && !session ? readStoredSession() : session);
  });
  return () => {
    if (graceTimer) clearTimeout(graceTimer);
    data.subscription.unsubscribe();
  };
}

export function AuthProvider({ children, client, loadClient = loadSupabase }: AuthProviderProps) {
  const configured = client === undefined ? env.isSupabaseConfigured : client !== null;
  const [state, setState] = useState<AuthState>(() =>
    configured ? { status: 'loading', session: null, user: null } : { status: 'unconfigured', session: null, user: null },
  );

  useEffect(() => {
    if (!configured) return;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const isActive = () => active;
    if (client) {
      unsubscribe = watchSession(client, setState, isActive);
    } else {
      // The app client: stays 'loading' (guards show the loader) until its chunk is in.
      loadClient()
        .then((loaded) => {
          if (active && loaded) unsubscribe = watchSession(loaded, setState, isActive);
        })
        .catch(() => undefined); // a failed chunk load surfaces in the route (RouteError); a retry loads it again
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client, configured, loadClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
