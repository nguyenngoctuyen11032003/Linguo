import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import type { StaffRole } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { getStaffRole } from './service';

export interface StaffRoleState {
  /** 'ready' with role null for signed-out users and learners. */
  status: 'loading' | 'ready' | 'error';
  role: StaffRole | null;
  /** Raw error when status is 'error'. */
  error: unknown;
  reload: () => void;
}

interface Loaded {
  user: string;
  status: 'loading' | 'ready' | 'error';
  role: StaffRole | null;
  error: unknown;
}

/** staff_role() of the signed-in user (spec 11 §3). Never cached across users. */
export function useStaffRole(enabled = true): StaffRoleState {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded>({ user: userId, status: 'loading', role: null, error: null });

  useEffect(() => {
    if (!enabled || !userId) return;
    if (!client) {
      setLoaded({ user: userId, status: 'ready', role: null, error: null });
      return;
    }
    let active = true;
    setLoaded({ user: userId, status: 'loading', role: null, error: null });
    getStaffRole(client)
      .then((role) => {
        if (active) setLoaded({ user: userId, status: 'ready', role, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ user: userId, status: 'error', role: null, error });
      });
    return () => {
      active = false;
    };
  }, [enabled, client, userId, attempt]);

  if (auth.status === 'loading') return { status: 'loading', role: null, error: null, reload };
  if (auth.status !== 'signed-in' || !userId) return { status: 'ready', role: null, error: null, reload };
  if (loaded.user !== userId) return { status: 'loading', role: null, error: null, reload };
  return { status: loaded.status, role: loaded.role, error: loaded.error, reload };
}

/** The verified staff role, provided by AdminGuard to everything inside the admin area. */
export const StaffRoleContext = createContext<StaffRole | null>(null);

/** Role of the staff member inside the admin area (null outside AdminGuard). */
export function useAdminRole(): StaffRole | null {
  return useContext(StaffRoleContext);
}
