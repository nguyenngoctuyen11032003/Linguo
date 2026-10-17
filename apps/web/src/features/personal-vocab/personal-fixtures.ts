import type { PersonalList, PersonalWord, ReviewCard } from '@linguo/shared';

// Test fixtures for the personal vocabulary feature: plain rows plus a small stateful stand-in for the Supabase
// client (RPCs and the personal_words table) so hooks and pages can be tested without a network.

export const LIST_ID = '9e000000-0000-4000-8000-000000000001';
export const LIST_ID_2 = '9e000000-0000-4000-8000-000000000002';

export function personalList(overrides: Partial<PersonalList> = {}): PersonalList {
  return {
    id: LIST_ID,
    name: 'Từ vựng TOPIK',
    language_code: 'ko',
    word_count: 2,
    due_count: 2,
    created_at: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

let seq = 0;
export function personalWord(overrides: Partial<PersonalWord> = {}): PersonalWord {
  seq += 1;
  const n = String(seq).padStart(12, '0');
  return {
    id: `9e100000-0000-4000-8000-${n}`,
    list_id: LIST_ID,
    position: seq,
    term: `từ${seq}`,
    meaning: `nghĩa ${seq}`,
    example: null,
    note: null,
    pronunciation: null,
    fsrs_state: 'new',
    reps: 0,
    due_at: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

const preview = (interval_minutes: number) => ({ interval_minutes, due_at: '2026-10-14T00:00:00Z' });

export function personalCard(word: PersonalWord, language: 'en' | 'ko' | 'ja' | 'de' = 'ko'): ReviewCard {
  return {
    card_id: word.id,
    item_id: word.id,
    direction: 'recognize',
    state: word.fsrs_state,
    is_new: word.fsrs_state === 'new',
    due_at: word.due_at,
    postpone_count: 0,
    item: {
      language_code: language,
      item_type: 'vocab',
      front: { text: word.term },
      back: { meaning: { vi: word.meaning }, examples: [] },
      audio_path: null,
    },
    previews: { again: preview(1), hard: preview(6), good: preview(10), easy: preview(4 * 1440) },
  };
}

export interface FakeRpcResponse {
  data?: unknown;
  error?: unknown;
}

/**
 * A client whose `rpc` is answered by `handler` (name, args) and whose `from('personal_words')` returns `words`.
 * `calls` records every RPC.
 */
export function fakeVocabClient(handler: (name: string, args: Record<string, unknown>) => FakeRpcResponse, words: PersonalWord[] = []) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: words, error: null }).then(resolve, reject);
  const client = {
    calls,
    from: () => builder,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const { data = null, error = null } = handler(name, args);
      return Promise.resolve({ data, error });
    },
  };
  return client;
}
