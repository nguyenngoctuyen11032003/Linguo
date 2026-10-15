import { z } from 'zod';
import { FSRS_STATES, reviewCardSchema } from '../review/rpc';
import { PERSONAL_VOCAB_LIMITS as L } from './limits';

// Personal vocabulary RPCs (spec P2): JSON exchanged with list_personal_lists, create/rename/delete_personal_list,
// import_personal_words, update/delete_personal_word, get_personal_review_queue and grade_personal_word.
// snake_case mirrors the SQL jsonb exactly.

export const PERSONAL_LANGUAGES = ['en', 'ko'] as const;
export type PersonalLanguage = (typeof PERSONAL_LANGUAGES)[number];

/** Mirrors the Vietnamese error map in apps/web/src/features/personal-vocab/error-map.ts. */
export const PERSONAL_VOCAB_ERROR_CODES = [
  'not_authenticated',
  'list_not_found',
  'word_not_found',
  'invalid_name',
  'invalid_language',
  'name_taken',
  'list_limit',
  'list_full',
  'vocab_full',
  'invalid_rows',
  'too_many_rows',
  'rate_limited',
  'invalid_term',
  'invalid_meaning',
  'field_too_long',
  'duplicate_term',
  'invalid_rating',
  'idempotency_conflict',
  'word_not_due',
] as const;
export type PersonalVocabErrorCode = (typeof PERSONAL_VOCAB_ERROR_CODES)[number];

// Same cleaning as public.personal_clean in SQL: NFC, bidi/zero-width characters dropped, control characters and
// whitespace runs collapsed to one space, trimmed. Formula prefixes (= + - @) are plain text and stay untouched.
const INVISIBLE = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const SPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]+/g;

/** Cleaned text, or null when nothing is left. */
export function cleanPersonalText(value: string): string | null {
  const cleaned = value.normalize('NFC').replace(INVISIBLE, '').replace(SPACE_OR_CONTROL, ' ').trim();
  return cleaned === '' ? null : cleaned;
}

/** Identity of a word inside a list (matches personal_term_key in SQL): the cleaned term, lower-cased. */
export function personalTermKey(term: string): string | null {
  const cleaned = cleanPersonalText(term);
  return cleaned === null ? null : cleaned.toLowerCase();
}

/** One word as sent to import_personal_words (already cleaned by the CSV parser; the server cleans again). */
export const personalWordRowSchema = z.object({
  term: z.string().min(1).max(L.term),
  meaning: z.string().min(1).max(L.meaning),
  example: z.string().min(1).max(L.example).optional(),
  note: z.string().min(1).max(L.note).optional(),
  pronunciation: z.string().min(1).max(L.pronunciation).optional(),
});
export type PersonalWordRow = z.infer<typeof personalWordRowSchema>;

export const personalListNameSchema = z
  .string()
  .transform((value) => cleanPersonalText(value) ?? '')
  .pipe(z.string().min(1).max(L.listName));

export const personalListSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  language_code: z.enum(PERSONAL_LANGUAGES),
  word_count: z.number().int().min(0),
  due_count: z.number().int().min(0),
  created_at: z.string(),
});
export type PersonalList = z.infer<typeof personalListSchema>;

export const personalListsSchema = z.array(personalListSchema);

export const personalListRenamedSchema = z.object({ id: z.uuid(), name: z.string(), language_code: z.enum(PERSONAL_LANGUAGES) });

/** A row of public.personal_words as the learner reads it (replay columns are not readable). */
export const personalWordSchema = z.object({
  id: z.uuid(),
  list_id: z.uuid(),
  position: z.number().int(),
  term: z.string(),
  meaning: z.string(),
  example: z.string().nullable(),
  note: z.string().nullable(),
  pronunciation: z.string().nullable(),
  fsrs_state: z.enum(FSRS_STATES),
  reps: z.number().int(),
  due_at: z.string(),
});
export type PersonalWord = z.infer<typeof personalWordSchema>;

/** Columns selected for personalWordSchema. */
export const PERSONAL_WORD_COLUMNS = 'id, list_id, position, term, meaning, example, note, pronunciation, fsrs_state, reps, due_at';

export const personalImportResultSchema = z.object({
  added: z.number().int().min(0),
  updated: z.number().int().min(0),
  unchanged: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  invalid: z.array(z.object({ index: z.number().int().min(0), reason: z.string() })),
});
export type PersonalImportResult = z.infer<typeof personalImportResultSchema>;

export const personalWordEditedSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  meaning: z.string(),
  example: z.string().nullable(),
  note: z.string().nullable(),
  pronunciation: z.string().nullable(),
});

export const personalDeletedSchema = z.object({ deleted: z.literal(true) });

export const personalQueueSchema = z.object({
  /** Same card shape as get_review_queue, so the flashcard components are reused. */
  cards: z.array(reviewCardSchema),
  totals: z.object({ due_total: z.number().int(), served: z.number().int(), new_available: z.number().int() }),
});
export type PersonalQueue = z.infer<typeof personalQueueSchema>;

export const personalGradeResultSchema = z.object({
  word_id: z.uuid(),
  state: z.enum(FSRS_STATES),
  due_at: z.string(),
  interval_minutes: z.number().int(),
  replayed: z.boolean(),
});
export type PersonalGradeResult = z.infer<typeof personalGradeResultSchema>;
