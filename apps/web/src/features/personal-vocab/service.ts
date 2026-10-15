import {
  PERSONAL_WORD_COLUMNS,
  personalDeletedSchema,
  personalGradeResultSchema,
  personalImportResultSchema,
  personalListRenamedSchema,
  personalListSchema,
  personalListsSchema,
  personalQueueSchema,
  personalWordEditedSchema,
  personalWordSchema,
  type PersonalGradeResult,
  type PersonalImportResult,
  type PersonalLanguage,
  type PersonalList,
  type PersonalQueue,
  type PersonalWord,
  type PersonalWordRow,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Personal vocabulary (spec P2). Same transport as the other RPC services: jsonb validated with the shared zod
// contracts, abandoned after 15 s. Words are read straight from personal_words (RLS: owner only).

/** Default batch for a personal review session. */
export const PERSONAL_QUEUE_LIMIT = 20;

export async function fetchPersonalLists(client: AppSupabaseClient): Promise<PersonalList[]> {
  return parse(personalListsSchema, (await callRpc(client, 'list_personal_lists', {})) ?? []);
}

export async function createPersonalList(client: AppSupabaseClient, name: string, language: PersonalLanguage): Promise<PersonalList> {
  return parse(personalListSchema, await callRpc(client, 'create_personal_list', { p_name: name, p_language: language }));
}

export async function renamePersonalList(client: AppSupabaseClient, listId: string, name: string) {
  return parse(personalListRenamedSchema, await callRpc(client, 'rename_personal_list', { p_list_id: listId, p_name: name }));
}

export async function deletePersonalList(client: AppSupabaseClient, listId: string): Promise<void> {
  parse(personalDeletedSchema, await callRpc(client, 'delete_personal_list', { p_list_id: listId }));
}

export async function importPersonalWords(
  client: AppSupabaseClient,
  listId: string,
  rows: readonly PersonalWordRow[],
): Promise<PersonalImportResult> {
  const data = await callRpc(client, 'import_personal_words', { p_list_id: listId, p_rows: rows });
  // Validation failures come back as {ok: false, code} so that the server keeps counting the attempt (a raise would
  // roll the rate-limit log back); they surface as the same error code the RPC used to raise.
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false && 'code' in data && typeof data.code === 'string') {
    throw new Error(data.code);
  }
  return parse(personalImportResultSchema, data);
}

export async function fetchPersonalWords(client: AppSupabaseClient, listId: string): Promise<PersonalWord[]> {
  const { data, error } = await client
    .from('personal_words')
    .select(PERSONAL_WORD_COLUMNS)
    .eq('list_id', listId)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return parse(personalWordSchema.array(), data ?? []);
}

export interface PersonalWordFields {
  term: string;
  meaning: string;
  example: string | null;
  note: string | null;
  pronunciation: string | null;
}

export async function updatePersonalWord(client: AppSupabaseClient, wordId: string, fields: PersonalWordFields) {
  return parse(
    personalWordEditedSchema,
    await callRpc(client, 'update_personal_word', {
      p_word_id: wordId,
      p_term: fields.term,
      p_meaning: fields.meaning,
      p_example: fields.example,
      p_note: fields.note,
      p_pronunciation: fields.pronunciation,
    }),
  );
}

export async function deletePersonalWord(client: AppSupabaseClient, wordId: string): Promise<void> {
  parse(personalDeletedSchema, await callRpc(client, 'delete_personal_word', { p_word_id: wordId }));
}

export async function getPersonalQueue(client: AppSupabaseClient, listId: string, limit = PERSONAL_QUEUE_LIMIT): Promise<PersonalQueue> {
  return parse(personalQueueSchema, await callRpc(client, 'get_personal_review_queue', { p_list_id: listId, p_limit: limit }));
}

export async function gradePersonalWord(
  client: AppSupabaseClient,
  args: { wordId: string; rating: 1 | 2 | 3 | 4; idempotencyKey: string },
): Promise<PersonalGradeResult> {
  return parse(
    personalGradeResultSchema,
    await callRpc(client, 'grade_personal_word', { p_word_id: args.wordId, p_rating: args.rating, p_idempotency_key: args.idempotencyKey }),
  );
}
