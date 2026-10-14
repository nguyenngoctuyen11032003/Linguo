import { describe, expect, it } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { LIST_ID, personalList, personalWord } from './personal-fixtures';
import {
  createPersonalList,
  deletePersonalList,
  deletePersonalWord,
  fetchPersonalLists,
  fetchPersonalWords,
  getPersonalQueue,
  gradePersonalWord,
  importPersonalWords,
  renamePersonalList,
  updatePersonalWord,
} from './service';

const KEY = 'f0000000-0000-4000-8000-000000000001';

describe('personal vocab service', () => {
  it('lists the lists and treats null as empty', async () => {
    expect(await fetchPersonalLists(fakeClient({}, { list_personal_lists: { data: [personalList()] } }))).toEqual([personalList()]);
    expect(await fetchPersonalLists(fakeClient({}, { list_personal_lists: { data: null } }))).toEqual([]);
  });

  it('creates, renames and deletes a list', async () => {
    const client = fakeClient(
      {},
      {
        create_personal_list: { data: personalList({ word_count: 0, due_count: 0 }) },
        rename_personal_list: { data: { id: LIST_ID, name: 'Mới', language_code: 'ko' } },
        delete_personal_list: { data: { deleted: true } },
      },
    );
    await createPersonalList(client, 'Từ vựng TOPIK', 'ko');
    expect((await renamePersonalList(client, LIST_ID, 'Mới')).name).toBe('Mới');
    await deletePersonalList(client, LIST_ID);
    expect(client.rpcCalls).toEqual([
      ['create_personal_list', { p_name: 'Từ vựng TOPIK', p_language: 'ko' }],
      ['rename_personal_list', { p_list_id: LIST_ID, p_name: 'Mới' }],
      ['delete_personal_list', { p_list_id: LIST_ID }],
    ]);
  });

  it('imports rows', async () => {
    const result = { added: 1, updated: 0, unchanged: 0, duplicates: 0, invalid: [] };
    const client = fakeClient({}, { import_personal_words: { data: result } });
    expect(await importPersonalWords(client, LIST_ID, [{ term: 'a', meaning: 'b' }])).toEqual(result);
    expect(client.rpcCalls).toEqual([['import_personal_words', { p_list_id: LIST_ID, p_rows: [{ term: 'a', meaning: 'b' }] }]]);
  });

  it('reads the words of a list ordered by position', async () => {
    const word = personalWord();
    const q = fakeQuery({ data: [word] });
    expect(await fetchPersonalWords(fakeClient({ personal_words: q }), LIST_ID)).toEqual([word]);
    expect(q.calls.map(([m]) => m)).toEqual(['select', 'eq', 'order', 'order']);
    expect(q.calls[1]).toEqual(['eq', ['list_id', LIST_ID]]);
  });

  it('throws the PostgREST error when the read fails', async () => {
    const error = { message: 'permission denied', code: '42501' };
    await expect(fetchPersonalWords(fakeClient({ personal_words: fakeQuery({ data: null, error }) }), LIST_ID)).rejects.toBe(error);
  });

  it('rejects malformed payloads', async () => {
    await expect(fetchPersonalLists(fakeClient({}, { list_personal_lists: { data: [{ id: 'x' }] } }))).rejects.toThrow('invalid_payload');
  });

  it('edits and deletes a word', async () => {
    const w = personalWord();
    const client = fakeClient(
      {},
      {
        update_personal_word: { data: { id: w.id, term: 'a', meaning: 'b', example: null, note: null, pronunciation: null } },
        delete_personal_word: { data: { deleted: true } },
      },
    );
    await updatePersonalWord(client, w.id, { term: 'a', meaning: 'b', example: null, note: null, pronunciation: null });
    await deletePersonalWord(client, w.id);
    expect(client.rpcCalls[0]).toEqual([
      'update_personal_word',
      { p_word_id: w.id, p_term: 'a', p_meaning: 'b', p_example: null, p_note: null, p_pronunciation: null },
    ]);
    expect(client.rpcCalls[1]).toEqual(['delete_personal_word', { p_word_id: w.id }]);
  });

  it('gets the queue and grades a word', async () => {
    const w = personalWord();
    const client = fakeClient(
      {},
      {
        get_personal_review_queue: { data: { cards: [], totals: { due_total: 0, served: 0, new_available: 0 } } },
        grade_personal_word: { data: { word_id: w.id, state: 'learning', due_at: '2026-10-14T00:10:00Z', interval_minutes: 10, replayed: false } },
      },
    );
    expect((await getPersonalQueue(client, LIST_ID)).cards).toEqual([]);
    expect((await gradePersonalWord(client, { wordId: w.id, rating: 3, idempotencyKey: KEY })).interval_minutes).toBe(10);
    expect(client.rpcCalls).toEqual([
      ['get_personal_review_queue', { p_list_id: LIST_ID, p_limit: 20 }],
      ['grade_personal_word', { p_word_id: w.id, p_rating: 3, p_idempotency_key: KEY }],
    ]);
  });
});
