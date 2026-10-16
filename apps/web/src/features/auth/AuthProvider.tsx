import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { clearRecovery } from './recovery';
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

function watchSession(client: AppSupabaseClient, setState: (state: AuthState) => void, isActive: () => boolean): () => void {
  client.auth
    .getSession()
    .then(({ data }) => {
      if (isActive()) setState(fromSession(data.session));
    })
    .catch((error: unknown) => {
      // A failed lookup (e.g. blocked storage) must not leave the app on the loader forever.
      if (import.meta.env.DEV) console.error(error);
      if (isActive()) setState(fromSession(null));
    });
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') clearRecovery(); // a recovery session must not outlive the sign-out
    if (isActive()) setState(fromSession(session));
  });
  return () => data.subscription.unsubscribe();
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
