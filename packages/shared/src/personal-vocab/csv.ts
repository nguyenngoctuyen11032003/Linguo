import { unguardCsvCell } from '../csv-export';
import { cleanPersonalText, personalTermKey, type PersonalWordRow } from './contract';
import { PERSONAL_VOCAB_LIMITS as L } from './limits';

// Client-side CSV parser for personal vocabulary (spec P2). Pure and synchronous: the file is read as text by the
// browser, size-checked here before anything is tokenised, and every cell stays plain text. Cells starting with
// = + - @ are NOT evaluated and React escapes them when shown. The one alteration: the export (csv-export.ts) puts an
// apostrophe in front of such cells so that spreadsheets do not run them, and the parser takes that apostrophe off
// again (unguardCsvCell), so an exported list imports back unchanged.

export type CsvFileError =
  /** The file is larger than PERSONAL_VOCAB_LIMITS.maxCsvBytes: refused without parsing. */
  | 'too_large'
  /** No data rows at all. */
  | 'empty';

export type CsvRowErrorReason =
  | 'term_required'
  | 'meaning_required'
  | 'term_too_long'
  | 'meaning_too_long'
  | 'example_too_long'
  | 'note_too_long'
  | 'pronunciation_too_long'
  | 'unterminated_quote'
  | 'line_too_long';

export interface CsvRowError {
  /** 1-based physical line where the record starts. */
  line: number;
  reason: CsvRowErrorReason;
  /** The start of the record's cells (cleaned, joined with " | ", at most EXCERPT_CHARS), to find it in the file. */
  excerpt?: string;
}

export interface ParsedWordRow extends PersonalWordRow {
  /** 1-based physical line of the record. */
  line: number;
}

export interface CsvDuplicate {
  line: number;
  term: string;
  /** Line of the first occurrence, which is the one kept. */
  firstLine: number;
}

export type CsvDelimiter = ',' | ';' | '\t';

export interface CsvParseResult {
  fileError: CsvFileError | null;
  delimiter: CsvDelimiter;
  /** True when the first record was recognised as a header row (and skipped). */
  hasHeader: boolean;
  /** Valid, deduplicated rows, at most PERSONAL_VOCAB_LIMITS.maxRowsPerImport. */
  rows: ParsedWordRow[];
  /** Row errors (capped at MAX_REPORTED_ERRORS entries; errorCount is the true total). */
  errors: CsvRowError[];
  errorCount: number;
  /** Repeated terms (same cleaned, lower-cased term); the first occurrence is kept. */
  duplicates: CsvDuplicate[];
  /** Valid rows beyond the per-import limit that were left out. */
  skippedOverLimit: number;
  /** The text holds U+FFFD: the file was probably not saved as UTF-8. */
  encodingSuspect: boolean;
}

export const MAX_REPORTED_ERRORS = 200;
/** Longest excerpt of a record kept with a row error. */
export const EXCERPT_CHARS = 60;

type Field = 'term' | 'meaning' | 'example' | 'note' | 'pronunciation';

/**
 * Header names that identify a column, in Vietnamese, English, Korean, Japanese and German. Compared after
 * {@link headerKey} (lower-cased, diacritics and dakuten dropped), which is applied to these spellings too.
 */
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  term: [
    'word', 'term', 'vocab', 'vocabulary', 'front', 'headword', 'tu', 'tu vung', 'tu moi',
    'tieng anh', 'tieng han', 'tieng nhat', 'tieng duc', 'english', 'korean', 'japanese', 'german',
    '단어', '어휘', '한국어',
    '単語', '語彙', '言葉', 'ことば', '日本語',
    'wort', 'vokabel', 'vokabeln', 'begriff', 'deutsch',
  ],
  meaning: [
    'meaning', 'definition', 'translation', 'back', 'vietnamese', 'nghia', 'y nghia', 'nghia cua tu', 'tieng viet', 'nghia tieng viet',
    '뜻', '의미', '번역', '베트남어',
    '意味', '訳', '訳語', '和訳', 'ベトナム語',
    'bedeutung', 'übersetzung', 'uebersetzung', 'vietnamesisch',
  ],
  example: ['example', 'sentence', 'example sentence', 'vi du', 'cau vi du', '예문', '例文', '例', 'beispiel', 'beispielsatz', 'satz'],
  note: ['note', 'notes', 'comment', 'ghi chu', '메모', '비고', 'メモ', '備考', 'notiz', 'notizen', 'anmerkung', 'bemerkung'],
  pronunciation: [
    'pronunciation', 'pron', 'ipa', 'romanization', 'phat am', 'phien am', 'cach doc',
    '발음', '로마자',
    '読み', 'よみ', '読み方', 'ふりがな', 'フリガナ', 'ひらがな', 'ローマ字', 'romaji', 'reading',
    'aussprache', 'lautschrift',
  ],
};
const FIELDS: readonly Field[] = ['term', 'meaning', 'example', 'note', 'pronunciation'];
/** Column order when there is no header row. */
const POSITIONAL: readonly Field[] = FIELDS;

