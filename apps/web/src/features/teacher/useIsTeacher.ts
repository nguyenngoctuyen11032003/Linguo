import { useEffect, useReducer, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { fetchIsTeacher } from './service';

export interface IsTeacherState {
  /** 'ready' with isTeacher false for signed-out users and learners. */
  status: 'loading' | 'ready' | 'error';
  isTeacher: boolean;
  error: unknown;
  reload: () => void;
}

// One is_teacher() call per user per page load, shared by the nav entries and the /giao-vien guard.
const cache = new Map<string, Promise<boolean>>();

function lookup(userId: string, force: boolean): Promise<boolean> {
  const client = getSupabase();
  if (!client) return Promise.resolve(false);
  let pending = force ? undefined : cache.get(userId);
  if (!pending) {
    pending = fetchIsTeacher(client);
    cache.set(userId, pending);
    // A failure is not remembered: the next caller asks again.
    pending.catch(() => {
      if (cache.get(userId) === pending) cache.delete(userId);
    });
  }
  return pending;
}

/** Tests only. */
export function resetIsTeacherCache() {
  cache.clear();
}

interface Loaded {
  user: string;
  status: 'loading' | 'ready' | 'error';
  isTeacher: boolean;
  error: unknown;
}

/** Whether the signed-in user has a teacher profile (is_teacher()). */
export function useIsTeacher(): IsTeacherState {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded>({ user: userId, status: 'loading', isTeacher: false, error: null });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoaded((prev) => (prev.user === userId && prev.status === 'ready' ? prev : { user: userId, status: 'loading', isTeacher: false, error: null }));
    lookup(userId, attempt > 0)
      .then((isTeacher) => {
        if (active) setLoaded({ user: userId, status: 'ready', isTeacher, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ user: userId, status: 'error', isTeacher: false, error });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  if (auth.status === 'loading') return { status: 'loading', isTeacher: false, error: null, reload };
  if (auth.status !== 'signed-in' || !userId) return { status: 'ready', isTeacher: false, error: null, reload };
  if (loaded.user !== userId) return { status: 'loading', isTeacher: false, error: null, reload };
  return { status: loaded.status, isTeacher: loaded.isTeacher, error: loaded.error, reload };
}
