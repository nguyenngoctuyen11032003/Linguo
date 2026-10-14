import { describe, expect, it } from 'vitest';
import fixtures from './grading.fixtures.json';
import { EXAM_TRAILING_PUNCTUATION, EXAM_WHITESPACE, gradeExamAnswer, normalizeExamText } from './grading';

describe('short_text grading (shared fixtures, mirrored by SQL)', () => {
  it('has at least 30 cases, including NFD input and both verdicts', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(30);
    expect(fixtures.some((c) => c.input.normalize('NFC') !== c.input)).toBe(true);
    expect(fixtures.some((c) => c.correct)).toBe(true);
    expect(fixtures.some((c) => !c.correct)).toBe(true);
  });

  fixtures.forEach((c, i) => {
    it(`#${i} ${JSON.stringify(c.input)} vs ${JSON.stringify(c.accepted)} → ${c.correct}`, () => {
      expect(gradeExamAnswer('short_text', c.input, c.accepted)).toBe(c.correct);
    });
  });
});

describe('normalizeExamText', () => {
  it('applies NFC, trim, whitespace collapse, trailing punctuation strip and lower-case', () => {
    expect(normalizeExamText('  Hello\t\tWORLD?!  ')).toBe('hello world');
    expect(normalizeExamText('가')).toBe('가');
    expect(normalizeExamText('a 　b')).toBe('a b');
  });

  it('strips only the trailing run of punctuation and does not trim again', () => {
    expect(normalizeExamText('네, 좋아요.')).toBe('네, 좋아요');
    expect(normalizeExamText('네 .')).toBe('네 ');
    expect(normalizeExamText('...')).toBe('');
  });

  it('exports the character sets used by the SQL port', () => {
    expect([...EXAM_WHITESPACE].map((ch) => ch.codePointAt(0))).toEqual([0x20, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0xa0, 0x3000]);
    for (const ch of EXAM_TRAILING_PUNCTUATION) expect(normalizeExamText(`x${ch}`)).toBe('x');
    for (const ch of EXAM_WHITESPACE) expect(normalizeExamText(`x${ch}${ch}y`)).toBe('x y');
  });
});

describe('gradeExamAnswer', () => {
  it('mcq compares option ids exactly', () => {
    expect(gradeExamAnswer('mcq', 'b', 'b')).toBe(true);
    expect(gradeExamAnswer('mcq', 'a', 'b')).toBe(false);
    expect(gradeExamAnswer('mcq', 'B', 'b')).toBe(false);
    expect(gradeExamAnswer('mcq', null, 'b')).toBe(false);
    expect(gradeExamAnswer('mcq', 'b', ['b'])).toBe(false);
  });

  it('short_text: null answer or a non-list key is incorrect', () => {
    expect(gradeExamAnswer('short_text', null, ['x'])).toBe(false);
    expect(gradeExamAnswer('short_text', 'x', 'x')).toBe(false);
    expect(gradeExamAnswer('short_text', 'x', null)).toBe(false);
  });

  it('essay is never auto-graded', () => {
    expect(gradeExamAnswer('essay', 'Bài viết', null)).toBeNull();
    expect(gradeExamAnswer('essay', null, null)).toBeNull();
  });
});
