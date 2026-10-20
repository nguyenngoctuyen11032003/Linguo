import { describe, expect, it } from 'vitest';
import { parsePersonalVocabCsv, toImportRows } from './csv';

describe('parsePersonalVocabCsv edge cases', () => {
  it('a header-only file is empty, not an error list', () => {
    const r = parsePersonalVocabCsv('word,meaning\n');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toEqual([]);
    expect(r.fileError).toBe('empty');
  });

  it('physical line numbers survive a multi-line quoted field', () => {
    const r = parsePersonalVocabCsv('word,meaning\n"a\nb",x\nnext,\nok,fine\n');
    expect(r.rows.map((x) => [x.line, x.term])).toEqual([[2, 'a b'], [5, 'ok']]);
    expect(r.errors).toEqual([{ line: 4, reason: 'meaning_required', excerpt: 'next' }]);
  });

  it('a trailing delimiter yields an empty last field, not a crash', () => {
    const r = parsePersonalVocabCsv('hello,xin chào,');
    expect(r.rows).toMatchObject([{ term: 'hello', meaning: 'xin chào' }]);
  });

  it('ragged rows: short rows lose optional columns, extra columns are ignored', () => {
    const r = parsePersonalVocabCsv('a,b\nc,d,e,f,g,h,i\n');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ term: 'c', meaning: 'd', example: 'e', note: 'f', pronunciation: 'g' });
  });

  it('whitespace-only term or meaning counts as missing', () => {
    const r = parsePersonalVocabCsv('   ,x\ny,   \nz,ok\n');
    expect(r.errors.map((e) => e.reason)).toEqual(['term_required', 'meaning_required']);
    expect(r.rows.map((x) => x.term)).toEqual(['z']);
  });

  it('duplicates only: no rows but no empty-file error', () => {
    const r = parsePersonalVocabCsv('a,1\nA,2\n');
    expect(r.rows).toHaveLength(1);
    expect(r.duplicates).toEqual([{ line: 2, term: 'A', firstLine: 1 }]);
    expect(r.fileError).toBeNull();
  });

  it('Vietnamese NFC and NFD spellings of one term are duplicates', () => {
    const r = parsePersonalVocabCsv(`${'cà phê'.normalize('NFC')},coffee\n${'cà phê'.normalize('NFD')},coffee\n`);
    expect(r.rows).toHaveLength(1);
    expect(r.duplicates).toHaveLength(1);
  });

  it('Hangul jamo and syllable spellings of one term are duplicates and come back as syllables', () => {
    const r = parsePersonalVocabCsv(`${'한국어'.normalize('NFD')},tiếng Hàn\n${'한국어'},tiếng Hàn\n`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.term).toBe('한국어');
    expect(r.duplicates).toHaveLength(1);
  });

  it('a field exactly at the limit passes and one over fails', () => {
    expect(parsePersonalVocabCsv(`${'a'.repeat(120)},m\n`).rows).toHaveLength(1);
    expect(parsePersonalVocabCsv(`${'a'.repeat(121)},m\n`).errors[0]?.reason).toBe('term_too_long');
    expect(parsePersonalVocabCsv(`t,${'m'.repeat(300)}\n`).rows).toHaveLength(1);
    expect(parsePersonalVocabCsv(`t,${'m'.repeat(301)}\n`).errors[0]?.reason).toBe('meaning_too_long');
  });

  it('maxRows 0 skips every valid row and still reports them', () => {
    const r = parsePersonalVocabCsv('a,1\nb,2\n', { maxRows: 0 });
    expect(r.rows).toEqual([]);
    expect(r.skippedOverLimit).toBe(2);
  });

  it('only a lone newline or delimiter-only lines is empty', () => {
    for (const text of ['\n', '\r\n\r\n', ',,,\n,,\n', '﻿']) expect(parsePersonalVocabCsv(text).fileError).toBe('empty');
  });

  it('a quote right after the closing quote keeps the trailing text', () => {
    const r = parsePersonalVocabCsv('"a"b,m\n');
    expect(r.rows[0]?.term).toBe('ab');
  });

  it('semicolon files may contain commas in cells', () => {
    const r = parsePersonalVocabCsv('word;meaning\nhi, there;xin chào, bạn\nbye;tạm biệt\n');
    expect(r.delimiter).toBe(';');
    expect(r.rows[0]).toMatchObject({ term: 'hi, there', meaning: 'xin chào, bạn' });
  });

  it('a headerless semicolon file with one comma per meaning is still split on semicolons', () => {
    const r = parsePersonalVocabCsv('apple;quả táo, trái táo\npear;quả lê, trái lê\n');
    expect(r.delimiter).toBe(';');
    expect(r.rows.map(({ term, meaning }) => ({ term, meaning }))).toEqual([
      { term: 'apple', meaning: 'quả táo, trái táo' },
      { term: 'pear', meaning: 'quả lê, trái lê' },
    ]);
  });

  it('a plain comma file is unaffected by the semicolon tie-break', () => {
    const r = parsePersonalVocabCsv('apple,quả táo\npear,quả lê\n');
    expect(r.delimiter).toBe(',');
    expect(r.rows).toHaveLength(2);
  });

  it('toImportRows omits unset optional fields and the line', () => {
    const out = toImportRows(parsePersonalVocabCsv('a,b\n').rows);
    expect(out).toEqual([{ term: 'a', meaning: 'b' }]);
    expect(Object.keys(out[0]!)).not.toContain('line');
  });
});
