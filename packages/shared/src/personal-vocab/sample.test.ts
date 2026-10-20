import { describe, expect, it } from 'vitest';
import { CSV_BOM } from '../csv-export';
import { PERSONAL_LANGUAGES } from './contract';
import { parsePersonalVocabCsv } from './csv';
import { buildSampleCsv, exportFileName, sampleWordRows, wordRowsToCsv } from './sample';

describe('sample files', () => {
  it.each(PERSONAL_LANGUAGES)('the %s sample imports without a single error', (language) => {
    const csv = buildSampleCsv(language);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const parsed = parsePersonalVocabCsv(csv);
    expect(parsed.fileError).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(parsed.duplicates).toEqual([]);
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.encodingSuspect).toBe(false);
    expect(parsed.rows.map((r) => r.term)).toEqual(sampleWordRows(language).map((r) => r.term));
    expect(parsed.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('each sample is written in its own script', () => {
    expect(buildSampleCsv('ko')).toMatch(/[가-힯]/);
    expect(buildSampleCsv('ja')).toMatch(/[぀-ヿ]/);
    expect(buildSampleCsv('ja')).toMatch(/[一-鿿]/);
    expect(buildSampleCsv('de')).toMatch(/[äöüÄÖÜß]/);
    expect(buildSampleCsv('en')).not.toMatch(/[가-힯぀-ヿ]/);
  });

  it('keeps the optional columns of each sample row', () => {
    const parsed = parsePersonalVocabCsv(buildSampleCsv('de'));
    expect(parsed.rows[0]).toMatchObject({ term: 'der Apfel, Äpfel', pronunciation: '[ˈapfl̩]', example: 'Ich esse jeden Tag einen Apfel.' });
    expect(parsed.rows[1]?.note).toBe('ß đọc là "ss"');
  });
});

describe('wordRowsToCsv', () => {
  it('writes the five columns and imports back unchanged, whatever the cell holds', () => {
    const rows = [
      { term: '=cmd|calc', meaning: '+1', example: '"quoted", with comma', note: 'a\r\nb', pronunciation: '@x' },
      { term: '日本語', meaning: 'tiếng Nhật', example: null, note: null, pronunciation: 'にほんご' },
      { term: 'Straße', meaning: 'đường', example: null, note: null, pronunciation: null },
    ];
    const parsed = parsePersonalVocabCsv(wordRowsToCsv(rows));
    expect(parsed.errors).toEqual([]);
    expect(
      parsed.rows.map(({ term, meaning, example, note, pronunciation }) => ({
        term,
        meaning,
        example: example ?? null,
        note: note ?? null,
        pronunciation: pronunciation ?? null,
      })),
    ).toEqual([{ term: '=cmd|calc', meaning: '+1', example: '"quoted", with comma', note: 'a b', pronunciation: '@x' }, ...rows.slice(1)]);
  });

  it('an exported file with a header row but no words has nothing to import', () => {
    expect(parsePersonalVocabCsv(wordRowsToCsv([])).fileError).toBe('empty');
  });
});

describe('exportFileName', () => {
  it('keeps letters of any script and turns everything else into single dashes', () => {
    expect(exportFileName('Từ vựng TOPIK 1')).toBe('tu-vung-từ-vựng-topik-1.csv');
    expect(exportFileName('日本語 N5')).toBe('tu-vung-日本語-n5.csv');
    expect(exportFileName('Deutsch: Äpfel & Birnen!')).toBe('tu-vung-deutsch-äpfel-birnen.csv');
  });

  it('falls back when nothing usable is left and caps the length', () => {
    expect(exportFileName('???')).toBe('tu-vung-danh-sach.csv');
    expect(exportFileName('a'.repeat(100))).toBe(`tu-vung-${'a'.repeat(40)}.csv`);
    expect(exportFileName(`${'a'.repeat(39)}--b`)).toBe(`tu-vung-${'a'.repeat(39)}.csv`);
  });

  it('never contains a path separator or a dot besides the extension', () => {
    const name = exportFileName('../../etc/passwd.');
    expect(name).toBe('tu-vung-etc-passwd.csv');
    expect(name.replace(/\.csv$/, '')).not.toMatch(/[./\\]/);
  });
});
