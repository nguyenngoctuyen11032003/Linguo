import { useCallback } from 'react';
import { personalWordSchema, type PersonalImportResult, type PersonalWord, type PersonalWordRow } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { useReadThrough } from '@/lib/useReadThrough';
import { personalVocabErrorMessage, requireOnline } from './error-map';
import { deletePersonalWord, fetchPersonalWords, importPersonalWords, updatePersonalWord, type PersonalWordFields } from './service';

export interface PersonalWordsApi {
  status: 'loading' | 'ready' | 'error';
  words: PersonalWord[];
  error: string | null;
  reload: () => void;
  /** Reject with the raw RPC error: map it with personalVocabErrorMessage. Offline they reject with `offline_required`. */
  importRows: (rows: readonly PersonalWordRow[]) => Promise<PersonalImportResult>;
  update: (wordId: string, fields: PersonalWordFields) => Promise<void>;
  remove: (wordId: string) => Promise<void>;
  /** The words are the copy saved on this device and the server could not confirm them (offline). */
  stale?: boolean;
  /** Epoch ms of the copy on screen (for "Cập nhật lúc HH:mm"). */
  updatedAt?: number | null;
}

const wordsSchema = personalWordSchema.array();
const NO_WORDS: PersonalWord[] = [];

/** The words of one personal list, with import, edit and delete (online only). The last copy is saved on the device. */
export function usePersonalWords(listId: string | null): PersonalWordsApi {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const read = useReadThrough<PersonalWord[]>({
    enabled: !!listId,
    userId,
    scope: `${userId ?? ''}:${listId ?? ''}`,
    request: listId ?? '',
    cacheName: listId ? `personal-words:${listId}` : null,
    schema: wordsSchema,
    fetcher: () => {
      if (!client) return Promise.reject(new Error('supabase_unavailable'));
      return fetchPersonalWords(client, listId!);
    },
  });
  const { reload, update: patch } = read;

  const importRows = useCallback(
    async (rows: readonly PersonalWordRow[]) => {
      requireOnline();
      if (!client || !listId) throw new Error('supabase_unavailable');
      const result = await importPersonalWords(client, listId, rows);
      reload();
      return result;
    },
    [client, listId, reload],
  );

  const update = useCallback(
    async (wordId: string, fields: PersonalWordFields) => {
      requireOnline();
      if (!client) throw new Error('supabase_unavailable');
      const edited = await updatePersonalWord(client, wordId, fields);
      patch((words) => words.map((w) => (w.id === wordId ? { ...w, ...edited } : w)));
    },
    [client, patch],
  );

  const remove = useCallback(
    async (wordId: string) => {
      requireOnline();
      if (!client) throw new Error('supabase_unavailable');
      await deletePersonalWord(client, wordId);
      patch((words) => words.filter((w) => w.id !== wordId));
    },
    [client, patch],
  );

  return {
    status: read.status,
    words: read.data ?? NO_WORDS,
    error: read.status === 'error' ? personalVocabErrorMessage(read.error) : null,
    reload,
    importRows,
    update,
    remove,
    stale: read.stale,
    updatedAt: read.updatedAt,
  };
}
