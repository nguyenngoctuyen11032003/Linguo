import { useCallback, useEffect, useReducer, useState } from 'react';
import type { PersonalImportResult, PersonalWord, PersonalWordRow } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { personalVocabErrorMessage } from './error-map';
import { deletePersonalWord, fetchPersonalWords, importPersonalWords, updatePersonalWord, type PersonalWordFields } from './service';

export interface PersonalWordsApi {
  status: 'loading' | 'ready' | 'error';
  words: PersonalWord[];
  error: string | null;
  reload: () => void;
  /** Rejects with the raw RPC error: map it with personalVocabErrorMessage. */
  importRows: (rows: readonly PersonalWordRow[]) => Promise<PersonalImportResult>;
  update: (wordId: string, fields: PersonalWordFields) => Promise<void>;
  remove: (wordId: string) => Promise<void>;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  words: PersonalWord[];
  error: string | null;
}

/** The words of one personal list, with import, edit and delete. */
export function usePersonalWords(listId: string | null): PersonalWordsApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${listId ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', words: [], error: null });

  useEffect(() => {
    if (!userId || !listId) return;
    if (!client) {
      setLoaded({ key, status: 'error', words: [], error: personalVocabErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.key === key ? prev : { key, status: 'loading', words: [], error: null }));
    fetchPersonalWords(client, listId)
      .then((words) => {
        if (active) setLoaded({ key, status: 'ready', words, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded((prev) => ({ key, status: 'error', words: prev.key === key ? prev.words : [], error: personalVocabErrorMessage(error) }));
      });
    return () => {
      active = false;
    };
  }, [client, userId, listId, key, attempt]);

  const importRows = useCallback(
    async (rows: readonly PersonalWordRow[]) => {
      if (!client || !listId) throw new Error('supabase_unavailable');
      const result = await importPersonalWords(client, listId, rows);
      reload();
      return result;
    },
    [client, listId],
  );

  const update = useCallback(
    async (wordId: string, fields: PersonalWordFields) => {
      if (!client) throw new Error('supabase_unavailable');
      const edited = await updatePersonalWord(client, wordId, fields);
      setLoaded((prev) => ({ ...prev, words: prev.words.map((w) => (w.id === wordId ? { ...w, ...edited } : w)) }));
    },
    [client],
  );

  const remove = useCallback(
    async (wordId: string) => {
      if (!client) throw new Error('supabase_unavailable');
      await deletePersonalWord(client, wordId);
      setLoaded((prev) => ({ ...prev, words: prev.words.filter((w) => w.id !== wordId) }));
    },
    [client],
  );

  const current = loaded.key === key ? loaded : { status: 'loading' as const, words: [], error: null };
  return { status: current.status, words: current.words, error: current.error, reload, importRows, update, remove };
}
