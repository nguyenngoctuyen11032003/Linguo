// CSV writer shared by the personal vocabulary export and the class summary export. Spreadsheet-friendly: a UTF-8
// BOM (so Excel reads kana, hangul and umlauts correctly), CRLF line endings, RFC 4180 quoting, and a guard against
// formula injection: a text cell that a spreadsheet would read as a formula gets a leading apostrophe.

/** First character of a file saved as UTF-8 so that Excel does not guess a legacy code page. */
export const CSV_BOM = '﻿';

export type CsvValue = string | number | boolean | null | undefined;

/** Text that Excel, Sheets or LibreOffice would run as a formula, or that already looks like a guarded cell. */
const NEEDS_GUARD = /^'*[=+\-@\t\r]/;

/**
 * Prefixes a text cell with an apostrophe when a spreadsheet would treat it as a formula (starts with = + - @, a tab
 * or a carriage return), or starts with apostrophes followed by one of those, so that
 * {@link unguardCsvCell} restores the original text exactly.
 */
export function guardCsvCell(text: string): string {
  return NEEDS_GUARD.test(text) ? `'${text}` : text;
}

/** Inverse of {@link guardCsvCell} for a cell read back from a CSV: drops one leading apostrophe added by the guard. */
export function unguardCsvCell(text: string): string {
  return /^'+[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

/** One RFC 4180 field: quoted when it holds a delimiter, a quote or a line break; quotes doubled. */
export function csvField(value: CsvValue, options: { guard?: boolean } = {}): string {
  if (value === null || value === undefined) return '';
  // Numbers and booleans are data, not text: a negative number must stay a number.
  const text = typeof value === 'string' ? (options.guard === false ? value : guardCsvCell(value)) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface BuildCsvOptions {
  /** Prepend the UTF-8 BOM (default true). */
  bom?: boolean;
  /** Guard text cells against formula injection (default true). */
  guard?: boolean;
}

/** Rows to CSV text: CRLF between rows and after the last one. */
export function buildCsv(rows: readonly (readonly CsvValue[])[], options: BuildCsvOptions = {}): string {
  const body = rows.map((row) => row.map((cell) => csvField(cell, { guard: options.guard })).join(',')).join('\r\n');
  return `${options.bom === false ? '' : CSV_BOM}${body}${rows.length > 0 ? '\r\n' : ''}`;
}
