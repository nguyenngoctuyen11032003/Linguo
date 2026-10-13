import { useEffect, useReducer, useState } from 'react';
import type { ExamFormSummary, LanguageCode } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { examErrorMessage } from './error-map';
import { listExamForms } from './service';

export interface ExamFormsState {
  /** 'idle' while there is no language (no current path yet). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  forms: ExamFormSummary[];
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  forms: ExamFormSummary[];
  error: string | null;
}

/** Published exam forms of a language, with the caller's latest attempt on each. */
export function useExamForms(language: LanguageCode | null): ExamFormsState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${language ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', forms: [], error: null });

  useEffect(() => {
    if (!userId || !language) return;
    if (!client) {
      setLoaded({ key, status: 'error', forms: [], error: examErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.key === key ? prev : { key, status: 'loading', forms: [], error: null }));
    listExamForms(client, language)
      .then((forms) => {
        if (active) setLoaded({ key, status: 'ready', forms, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: 'error', forms: [], error: examErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, language, key, attempt]);

  if (!language) return { status: 'idle', forms: [], error: null, reload };
  const current = loaded.key === key ? loaded : { status: 'loading' as const, forms: [], error: null };
  return { status: current.status, forms: current.forms, error: current.error, reload };
}
