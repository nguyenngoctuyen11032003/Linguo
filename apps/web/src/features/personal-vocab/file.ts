import type { PersonalWord } from '@linguo/shared';

/** The bytes of a chosen file (File.arrayBuffer where it exists, FileReader otherwise). */
export function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Text prepared for a forgiving search: lower case, Latin diacritics dropped (u and ü, quả and qua match), "ß" as "ss",
 * "đ" as "d". Kana, kanji and hangul are left as typed (the combining marks of dakuten and jamo are not touched).
 */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/ß/g, 'ss');
}

/** What the list page calls each scheduling state of a word. */
export const WORD_STATE_LABELS: Record<PersonalWord['fsrs_state'], string> = {
  new: 'Mới',
  learning: 'Đang học',
  relearning: 'Học lại',
  review: 'Đã học',
};

export type WordStateFilter = 'all' | PersonalWord['fsrs_state'];

/** Words whose term, meaning, example, note or pronunciation contain every word of `query` (folded), in the given state. */
export function filterWords(words: readonly PersonalWord[], query: string, state: WordStateFilter = 'all'): PersonalWord[] {
  const needles = foldSearch(query).split(/\s+/).filter(Boolean);
  return words.filter((word) => {
    if (state !== 'all' && word.fsrs_state !== state) return false;
    if (needles.length === 0) return true;
    const haystack = foldSearch([word.term, word.meaning, word.example, word.note, word.pronunciation].filter(Boolean).join(' '));
    return needles.every((needle) => haystack.includes(needle));
  });
}