const TOO_LONG: Record<Field, CsvRowErrorReason | null> = {
  term: 'term_too_long',
  meaning: 'meaning_too_long',
  example: 'example_too_long',
  note: 'note_too_long',
  pronunciation: 'pronunciation_too_long',
};
const MAX_LENGTH: Record<Field, number> = {
  term: L.term,
  meaning: L.meaning,
  example: L.example,
  note: L.note,
  pronunciation: L.pronunciation,
};

function headerKey(cell: string): string {
  return cell
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[_\-./:*()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Hangul (and anything else that decomposes) goes back to its composed form to match the aliases.
    .normalize('NFC');
}

const keysOf = (field: Field): ReadonlySet<string> => new Set(HEADER_ALIASES[field].map(headerKey));
const HEADER_KEYS: Record<Field, ReadonlySet<string>> = {
  term: keysOf('term'),
  meaning: keysOf('meaning'),
  example: keysOf('example'),
  note: keysOf('note'),
  pronunciation: keysOf('pronunciation'),
};

interface RawRecord {
  line: number;
  fields: string[];
  unterminated: boolean;
  tooLong: boolean;
}

/**
 * RFC 4180 tokeniser: quotes open only at the start of a field, `""` inside quotes is a literal quote, a quoted
 * field may span lines, records end at \r\n, \n or \r. A quote in the middle of an unquoted field is literal.
 * `limit` stops after that many records (used for delimiter detection).
 */
function tokenize(text: string, delimiter: CsvDelimiter, limit = Infinity): RawRecord[] {
  const records: RawRecord[] = [];
  const n = text.length;
  let i = 0;
  let line = 1;
  while (i < n && records.length < limit) {
    const startLine = line;
    const fields: string[] = [];
    let unterminated = false;
    let tooLong = false;
    const recordStart = i;
    let recordEnded = false;
    while (!recordEnded) {
      let value = '';
      if (text[i] === '"') {
        i += 1;
        let closed = false;
        while (i < n) {
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i += 1;
              closed = true;
              break;
            }
          } else {
            if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line += 1;
            value += ch;
            i += 1;
          }
        }
        if (!closed) unterminated = true;
        // Text between the closing quote and the delimiter is kept as part of the value.
        while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
          value += text[i];
          i += 1;
        }
      } else {
        const begin = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') i += 1;
        value = text.slice(begin, i);
      }
      fields.push(value);
      if (i >= n) {
        recordEnded = true;
      } else if (text[i] === delimiter) {
        i += 1;
        if (i >= n) {
          fields.push('');
          recordEnded = true;
        }
      } else {
        // \r\n, \n or \r
        if (text[i] === '\r' && text[i + 1] === '\n') i += 1;
        i += 1;
        line += 1;
        recordEnded = true;
      }
    }
    if (i - recordStart > L.maxRecordChars) tooLong = true;
    records.push({ line: startLine, fields: tooLong ? [] : fields, unterminated, tooLong });
  }
  return records;
}

