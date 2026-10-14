import { describe, expect, it } from 'vitest';
import { PERSONAL_VOCAB_LIMITS as L } from './limits';
import { isCsvTooLarge, MAX_REPORTED_ERRORS, parsePersonalVocabCsv, toImportRows } from './csv';

const parse = (text: string) => parsePersonalVocabCsv(text);

describe('delimiters, BOM and line endings', () => {
  it('parses a comma file with a header', () => {
    const r = parse('word,meaning,example\napple,quả táo,I eat an apple.\npear,quả lê,\n');
    expect(r.fileError).toBeNull();
    expect(r.delimiter).toBe(',');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toEqual([
      { line: 2, term: 'apple', meaning: 'quả táo', example: 'I eat an apple.' },
      { line: 3, term: 'pear', meaning: 'quả lê' },
    ]);
  });

  it('detects semicolons', () => {
    const r = parse('word;meaning\nsun;mặt trời\nmoon;mặt trăng');
    expect(r.delimiter).toBe(';');
    expect(r.rows.map((x) => x.term)).toEqual(['sun', 'moon']);
  });

  it('detects tabs even when meanings contain commas', () => {
    const r = parse('word\tmeaning\napple\tquả táo, trái cây\npear\tquả lê, trái cây');
    expect(r.delimiter).toBe('\t');
    expect(r.rows[0]).toMatchObject({ term: 'apple', meaning: 'quả táo, trái cây' });
  });

  it('strips a UTF-8 BOM so the first header is still recognised', () => {
    const r = parse('\ufeffword,meaning\ncat,con mèo');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(1);
  });

  it('handles CRLF, lone CR and a missing final newline, and numbers lines physically', () => {
    expect(parse('word,meaning\r\na,một\r\nb,hai').rows.map((r) => r.line)).toEqual([2, 3]);
    expect(parse('word,meaning\ra,một\rb,hai').rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it('skips blank lines but keeps their line numbers', () => {
    const r = parse('word,meaning\n\n   \na,một\n,,\nb,hai');
    expect(r.errorCount).toBe(0);
    expect(r.rows.map((x) => [x.line, x.term])).toEqual([[4, 'a'], [6, 'b']]);
  });

  it('is empty for blank input', () => {
    expect(parse('').fileError).toBe('empty');
    expect(parse('\n  \n').fileError).toBe('empty');
    expect(parse('word,meaning\n').fileError).toBe('empty');
  });
});

describe('quotes', () => {
  it('reads quoted fields with delimiters, doubled quotes and newlines', () => {
    const r = parse('word,meaning,example\n"a, b","nghĩa ""x""","dòng 1\ndòng 2"\nnext,tiếp,');
    expect(r.rows[0]).toEqual({ line: 2, term: 'a, b', meaning: 'nghĩa "x"', example: 'dòng 1 dòng 2' });
    // The multi-line record took two physical lines.
    expect(r.rows[1]).toMatchObject({ line: 4, term: 'next' });
  });

  it('treats a quote in the middle of an unquoted field as literal', () => {
    const r = parse('word,meaning\n5" nail,đinh 5 inch');
    expect(r.rows[0]).toMatchObject({ term: '5" nail' });
  });

  it('reports an unterminated quote at the line it started on', () => {
    const r = parse('word,meaning\na,một\n"b,hai\nc,ba');
    expect(r.rows.map((x) => x.term)).toEqual(['a']);
    expect(r.errors).toEqual([{ line: 3, reason: 'unterminated_quote' }]);
  });
});

describe('header detection', () => {
  it('recognises Vietnamese and English names, with or without diacritics, in any order', () => {
    const r = parse('Nghĩa,Từ,Ví dụ,Ghi chú,Phát âm\nquả táo,apple,I eat one.,ghi,/ˈæp.əl/');
    expect(r.hasHeader).toBe(true);
    expect(r.rows[0]).toEqual({ line: 2, term: 'apple', meaning: 'quả táo', example: 'I eat one.', note: 'ghi', pronunciation: '/ˈæp.əl/' });
    const r2 = parse('TU VUNG;NGHIA\nx;y');
    expect(r2.hasHeader).toBe(true);
    expect(r2.rows).toHaveLength(1);
  });

  it('accepts Korean header names and optional pronunciation', () => {
    const r = parse('단어,뜻,발음\n사과,quả táo,sa-gwa');
    expect(r.hasHeader).toBe(true);
    expect(r.rows[0]).toMatchObject({ term: '사과', pronunciation: 'sa-gwa' });
  });

  it('ignores unknown extra columns', () => {
    const r = parse('id,word,level,meaning\n1,apple,A1,quả táo');
    expect(r.rows[0]).toEqual({ line: 2, term: 'apple', meaning: 'quả táo' });
  });

  it('treats the first row as data when it is not a header and reads columns by position', () => {
    const r = parse('apple,quả táo,I eat an apple.,note here,/æp/\npear,quả lê');
    expect(r.hasHeader).toBe(false);
    expect(r.rows[0]).toEqual({ line: 1, term: 'apple', meaning: 'quả táo', example: 'I eat an apple.', note: 'note here', pronunciation: '/æp/' });
    expect(r.rows).toHaveLength(2);
  });

  it('does not mistake a vocabulary row such as "note,ghi chú" for a header', () => {
    const r = parse('note,ghi chú\ndog,con chó');
    expect(r.rows.map((x) => x.term)).toEqual(['note', 'dog']);
  });
});

describe('row validation', () => {
  it('reports a missing meaning or term with line numbers', () => {
    const r = parse('word,meaning\napple\n,quả lê\nfig,quả sung');
    expect(r.errors).toEqual([
      { line: 2, reason: 'meaning_required' },
      { line: 3, reason: 'term_required' },
    ]);
    expect(r.rows.map((x) => x.term)).toEqual(['fig']);
  });

  it('enforces field length limits', () => {
    const lines = [
      'word,meaning,example,note,pronunciation',
      `${'a'.repeat(L.term + 1)},m,,,`,
      `t1,${'m'.repeat(L.meaning + 1)},,,`,
      `t2,m,${'e'.repeat(L.example + 1)},,`,
      `t3,m,,${'n'.repeat(L.note + 1)},`,
      `t4,m,,,${'p'.repeat(L.pronunciation + 1)}`,
      `${'a'.repeat(L.term)},${'m'.repeat(L.meaning)},,,`,
    ];
    const r = parse(lines.join('\n'));
    expect(r.errors.map((e) => e.reason)).toEqual([
      'term_too_long',
      'meaning_too_long',
      'example_too_long',
      'note_too_long',
      'pronunciation_too_long',
    ]);
    expect(r.rows).toHaveLength(1);
  });

  it('trims and collapses whitespace and strips control and bidi characters', () => {
    const r = parse('word,meaning\n"  big \t  apple ","\u202equả\u200b  táo\u0001 "');
    expect(r.rows[0]).toMatchObject({ term: 'big apple', meaning: 'quả táo' });
  });

  it('flags absurdly long records', () => {
    const r = parse(`word,meaning\n${'x'.repeat(L.maxRecordChars + 10)},y\nok,fine`);
    expect(r.errors).toEqual([{ line: 2, reason: 'line_too_long' }]);
    expect(r.rows.map((x) => x.term)).toEqual(['ok']);
  });

  it('caps the reported errors but keeps the true count', () => {
    const body = Array.from({ length: MAX_REPORTED_ERRORS + 25 }, (_, i) => `t${i}`).join('\n');
    const r = parse(`word,meaning\n${body}`);
    expect(r.errors).toHaveLength(MAX_REPORTED_ERRORS);
    expect(r.errorCount).toBe(MAX_REPORTED_ERRORS + 25);
  });
});

describe('deduplication and limits', () => {
  it('keeps the first of repeated terms (case, spacing and Hangul NFC/NFD folded)', () => {
    const nfd = '한국'.normalize('NFD');
    const r = parse(`word,meaning\nApple,một\napple  ,hai\n${nfd},Hàn\n한국,dup\nfig,ba`);
    expect(r.rows.map((x) => x.term)).toEqual(['Apple', nfd.normalize('NFC'), 'fig']);
    expect(r.duplicates).toEqual([
      { line: 3, term: 'apple', firstLine: 2 },
      { line: 5, term: '한국', firstLine: 4 },
    ]);
  });

  it('keeps at most maxRowsPerImport rows and counts the rest', () => {
    const body = Array.from({ length: L.maxRowsPerImport + 7 }, (_, i) => `w${i},m${i}`).join('\n');
    const r = parse(`word,meaning\n${body}`);
    expect(r.rows).toHaveLength(L.maxRowsPerImport);
    expect(r.skippedOverLimit).toBe(7);
  });

  it('honours a custom row limit', () => {
    const r = parsePersonalVocabCsv('a,1\nb,2\nc,3', { maxRows: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.skippedOverLimit).toBe(1);
  });
});

describe('Hangul and mixed scripts', () => {
  it('parses Korean vocabulary with romanization and examples', () => {
    const r = parse('단어,뜻,예문,발음\n학교,trường học,학교에 가요.,hak-gyo\n감사합니다,cảm ơn,,gam-sa-ham-ni-da');
    expect(r.rows).toEqual([
      { line: 2, term: '학교', meaning: 'trường học', example: '학교에 가요.', pronunciation: 'hak-gyo' },
      { line: 3, term: '감사합니다', meaning: 'cảm ơn', pronunciation: 'gam-sa-ham-ni-da' },
    ]);
  });

  it('normalises decomposed Vietnamese and Hangul to NFC', () => {
    const r = parse(`word,meaning\n${'한글'.normalize('NFD')},${'quả táo'.normalize('NFD')}`);
    expect(r.rows[0]?.term).toBe('한글');
    expect(r.rows[0]?.meaning).toBe('quả táo');
  });

  it('flags text that looks mis-decoded', () => {
    expect(parse('word,meaning\n��,x').encodingSuspect).toBe(true);
    expect(parse('word,meaning\na,b').encodingSuspect).toBe(false);
  });
});

describe('malicious input', () => {
  it('keeps formula prefixes as plain text', () => {
    const r = parse('word,meaning\n=SUM(A1:A9),+1\n-2+3,@cmd\n"=HYPERLINK(""http://evil"")",ok');
    expect(r.errorCount).toBe(0);
    expect(r.rows.map((x) => x.term)).toEqual(['=SUM(A1:A9)', '-2+3', '=HYPERLINK("http://evil")']);
    expect(r.rows.map((x) => x.meaning)).toEqual(['+1', '@cmd', 'ok']);
  });

  it('never interprets HTML: markup comes back as the same literal text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const r = parse(`word,meaning\n"${payload}","<script>alert(1)</script>"`);
    expect(r.rows[0]).toMatchObject({ term: payload, meaning: '<script>alert(1)</script>' });
  });

  it('refuses huge input before parsing', () => {
    const huge = 'a,b\n'.repeat(Math.ceil(L.maxCsvBytes / 4) + 10);
    const r = parse(huge);
    expect(r.fileError).toBe('too_large');
    expect(r.rows).toEqual([]);
  });

  it('measures bytes, not characters: multi-byte text over 1 MB is refused', () => {
    const hangul = '가'.repeat(Math.floor(L.maxCsvBytes / 3) + 10); // < 1 MiB chars, > 1 MiB bytes
    expect(hangul.length).toBeLessThan(L.maxCsvBytes);
    expect(parse(`${hangul},x`).fileError).toBe('too_large');
  });

  it('accepts a file just under the limit', () => {
    const line = `${'x'.repeat(98)},m\n`;
    const text = line.repeat(Math.floor((L.maxCsvBytes - 100) / line.length));
    expect(parse(text).fileError).toBeNull();
  });

  it('exposes the same check for File.size', () => {
    expect(isCsvTooLarge(L.maxCsvBytes)).toBe(false);
    expect(isCsvTooLarge(L.maxCsvBytes + 1)).toBe(true);
  });

  it('survives pathological quoting without hanging or throwing', () => {
    const started = Date.now();
    for (const text of ['"'.repeat(5000), '"a"b"c"d,"e', ',,,,,,,,,,,,,,,,,,\n'.repeat(500), '\n'.repeat(5000), '"\n"\n"\n'.repeat(500)]) {
      expect(() => parse(text)).not.toThrow();
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('removes null bytes', () => {
    expect(parse('word,meaning\nab\u0000cd,x').rows[0]?.term).toBe('ab cd');
  });
});

describe('toImportRows', () => {
  it('drops the line numbers', () => {
    const r = parse('apple,quả táo');
    expect(toImportRows(r.rows)).toEqual([{ term: 'apple', meaning: 'quả táo' }]);
  });
});
