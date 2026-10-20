import { describe, expect, it } from 'vitest';
import { filterWords, foldSearch, readFileBytes } from './file';
import { personalWord } from './personal-fixtures';

describe('foldSearch', () => {
  it('lower-cases and drops Latin diacritics, đ and ß', () => {
    expect(foldSearch('Quả TÁO')).toBe('qua tao');
    expect(foldSearch('Đường')).toBe('duong');
    expect(foldSearch('Straße Äpfel Über')).toBe('strasse apfel uber');
    expect(foldSearch('der Käse')).toBe('der kase');
  });

  it('leaves kana, kanji and hangul as typed (dakuten and jamo are not stripped)', () => {
    expect(foldSearch('がっこう')).toBe('がっこう');
    expect(foldSearch('日本語')).toBe('日本語');
    expect(foldSearch('한국어'.normalize('NFD'))).toBe('한국어');
    // The dakuten of が is kept, so か does not match が.
    expect(foldSearch('が')).not.toBe(foldSearch('か'));
  });
});

describe('filterWords', () => {
  const words = [
    personalWord({ term: 'Straße', meaning: 'đường phố', example: 'Die Straße ist lang.', fsrs_state: 'new' }),
    personalWord({ term: 'がっこう', meaning: 'trường học', pronunciation: 'gakkou', fsrs_state: 'learning' }),
    personalWord({ term: '사과', meaning: 'quả táo', note: 'trái cây', fsrs_state: 'review' }),
    personalWord({ term: 'Äpfel', meaning: 'những quả táo', fsrs_state: 'relearning' }),
  ];

  it('returns everything for an empty query', () => {
    expect(filterWords(words, '')).toHaveLength(4);
    expect(filterWords(words, '   ')).toHaveLength(4);
  });

  it('matches term, meaning, example, note and pronunciation', () => {
    expect(filterWords(words, 'strasse').map((w) => w.term)).toEqual(['Straße']);
    expect(filterWords(words, 'duong pho').map((w) => w.term)).toEqual(['Straße']);
    expect(filterWords(words, 'ist lang').map((w) => w.term)).toEqual(['Straße']);
    expect(filterWords(words, 'gakkou').map((w) => w.term)).toEqual(['がっこう']);
    expect(filterWords(words, 'trai cay').map((w) => w.term)).toEqual(['사과']);
    expect(filterWords(words, 'apfel').map((w) => w.term)).toEqual(['Äpfel']);
  });

  it('needs every word of the query, in any order', () => {
    expect(filterWords(words, 'qua tao').map((w) => w.term)).toEqual(['사과', 'Äpfel']);
    expect(filterWords(words, 'tao nhung').map((w) => w.term)).toEqual(['Äpfel']);
    expect(filterWords(words, 'qua zzz')).toEqual([]);
  });

  it('filters by state alone or together with a query', () => {
    expect(filterWords(words, '', 'new').map((w) => w.term)).toEqual(['Straße']);
    expect(filterWords(words, '', 'relearning').map((w) => w.term)).toEqual(['Äpfel']);
    expect(filterWords(words, 'qua', 'review').map((w) => w.term)).toEqual(['사과']);
    expect(filterWords(words, 'qua', 'new')).toEqual([]);
  });

  it('does not touch the input array', () => {
    const copy = [...words];
    filterWords(words, 'qua');
    expect(words).toEqual(copy);
  });
});

describe('readFileBytes', () => {
  it('reads the bytes of a file', async () => {
    const bytes = new Uint8Array([1, 2, 3, 0xff]);
    const buffer = await readFileBytes(new File([bytes], 'x.csv'));
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 0xff]);
  });
});
