import { buildCsv } from '../csv-export';
import type { PersonalLanguage } from './contract';

// The sample file offered by the import dialog ("Tải file mẫu") and the export of a list use the same columns:
// Từ, Nghĩa, Ví dụ, Ghi chú, Phát âm. Every sample imports without errors (sample.test.ts).

export const WORD_CSV_HEADER = ['Từ', 'Nghĩa', 'Ví dụ', 'Ghi chú', 'Phát âm'] as const;

/** One word as written to a CSV (null = empty cell). */
export interface WordCsvRow {
  term: string;
  meaning: string;
  example: string | null;
  note: string | null;
  pronunciation: string | null;
}

const SAMPLE_ROWS: Record<PersonalLanguage, readonly WordCsvRow[]> = {
  en: [
    { term: 'apple', meaning: 'quả táo', example: 'I eat an apple every day.', note: 'danh từ đếm được', pronunciation: '/ˈæp.əl/' },
    { term: 'borrow', meaning: 'mượn', example: 'Can I borrow your pen?', note: null, pronunciation: '/ˈbɒr.əʊ/' },
    { term: 'look forward to', meaning: 'mong đợi', example: 'I look forward to meeting you.', note: 'đi với danh động từ (V-ing)', pronunciation: null },
  ],
  ko: [
    { term: '사과', meaning: 'quả táo', example: '사과를 먹어요.', note: null, pronunciation: 'sagwa' },
    { term: '감사합니다', meaning: 'cảm ơn (trang trọng)', example: '도와주셔서 감사합니다.', note: 'dùng với người lớn tuổi', pronunciation: 'gamsahamnida' },
    { term: '학교', meaning: 'trường học', example: '저는 학교에 가요.', note: null, pronunciation: 'hakgyo' },
  ],
  ja: [
    { term: 'りんご', meaning: 'quả táo', example: 'りんごを食べます。', note: 'viết bằng hiragana', pronunciation: 'ringo' },
    { term: '学校', meaning: 'trường học', example: '毎日、学校へ行きます。', note: null, pronunciation: 'がっこう' },
    { term: 'ありがとうございます', meaning: 'cảm ơn (lịch sự)', example: null, note: null, pronunciation: 'arigatou gozaimasu' },
  ],
  de: [
    { term: 'der Apfel, Äpfel', meaning: 'quả táo', example: 'Ich esse jeden Tag einen Apfel.', note: 'giống đực (der)', pronunciation: '[ˈapfl̩]' },
    { term: 'die Straße, -n', meaning: 'đường phố', example: 'Die Straße ist sehr lang.', note: 'ß đọc là "ss"', pronunciation: null },
    { term: 'sich freuen auf', meaning: 'mong chờ', example: 'Ich freue mich auf das Wochenende.', note: 'đi với Akkusativ', pronunciation: null },
  ],
};

/** The sample rows for a list language. */
export function sampleWordRows(language: PersonalLanguage): readonly WordCsvRow[] {
  return SAMPLE_ROWS[language];
}

/** Rows to the CSV the import dialog accepts: a header row, then one word per line. */
export function wordRowsToCsv(rows: readonly WordCsvRow[]): string {
  return buildCsv([WORD_CSV_HEADER, ...rows.map((r) => [r.term, r.meaning, r.example, r.note, r.pronunciation])]);
}

/** The sample file for a list language (UTF-8 with BOM, CRLF). */
export function buildSampleCsv(language: PersonalLanguage): string {
  return wordRowsToCsv(sampleWordRows(language));
}

/**
 * A file name for the export of a list: "tu-vung-<name>.csv" with the name reduced to letters, digits and dashes
 * (any script), at most 40 characters of it; "tu-vung-danh-sach.csv" when nothing is left.
 */
export function exportFileName(listName: string): string {
  const slug = listName
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `tu-vung-${slug || 'danh-sach'}.csv`;
}
