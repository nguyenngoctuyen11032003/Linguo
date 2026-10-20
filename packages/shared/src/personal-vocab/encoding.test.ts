import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, legacyEncodingFor } from './encoding';
import { parsePersonalVocabCsv } from './csv';

/** UTF-16 little endian, as Excel writes "Unicode Text". */
const utf16le = (text: string) => {
  const units = [0xfeff, ...Array.from(text, (ch) => ch.charCodeAt(0))];
  const out = new Uint8Array(units.length * 2);
  const view = new DataView(out.buffer);
  units.forEach((unit, i) => view.setUint16(i * 2, unit, true));
  return out;
};

const bytes = (...values: number[]) => new Uint8Array(values);

describe('decodeCsvBytes', () => {
  it('reads UTF-8, with or without a BOM, without guessing', () => {
    const text = 'Wort,Bedeutung\nÄpfel,táo\n사과,táo\nりんご,táo\n';
    const plain = new TextEncoder().encode(text);
    expect(decodeCsvBytes(plain)).toEqual({ text, encoding: 'utf-8', guessed: false });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...plain]);
    expect(decodeCsvBytes(withBom)).toEqual({ text, encoding: 'utf-8', guessed: false });
  });

  it('reads the UTF-16 that Excel writes for "Unicode Text" (tab separated)', () => {
    const text = 'Từ\tNghĩa\n사과\tquả táo\nりんご\tquả táo\nÄpfel\ttáo\n';
    const decoded = decodeCsvBytes(utf16le(text));
    expect(decoded).toEqual({ text, encoding: 'utf-16le', guessed: false });
    const parsed = parsePersonalVocabCsv(decoded.text);
    expect(parsed.delimiter).toBe('\t');
    expect(parsed.rows.map((r) => r.term)).toEqual(['사과', 'りんご', 'Äpfel']);
  });

  it('reads UTF-16 big endian with a BOM', () => {
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x30, 0x42]);
    expect(decodeCsvBytes(be)).toEqual({ text: 'Aあ', encoding: 'utf-16be', guessed: false });
  });

  it('guesses Shift_JIS for a Japanese list when the bytes are not UTF-8', () => {
    // "あ" = 82 A0 in Shift_JIS, "日本" = 93 FA 96 7B.
    const decoded = decodeCsvBytes(bytes(0x82, 0xa0, 0x2c, 0x93, 0xfa, 0x96, 0x7b), 'ja');
    expect(decoded).toEqual({ text: 'あ,日本', encoding: 'shift_jis', guessed: true });
  });

  it('guesses CP949 (EUC-KR) for a Korean list', () => {
    // "한" = C7 D1 in EUC-KR.
    const decoded = decodeCsvBytes(bytes(0xc7, 0xd1, 0x2c, 0x78), 'ko');
    expect(decoded).toEqual({ text: '한,x', encoding: 'euc-kr', guessed: true });
  });

  it('guesses Windows-1258 for English and German lists: umlauts and Vietnamese tone marks come out right', () => {
    // "Äpfel,Straße" with Windows Latin bytes: Ä = C4, ß = DF.
    const german = decodeCsvBytes(bytes(0xc4, 0x70, 0x66, 0x65, 0x6c, 0x2c, 0x53, 0x74, 0x72, 0x61, 0xdf, 0x65), 'de');
    expect(german).toEqual({ text: 'Äpfel,Straße', encoding: 'windows-1258', guessed: true });
    // "quả" in Windows-1258 is q u a + the combining hook (byte D2); NFC (the parser's cleaning) joins them.
    const viet = decodeCsvBytes(bytes(0x71, 0x75, 0x61, 0xd2), 'en');
    expect(viet.guessed).toBe(true);
    expect(viet.text.normalize('NFC')).toBe('quả');
  });

  it('uses Windows-1258 when the language is unknown', () => {
    expect(decodeCsvBytes(bytes(0xff, 0xfd, 0x41)).encoding).toBe('windows-1258');
    expect(legacyEncodingFor(null)).toBe('windows-1258');
    expect(legacyEncodingFor(undefined)).toBe('windows-1258');
    expect(legacyEncodingFor('en')).toBe('windows-1258');
    expect(legacyEncodingFor('de')).toBe('windows-1258');
  });

  it('accepts an ArrayBuffer and an empty file', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('a,b').buffer).text).toBe('a,b');
    expect(decodeCsvBytes(new Uint8Array(0))).toEqual({ text: '', encoding: 'utf-8', guessed: false });
  });
});
