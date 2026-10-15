import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { LearnerAssignment, LearnerClass, LearnerJoinResult } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { useOnline } from '@/lib/useOnline';
import { classErrorMessage } from './error-map';
import { fetchLearnerAssignments, fetchLearnerClasses, joinClass, leaveClass } from './service';

export interface LearnerClassesApi {
  status: 'loading' | 'ready' | 'error';
  classes: LearnerClass[];
  assignments: LearnerAssignment[];
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** Rejects with the raw RPC error: map it with classErrorMessage. Refreshes the lists after a join. */
  join: (code: string) => Promise<LearnerJoinResult>;
  /** Rejects with the raw RPC error. Drops the class and its assignments locally on success. */
  leave: (classId: string) => Promise<void>;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  classes: LearnerClass[];
  assignments: LearnerAssignment[];
  error: string | null;
}

function requireClient(client: AppSupabaseClient | null): AppSupabaseClient {
  if (!client) throw new Error('supabase_unavailable');
  return client;
}

/** The learner's classes (PRD P2) and the assignments of all of them, loaded together. */
export function useLearnerClasses(): LearnerClassesApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const online = useOnline();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = userId ?? '';
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', classes: [], assignments: [], error: null });

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ key, status: 'error', classes: [], assignments: [], error: classErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    // A reload keeps what is on screen; only a different user starts from scratch.
    setLoaded((prev) =>
      prev.key === key
        ? { ...prev, status: prev.classes.length > 0 ? prev.status : 'loading' }
        : { key, status: 'loading', classes: [], assignments: [], error: null },
    );
    Promise.all([fetchLearnerClasses(client), fetchLearnerAssignments(client)])
      .then(([classes, assignments]) => {
        if (active) setLoaded({ key, status: 'ready', classes, assignments, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoaded((prev) => ({
          key,
          status: 'error',
          classes: prev.key === key ? prev.classes : [],
          assignments: prev.key === key ? prev.assignments : [],
          error: classErrorMessage(error),
        }));
      });
    return () => {
      active = false;
    };
  }, [client, userId, key, attempt]);

  // Back online after a failed load: try again without asking.
  const wasOnline = useRef(online);
  const failed = loaded.status === 'error';
  useEffect(() => {
    if (online && !wasOnline.current && failed) reload();
    wasOnline.current = online;
  }, [online, failed]);

  const join = useCallback(
    async (code: string) => {
      const result = await joinClass(requireClient(client), code);
      if (result.status !== 'invalid_code') {
        const joined = result.class;
        // Show the class at once; the reload then brings its assignments.
        setLoaded((prev) =>
          prev.classes.some((c) => c.id === joined.id) ? prev : { ...prev, status: 'ready', error: null, classes: [...prev.classes, joined] },
        );
        reload();
      }
      return result;
    },
    [client],
  );

  const leave = useCallback(
    async (classId: string) => {
      await leaveClass(requireClient(client), classId);
      setLoaded((prev) => ({
        ...prev,
        classes: prev.classes.filter((c) => c.id !== classId),
        assignments: prev.assignments.filter((a) => a.class_id !== classId),
      }));
    },
    [client],
  );

  const current = loaded.key === key ? loaded : { status: 'loading' as const, classes: [], assignments: [], error: null };
  return {
    status: current.status,
    classes: current.classes,
    assignments: current.assignments,
    error: current.error,
    reload,
    join,
    leave,
  };
}
