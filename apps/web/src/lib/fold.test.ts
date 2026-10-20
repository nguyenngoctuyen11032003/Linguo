import { describe, expect, it } from 'vitest';
import { foldSearch, matchesSearch } from './fold';

describe('foldSearch', () => {
  it('lower-cases and drops Latin diacritics, đ and ß', () => {
    expect(foldSearch('Quả TÁO')).toBe('qua tao');
    expect(foldSearch('Đường')).toBe('duong');
    expect(foldSearch('Straße Äpfel Über')).toBe('strasse apfel uber');
  });

  it('leaves kana, kanji and hangul as typed', () => {
    expect(foldSearch('がっこう')).toBe('がっこう');
    expect(foldSearch('日本語')).toBe('日本語');
    expect(foldSearch('한국어'.normalize('NFD'))).toBe('한국어');
    expect(foldSearch('が')).not.toBe(foldSearch('か'));
  });
});

describe('matchesSearch', () => {
  it('needs every word of the query, in any order, and an empty query matches', () => {
    expect(matchesSearch('Nguyễn Văn An', 'an nguyen')).toBe(true);
    expect(matchesSearch('Nguyễn Văn An', 'van binh')).toBe(false);
    expect(matchesSearch('Nguyễn Văn An', '   ')).toBe(true);
    expect(matchesSearch('', 'x')).toBe(false);
  });
});
