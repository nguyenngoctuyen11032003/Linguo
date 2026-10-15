import { useEffect, useReducer, useState } from 'react';
import type { ClassLanguage } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { teacherErrorMessage } from './error-map';
import { levelLabel } from './format';
import { fetchTeacherCatalog, type TeacherCatalog } from './service';

export interface TeacherCatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  catalog: TeacherCatalog | null;
  error: string | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  catalog: TeacherCatalog | null;
  error: string | null;
}

/** Published lessons and exam forms of a class language, fetched only while `enabled` (the assignment form is open). */
export function useTeacherCatalog(language: ClassLanguage, enabled: boolean): TeacherCatalogState {
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!client) {
      setLoaded({ key: language, status: 'error', catalog: null, error: teacherErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev?.key === language && prev.status === 'ready' ? prev : { key: language, status: 'loading', catalog: null, error: null }));
    fetchTeacherCatalog(client, language, levelLabel)
      .then((catalog) => {
        if (active) setLoaded({ key: language, status: 'ready', catalog, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key: language, status: 'error', catalog: null, error: teacherErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, language, enabled, attempt]);

  if (!enabled) return { status: 'idle', catalog: null, error: null, reload };
  if (!loaded || loaded.key !== language) return { status: 'loading', catalog: null, error: null, reload };
  return { status: loaded.status, catalog: loaded.catalog, error: loaded.error, reload };
}
