// Personal vocabulary (spec P2). These limits are enforced by the SQL in
// supabase/migrations/20261016000300_personal_vocab.sql; keep both in sync
// (supabase/tests/personal_vocab.test.sql exercises the SQL side).

export const PERSONAL_VOCAB_LIMITS = {
  /** Lists per learner. */
  maxLists: 20,
  /** Words per list. */
  maxWordsPerList: 1000,
  /** Words per learner across all lists. */
  maxWordsPerUser: 5000,
  /** Rows accepted by one import call. */
  maxRowsPerImport: 1000,
  /** Imports per learner per rolling hour. */
  maxImportsPerHour: 10,
  /** A CSV above this size is refused before it is read or parsed (1 MB). */
  maxCsvBytes: 1_048_576,
  /** Longest line scanned by the CSV parser; keeps one pathological record from dominating. */
  maxRecordChars: 5_000,
  /** Field lengths, in characters after cleaning. */
  listName: 60,
  term: 120,
  meaning: 300,
  example: 300,
  note: 300,
  pronunciation: 100,
} as const;

export type PersonalVocabLimits = typeof PERSONAL_VOCAB_LIMITS;
