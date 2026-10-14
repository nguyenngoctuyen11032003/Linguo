import { useCallback, useEffect, useReducer, useState } from 'react';
import type { PersonalLanguage, PersonalList } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { personalVocabErrorMessage } from './error-map';
import { createPersonalList, deletePersonalList, fetchPersonalLists, renamePersonalList } from './service';

export interface PersonalListsApi {
  status: 'loading' | 'ready' | 'error';
  lists: PersonalList[];
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** Mutations reject with the raw RPC error: map it with personalVocabErrorMessage. */
  create: (name: string, language: PersonalLanguage) => Promise<PersonalList>;
  rename: (listId: string, name: string) => Promise<void>;
  remove: (listId: string) => Promise<void>;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  lists: PersonalList[];
  error: string | null;
}

function requireClient(client: AppSupabaseClient | null): AppSupabaseClient {
  if (!client) throw new Error('supabase_unavailable');
  return client;
}

/** The learner's personal word lists (spec P2) with their word and due counts. */
export function usePersonalLists(): PersonalListsApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = userId ?? '';
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', lists: [], error: null });

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ key, status: 'error', lists: [], error: personalVocabErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    // A reload keeps the lists on screen; only a different user starts from scratch.
    setLoaded((prev) => (prev.key === key ? { ...prev, status: prev.lists.length > 0 ? prev.status : 'loading' } : { key, status: 'loading', lists: [], error: null }));
    fetchPersonalLists(client)
      .then((lists) => {
        if (active) setLoaded({ key, status: 'ready', lists, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded((prev) => ({ key, status: 'error', lists: prev.key === key ? prev.lists : [], error: personalVocabErrorMessage(error) }));
      });
    return () => {
      active = false;
    };
  }, [client, userId, key, attempt]);

  const create = useCallback(
    async (name: string, language: PersonalLanguage) => {
      const created = await createPersonalList(requireClient(client), name, language);
      setLoaded((prev) => ({ ...prev, status: 'ready', error: null, lists: [...prev.lists, created] }));
      return created;
    },
    [client],
  );

  const rename = useCallback(
    async (listId: string, name: string) => {
      const renamed = await renamePersonalList(requireClient(client), listId, name);
      setLoaded((prev) => ({ ...prev, lists: prev.lists.map((l) => (l.id === listId ? { ...l, name: renamed.name } : l)) }));
    },
    [client],
  );

  const remove = useCallback(
    async (listId: string) => {
      await deletePersonalList(requireClient(client), listId);
      setLoaded((prev) => ({ ...prev, lists: prev.lists.filter((l) => l.id !== listId) }));
    },
    [client],
  );

  const current = loaded.key === key ? loaded : { status: 'loading' as const, lists: [], error: null };
  return { status: current.status, lists: current.lists, error: current.error, reload, create, rename, remove };
}