/** The start of a record for an error message: its cleaned, non-empty cells joined with " | ". */
function excerptOf(record: RawRecord): string {
  const text = record.fields
    .map((f) => cleanPersonalText(f))
    .filter((f): f is string => f !== null)
    .join(' | ');
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1)}…` : text;
}

function isBlank(record: RawRecord): boolean {
  return !record.tooLong && !record.unterminated && record.fields.every((f) => cleanPersonalText(f) === null);
}

/**
 * Picks the delimiter that splits the first records into the most consistent columns (>= 2). Ties go to the
 * earlier candidate: tab, then semicolon, then comma. Vietnamese meanings often hold a comma ("quả táo, trái táo")
 * while a semicolon inside a cell is rare, so a headerless semicolon file with one comma per line stays semicolon.
 */
function detectDelimiter(text: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = ['\t', ';', ','];
  let best: CsvDelimiter = ',';
  let bestScore = 0;
  const head = text.slice(0, 20_000);
  for (const delimiter of candidates) {
    const sample = tokenize(head, delimiter, 12).filter((r) => !isBlank(r) && !r.tooLong);
    const first = sample[0];
    if (!first || first.fields.length < 2) continue;
    const score = sample.filter((r) => r.fields.length === first.fields.length).length;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

/** Column index of every recognised header cell; null unless both a term and a meaning column are present. */
function readHeader(fields: string[]): Partial<Record<Field, number>> | null {
  const map: Partial<Record<Field, number>> = {};
  fields.forEach((cell, index) => {
    const key = headerKey(cell);
    for (const field of FIELDS) {
      if (map[field] === undefined && HEADER_KEYS[field].has(key)) {
        map[field] = index;
        break;
      }
    }
  });
  return map.term !== undefined && map.meaning !== undefined ? map : null;
}

function emptyResult(fileError: CsvFileError | null, encodingSuspect = false): CsvParseResult {
  return {
    fileError,
    delimiter: ',',
    hasHeader: false,
    rows: [],
    errors: [],
    errorCount: 0,
    duplicates: [],
    skippedOverLimit: 0,
    encodingSuspect,
  };
}

/** UTF-8 size of a string without allocating it twice for small inputs. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface ParseOptions {
  /** Defaults to PERSONAL_VOCAB_LIMITS.maxCsvBytes. */
  maxBytes?: number;
  /** Defaults to PERSONAL_VOCAB_LIMITS.maxRowsPerImport. */
  maxRows?: number;
}

/** Fast pre-check for callers that know the file size (File.size) before reading it. */
export function isCsvTooLarge(sizeInBytes: number, maxBytes: number = L.maxCsvBytes): boolean {
  return sizeInBytes > maxBytes;
}

/**
 * Parses CSV text into word rows. Never throws: problems are returned as `fileError` (whole file) or `errors`
 * (per record, with the physical line number). Valid rows are cleaned, trimmed and deduplicated by term.
 */
export function parsePersonalVocabCsv(input: string, options: ParseOptions = {}): CsvParseResult {
  const maxBytes = options.maxBytes ?? L.maxCsvBytes;
  const maxRows = options.maxRows ?? L.maxRowsPerImport;
  // Refuse before tokenising: every UTF-16 unit takes at least one byte, so length alone already proves "too big".
  if (input.length > maxBytes || byteLength(input) > maxBytes) return emptyResult('too_large');

  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const encodingSuspect = text.includes('�');
  if (text.trim() === '') return emptyResult('empty', encodingSuspect);

  const delimiter = detectDelimiter(text);
  const records = tokenize(text, delimiter);

  let columns: Partial<Record<Field, number>> | null = null;
  let hasHeader = false;
  let headerChecked = false;

  const rows: ParsedWordRow[] = [];
  const errors: CsvRowError[] = [];
  let errorCount = 0;
  const duplicates: CsvDuplicate[] = [];
  const seen = new Map<string, number>();
  let skippedOverLimit = 0;
  const addError = (line: number, reason: CsvRowErrorReason, record?: RawRecord) => {
    errorCount += 1;
    if (errors.length >= MAX_REPORTED_ERRORS) return;
    const excerpt = record ? excerptOf(record) : '';
    errors.push(excerpt ? { line, reason, excerpt } : { line, reason });
  };

  for (const record of records) {
    if (isBlank(record)) continue;
    if (!headerChecked) {
      headerChecked = true;
      columns = record.tooLong ? null : readHeader(record.fields);
      if (columns) {
        hasHeader = true;
        continue;
      }
    }
    if (record.tooLong) {
      addError(record.line, 'line_too_long');
      continue;
    }
    if (record.unterminated) {
      addError(record.line, 'unterminated_quote', record);
      continue;
    }

    const values: Partial<Record<Field, string | null>> = {};
    for (const field of FIELDS) {
      const index = columns ? columns[field] : POSITIONAL.indexOf(field);
      const raw = index === undefined ? undefined : record.fields[index];
      const cleaned = raw === undefined ? null : cleanPersonalText(raw);
      values[field] = cleaned === null ? null : unguardCsvCell(cleaned);
    }

    if (values.term === null || values.term === undefined) {
      addError(record.line, 'term_required', record);
      continue;
    }
    if (values.meaning === null || values.meaning === undefined) {
      addError(record.line, 'meaning_required', record);
      continue;
    }
    let tooLong: CsvRowErrorReason | null = null;
    for (const field of FIELDS) {
      const value = values[field];
      if (value && value.length > MAX_LENGTH[field]) {
        tooLong = TOO_LONG[field];
        break;
      }
    }
    if (tooLong) {
      addError(record.line, tooLong, record);
      continue;
    }

    const key = personalTermKey(values.term);
    if (key === null) {
      addError(record.line, 'term_required', record);
      continue;
    }
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      duplicates.push({ line: record.line, term: values.term, firstLine });
      continue;
    }
    if (rows.length >= maxRows) {
      skippedOverLimit += 1;
      continue;
    }
    seen.set(key, record.line);
    const row: ParsedWordRow = { line: record.line, term: values.term, meaning: values.meaning };
    if (values.example) row.example = values.example;
    if (values.note) row.note = values.note;
    if (values.pronunciation) row.pronunciation = values.pronunciation;
    rows.push(row);
  }

  const result: CsvParseResult = {
    fileError: rows.length === 0 && errorCount === 0 && duplicates.length === 0 ? 'empty' : null,
    delimiter,
    hasHeader,
    rows,
    errors,
    errorCount,
    duplicates,
    skippedOverLimit,
    encodingSuspect,
  };
  return result;
}

/** Strips the parser-only `line` so rows can go to import_personal_words. */
export function toImportRows(rows: readonly ParsedWordRow[]): PersonalWordRow[] {
  return rows.map((row) => {
    const out: PersonalWordRow = { term: row.term, meaning: row.meaning };
    if (row.example) out.example = row.example;
    if (row.note) out.note = row.note;
    if (row.pronunciation) out.pronunciation = row.pronunciation;
    return out;
  });
}
