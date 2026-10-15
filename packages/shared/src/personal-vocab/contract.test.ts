import { describe, expect, it } from 'vitest';
import {
  cleanPersonalText,
  personalGradeResultSchema,
  personalImportResultSchema,
  personalListNameSchema,
  personalListSchema,
  personalQueueSchema,
  personalTermKey,
  personalWordRowSchema,
  PERSONAL_VOCAB_ERROR_CODES,
} from './contract';
import { PERSONAL_VOCAB_LIMITS as L } from './limits';

const UUID = '6f1c2b8e-1d3a-4b4c-8d9e-0f1a2b3c4d5e';

describe('limits', () => {
  it('match the spec of the design note', () => {
    expect(L).toMatchObject({
      maxLists: 20,
      maxWordsPerList: 1000,
      maxWordsPerUser: 5000,
      maxRowsPerImport: 1000,
      maxImportsPerHour: 10,
      maxCsvBytes: 1024 * 1024,
    });
    expect(L.maxWordsPerList * L.maxLists).toBeGreaterThan(L.maxWordsPerUser);
  });
});

describe('cleanPersonalText / personalTermKey', () => {
  it('trims, collapses whitespace, strips invisible characters and normalises to NFC', () => {
    expect(cleanPersonalText('  a \t b\n')).toBe('a b');
    expect(cleanPersonalText('\u202ea\u200bb\ufeff')).toBe('ab');
    expect(cleanPersonalText('a­b⁠c⁡d⁤e᠎f؜g')).toBe('abcdefg');
    expect(cleanPersonalText('­⁠؜')).toBeNull();
    expect(cleanPersonalText('\u0001\u007f')).toBeNull();
    expect(cleanPersonalText('   ')).toBeNull();
    expect(cleanPersonalText('한'.normalize('NFD'))).toBe('한');
  });
  it('leaves formula prefixes alone', () => {
    for (const s of ['=1+1', '+1', '-1', '@x']) expect(cleanPersonalText(s)).toBe(s);
  });
  it('builds a case-insensitive key', () => {
    expect(personalTermKey(' Apple  ')).toBe('apple');
    expect(personalTermKey('')).toBeNull();
  });
});

describe('schemas', () => {
  it('accepts a word row within limits and rejects violations', () => {
    expect(personalWordRowSchema.safeParse({ term: 'a', meaning: 'b' }).success).toBe(true);
    expect(personalWordRowSchema.safeParse({ term: '', meaning: 'b' }).success).toBe(false);
    expect(personalWordRowSchema.safeParse({ term: 'a', meaning: 'x'.repeat(L.meaning + 1) }).success).toBe(false);
    expect(personalWordRowSchema.safeParse({ term: 'a', meaning: 'b', example: '' }).success).toBe(false);
  });
  it('cleans and bounds list names', () => {
    expect(personalListNameSchema.parse('  Từ   vựng ')).toBe('Từ vựng');
    expect(personalListNameSchema.safeParse('   ').success).toBe(false);
    expect(personalListNameSchema.safeParse('x'.repeat(L.listName + 1)).success).toBe(false);
  });
  it('parses the RPC payloads', () => {
    expect(personalListSchema.parse({ id: UUID, name: 'A', language_code: 'ko', word_count: 3, due_count: 1, created_at: '2026-10-14T00:00:00Z' }).word_count).toBe(3);
    expect(personalListSchema.safeParse({ id: UUID, name: 'A', language_code: 'fr', word_count: 3, due_count: 1, created_at: 'x' }).success).toBe(false);
    expect(personalImportResultSchema.parse({ added: 1, updated: 0, unchanged: 2, duplicates: 0, invalid: [{ index: 3, reason: 'term_required' }] }).invalid).toHaveLength(1);
    expect(personalGradeResultSchema.parse({ word_id: UUID, state: 'learning', due_at: 'x', interval_minutes: 10, replayed: false }).state).toBe('learning');
  });
  it('reuses the review card contract for the queue', () => {
    const preview = { interval_minutes: 1, due_at: '2026-10-14T00:00:00Z' };
    const queue = personalQueueSchema.parse({
      cards: [
        {
          card_id: UUID,
          item_id: UUID,
          direction: 'recognize',
          state: 'new',
          is_new: true,
          due_at: '2026-10-14T00:00:00Z',
          postpone_count: 0,
          item: { language_code: 'ko', item_type: 'vocab', front: { text: '사과' }, back: { meaning: { vi: 'táo' } }, audio_path: null },
          previews: { again: preview, hard: preview, good: preview, easy: preview },
        },
      ],
      totals: { due_total: 1, served: 1, new_available: 1 },
    });
    expect(queue.cards[0]?.item.front.text).toBe('사과');
  });
  it('lists every error code once', () => {
    expect(new Set(PERSONAL_VOCAB_ERROR_CODES).size).toBe(PERSONAL_VOCAB_ERROR_CODES.length);
  });
});
