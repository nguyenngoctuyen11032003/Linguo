import { describe, expect, it } from 'vitest';
import { parsePersonalVocabCsv } from './personal-vocab/csv';
import { CSV_BOM, buildCsv, csvField, guardCsvCell, unguardCsvCell } from './csv-export';

describe('csvField', () => {
  it('leaves plain text, kana, hangul and umlauts alone', () => {
    expect(csvField('apple')).toBe('apple');
    expect(csvField('ありがとう')).toBe('ありがとう');
    expect(csvField('한국어')).toBe('한국어');
    expect(csvField('Äpfel, Straße')).toBe('"Äpfel, Straße"');
  });

  it('quotes commas, quotes and line breaks, doubling quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('renders null and undefined as empty and keeps numbers and booleans as data', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(-3)).toBe('-3');
    expect(csvField(0.8)).toBe('0.8');
    expect(csvField(true)).toBe('true');
  });

  it('guards text that a spreadsheet would run as a formula', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('+84')).toBe("'+84");
    expect(csvField('-ing')).toBe("'-ing");
    expect(csvField('@home')).toBe("'@home");
    expect(csvField('	cmd')).toBe("'	cmd");
    expect(csvField('=1,2')).toBe(`"'=1,2"`);
  });

  it('can switch the guard off', () => {
    expect(csvField('=1', { guard: false })).toBe('=1');
  });
});

describe('guardCsvCell / unguardCsvCell', () => {
  it('round-trip every kind of cell', () => {
    for (const text of ['apple', '=1+1', '+84', '-ing', '@x', "'=x", "'-x", "'plain", "''=x", 'a=b', '']) {
      expect(unguardCsvCell(guardCsvCell(text))).toBe(text);
    }
  });

  it('only strips an apostrophe that the guard could have added', () => {
    expect(unguardCsvCell("'hello")).toBe("'hello");
    expect(unguardCsvCell("it's")).toBe("it's");
  });
});

describe('buildCsv', () => {
  it('writes a BOM, CRLF line endings and a final newline', () => {
    const csv = buildCsv([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(csv).toBe(`${CSV_BOM}a,b\r\nc,d\r\n`);
  });

  it('can omit the BOM and an empty table is empty', () => {
    expect(buildCsv([['x']], { bom: false })).toBe('x\r\n');
    expect(buildCsv([], { bom: false })).toBe('');
  });

  it('is read back identically by the vocabulary CSV parser (BOM, CRLF, quotes, newlines, formulas, 4 languages)', () => {
    const rows = [
      ['Từ', 'Nghĩa', 'Ví dụ', 'Ghi chú', 'Phát âm'],
      ['사과', 'quả táo', '사과를 먹어요.', '', 'sagwa'],
      ['ありがとう', 'cảm ơn', 'ありがとうございます。', 'lịch sự', 'arigatou'],
      ['Äpfel', 'những quả táo, "trái táo"', 'Ich esse Äpfel.', 'số nhiều\nvà đếm được', ''],
      ['-ing', '=1+1', '+84 là mã vùng', "'=x", '@home'],
    ];
    const parsed = parsePersonalVocabCsv(buildCsv(rows));
    expect(parsed.errors).toEqual([]);
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.rows.map((r) => [r.term, r.meaning, r.example ?? '', r.note ?? '', r.pronunciation ?? ''])).toEqual([
      ['사과', 'quả táo', '사과를 먹어요.', '', 'sagwa'],
      ['ありがとう', 'cảm ơn', 'ありがとうございます。', 'lịch sự', 'arigatou'],
      ['Äpfel', 'những quả táo, "trái táo"', 'Ich esse Äpfel.', 'số nhiều và đếm được', ''],
      ['-ing', '=1+1', '+84 là mã vùng', "'=x", '@home'],
    ]);
  });
});
