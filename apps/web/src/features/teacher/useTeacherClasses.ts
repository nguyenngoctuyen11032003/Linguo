import { useCallback, useEffect, useReducer, useState } from 'react';
import type { ClassLanguage, TeacherClass } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { teacherErrorMessage } from './error-map';
import { archiveTeacherClass, createTeacherClass, fetchTeacherClasses, renameTeacherClass } from './service';

export interface TeacherClassesApi {
  status: 'loading' | 'ready' | 'error';
  classes: TeacherClass[];
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** Mutations reject with the raw RPC error: map it with teacherErrorMessage. */
  create: (name: string, language: ClassLanguage) => Promise<TeacherClass>;
  rename: (classId: string, name: string) => Promise<TeacherClass>;
  setArchived: (classId: string, archived: boolean) => Promise<TeacherClass>;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  classes: TeacherClass[];
  error: string | null;
}

export function requireClient(client: AppSupabaseClient | null): AppSupabaseClient {
  if (!client) throw new Error('supabase_unavailable');
  return client;
}

/** Active first, then archived; newest first inside each group (same order as teacher_list_classes). */
export function sortClasses(classes: TeacherClass[]): TeacherClass[] {
  return [...classes].sort(
    (a, b) => Number(a.archived_at !== null) - Number(b.archived_at !== null) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
  );
}

/** The teacher's classes with member, assignment and active invite counts. */
export function useTeacherClasses(): TeacherClassesApi {
  const { user } = useAuth();
  const key = user?.id ?? '';
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', classes: [], error: null });

  useEffect(() => {
    if (!key) return;
    if (!client) {
      setLoaded({ key, status: 'error', classes: [], error: teacherErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.key === key ? { ...prev, status: prev.classes.length > 0 ? prev.status : 'loading' } : { key, status: 'loading', classes: [], error: null }));
    fetchTeacherClasses(client)
      .then((classes) => {
        if (active) setLoaded({ key, status: 'ready', classes, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded((prev) => ({ key, status: 'error', classes: prev.key === key ? prev.classes : [], error: teacherErrorMessage(error) }));
      });
    return () => {
      active = false;
    };
  }, [client, key, attempt]);

  const replace = useCallback((updated: TeacherClass) => {
    setLoaded((prev) => ({ ...prev, classes: sortClasses(prev.classes.map((c) => (c.id === updated.id ? updated : c))) }));
  }, []);

  const create = useCallback(
    async (name: string, language: ClassLanguage) => {
      const created = await createTeacherClass(requireClient(client), name, language);
      setLoaded((prev) => ({ ...prev, status: 'ready', error: null, classes: sortClasses([created, ...prev.classes]) }));
      return created;
    },
    [client],
  );

  const rename = useCallback(
    async (classId: string, name: string) => {
      const updated = await renameTeacherClass(requireClient(client), classId, name);
      replace(updated);
      return updated;
    },
    [client, replace],
  );

  const setArchived = useCallback(
    async (classId: string, archived: boolean) => {
      const updated = await archiveTeacherClass(requireClient(client), classId, archived);
      replace(updated);
      return updated;
    },
    [client, replace],
  );

  const current = loaded.key === key ? loaded : { status: 'loading' as const, classes: [], error: null };
  return { status: current.status, classes: current.classes, error: current.error, reload, create, rename, setArchived };
}
