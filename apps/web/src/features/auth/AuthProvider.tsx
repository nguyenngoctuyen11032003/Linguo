import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';

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
  /** Injected in tests; defaults to the app client (null when unconfigured). */
  client?: AppSupabaseClient | null;
}

export function AuthProvider({ children, client = getSupabase() }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(() =>
    client ? { status: 'loading', session: null, user: null } : { status: 'unconfigured', session: null, user: null },
  );

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (active) setState(fromSession(data.session));
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setState(fromSession(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
