import type { PersonalLanguage } from './contract';

// Reading a CSV the learner saved from a spreadsheet. Browsers' File.text() always assumes UTF-8, but Excel saves
// "Unicode Text" as UTF-16 and "CSV (Comma delimited)" in the Windows code page of the machine (Shift_JIS for
// Japanese, CP949 for Korean, Windows-1258 for Vietnamese). Without this, kana, hangul and umlauts arrive as U+FFFD.

export type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'shift_jis' | 'euc-kr' | 'windows-1258';

export interface DecodedCsv {
  text: string;
  /** The encoding the bytes were read with. */
  encoding: CsvEncoding;
  /** True when the bytes were not valid UTF-8 and a legacy code page was guessed: the preview should say so. */
  guessed: boolean;
}

/**
 * The legacy code page to try for a file that is not UTF-8, by the language of the list: Shift_JIS (Windows-31J) for
 * Japanese, EUC-KR (CP949) for Korean, and Windows-1258 otherwise. Windows-1258 covers the Vietnamese meanings and
 * the Latin letters (including ä ö ü ß) of English and German lists.
 */
export function legacyEncodingFor(language: PersonalLanguage | null | undefined): CsvEncoding {
  if (language === 'ja') return 'shift_jis';
  if (language === 'ko') return 'euc-kr';
  return 'windows-1258';
}

function tryDecode(bytes: Uint8Array, label: string, fatal: boolean): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Bytes of a CSV file to text. A byte-order mark decides (UTF-8, UTF-16 LE/BE); otherwise valid UTF-8 is read as
 * UTF-8; otherwise the bytes are read with the legacy code page that fits `language` and `guessed` is true. When the
 * runtime lacks that decoder the UTF-8 text with replacement characters is returned (the parser flags it).
 */
export function decodeCsvBytes(input: ArrayBuffer | Uint8Array, language?: PersonalLanguage | null): DecodedCsv {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8', guessed: false };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le', guessed: false };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be', guessed: false };
  }
  const utf8 = tryDecode(bytes, 'utf-8', true);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8', guessed: false };
  const encoding = legacyEncodingFor(language);
  const legacy = tryDecode(bytes, encoding, false);
  if (legacy !== null) return { text: legacy, encoding, guessed: true };
  return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', guessed: false };
}
