import { describe, expect, it } from 'vitest';
import { parsePersonalVocabCsv } from './csv';

describe('header rows in Japanese and German', () => {
  it('reads a Japanese header (単語, 意味, 例文, メモ, 読み)', () => {
    const r = parsePersonalVocabCsv('単語,意味,例文,メモ,読み\nりんご,quả táo,りんごを食べます。,hiragana,ringo\n');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toMatchObject([{ term: 'りんご', meaning: 'quả táo', example: 'りんごを食べます。', note: 'hiragana', pronunciation: 'ringo' }]);
  });

  it('reads a header with dakuten and a different column order (ふりがな, 言葉, 意味)', () => {
    const r = parsePersonalVocabCsv('ふりがな,言葉,意味\nにほんご,日本語,tiếng Nhật\n');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toMatchObject([{ term: '日本語', meaning: 'tiếng Nhật', pronunciation: 'にほんご' }]);
  });

  it('reads a German header (Wort, Bedeutung, Beispiel, Notiz, Aussprache) with ; and Excel quoting', () => {
    const r = parsePersonalVocabCsv(
      'Wort;Bedeutung;Beispiel;Notiz;Aussprache\r\n"der Apfel, Äpfel";quả táo;"Ich esse einen Apfel; er ist rot.";giống đực;ˈapfl\r\n',
    );
    expect(r.delimiter).toBe(';');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toMatchObject([
      { term: 'der Apfel, Äpfel', meaning: 'quả táo', example: 'Ich esse einen Apfel; er ist rot.', note: 'giống đực', pronunciation: 'ˈapfl' },
    ]);
  });

  it('reads Übersetzung and Vokabel headers (umlaut dropped by the key)', () => {
    const r = parsePersonalVocabCsv('Vokabel,Übersetzung\nStraße,đường phố\n');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toMatchObject([{ term: 'Straße', meaning: 'đường phố' }]);
  });

  it('reads the Vietnamese language-name headers (Tiếng Đức, Tiếng Việt)', () => {
    const r = parsePersonalVocabCsv('Tiếng Đức,Tiếng Việt\nHaus,nhà\n');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toMatchObject([{ term: 'Haus', meaning: 'nhà' }]);
  });

  it('does not take a data row for a header just because its first cell is a language name', () => {
    const r = parsePersonalVocabCsv('Deutsch,tiếng Đức\nHaus,nhà\n');
    expect(r.hasHeader).toBe(false);
    expect(r.rows.map((x) => x.term)).toEqual(['Deutsch', 'Haus']);
  });

  it('headerless Japanese, Korean and German rows keep their scripts', () => {
    const r = parsePersonalVocabCsv('りんご,quả táo\n사과,quả táo\nÄpfel,những quả táo\n');
    expect(r.rows.map((x) => x.term)).toEqual(['りんご', '사과', 'Äpfel']);
  });
});

describe('row errors carry an excerpt', () => {
  it('shows the start of the record that failed', () => {
    const r = parsePersonalVocabCsv('word,meaning\nonlyterm,\n,only meaning\nok,fine\n');
    expect(r.errors).toEqual([
      { line: 2, reason: 'meaning_required', excerpt: 'onlyterm' },
      { line: 3, reason: 'term_required', excerpt: 'only meaning' },
    ]);
  });

  it('truncates a long record', () => {
    const r = parsePersonalVocabCsv(`${'a'.repeat(130)},m\nok,fine\n`);
    expect(r.errors[0]?.reason).toBe('term_too_long');
    expect(r.errors[0]?.excerpt?.length).toBe(60);
    expect(r.errors[0]?.excerpt?.endsWith('…')).toBe(true);
  });

  it('has no excerpt for a record too long to scan', () => {
    const r = parsePersonalVocabCsv(`${'a'.repeat(6000)},m\nok,fine\n`);
    expect(r.errors).toEqual([{ line: 1, reason: 'line_too_long' }]);
  });
});

describe('formula guard', () => {
  it('takes the export apostrophe off a cell that starts with a formula character', () => {
    const r = parsePersonalVocabCsv("'=1+1,'-ing\n'plain,it's\n");
    expect(r.rows.map((x) => [x.term, x.meaning])).toEqual([
      ['=1+1', '-ing'],
      ["'plain", "it's"],
    ]);
  });

  it('still imports a bare formula-looking cell untouched', () => {
    const r = parsePersonalVocabCsv('=SUM(A1),+84\n');
    expect(r.rows).toMatchObject([{ term: '=SUM(A1)', meaning: '+84' }]);
  });
});
