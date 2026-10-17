import { useCallback, useEffect } from 'react';
import { personalListsSchema, type PersonalLanguage, type PersonalList } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { useReadThrough } from '@/lib/useReadThrough';
import { personalVocabErrorMessage, requireOnline } from './error-map';
import { prefetchPersonalQueues } from './queueCache';
import { createPersonalList, deletePersonalList, fetchPersonalLists, renamePersonalList } from './service';

export interface PersonalListsApi {
  status: 'loading' | 'ready' | 'error';
  lists: PersonalList[];
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** Mutations reject with the raw RPC error: map it with personalVocabErrorMessage. Offline they reject with `offline_required`. */
  create: (name: string, language: PersonalLanguage) => Promise<PersonalList>;
  rename: (listId: string, name: string) => Promise<void>;
  remove: (listId: string) => Promise<void>;
  /** The lists are the copy saved on this device and the server could not confirm them (offline). */
  stale?: boolean;
  /** Epoch ms of the copy on screen (for "Cập nhật lúc HH:mm"). */
  updatedAt?: number | null;
}

function requireClient(client: AppSupabaseClient | null): AppSupabaseClient {
  if (!client) throw new Error('supabase_unavailable');
  return client;
}

/**
 * The learner's personal word lists (spec P2) with their word and due counts. The last copy is saved on the device
 * and shown when the server cannot be reached; creating, renaming and deleting need the network. Once the lists load
 * online, the due words of the busiest lists are saved too so a personal review can run offline.
 */
export function usePersonalLists(): PersonalListsApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const read = useReadThrough<PersonalList[]>({
    enabled: true,
    userId,
    scope: userId ?? '',
    request: 'lists',
    cacheName: 'personal-lists',
    schema: personalListsSchema,
    fetcher: () => fetchPersonalLists(requireClient(client)),
  });
  const { update } = read;

  const fresh = read.status === 'ready' && !read.stale ? read.data : null;
  useEffect(() => {
    if (userId && client && fresh) void prefetchPersonalQueues(client, userId, fresh);
  }, [client, userId, fresh]);

  const create = useCallback(
    async (name: string, language: PersonalLanguage) => {
      requireOnline();
      const created = await createPersonalList(requireClient(client), name, language);
      update((lists) => [...lists, created]);
      return created;
    },
    [client, update],
  );

  const rename = useCallback(
    async (listId: string, name: string) => {
      requireOnline();
      const renamed = await renamePersonalList(requireClient(client), listId, name);
      update((lists) => lists.map((l) => (l.id === listId ? { ...l, name: renamed.name } : l)));
    },
    [client, update],
  );

  const remove = useCallback(
    async (listId: string) => {
      requireOnline();
      await deletePersonalList(requireClient(client), listId);
      update((lists) => lists.filter((l) => l.id !== listId));
    },
    [client, update],
  );

  return {
    status: read.status,
    lists: read.data ?? NO_LISTS,
    error: read.status === 'error' ? personalVocabErrorMessage(read.error) : null,
    reload: read.reload,
    create,
    rename,
    remove,
    stale: read.stale,
    updatedAt: read.updatedAt,
  };
}

const NO_LISTS: PersonalList[] = [];
