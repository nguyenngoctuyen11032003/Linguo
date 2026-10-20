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

/** Whether every whitespace-separated word of `query` occurs in `haystack`, both folded. An empty query matches. */
export function matchesSearch(haystack: string, query: string): boolean {
  const needles = foldSearch(query).split(/\s+/).filter(Boolean);
  if (needles.length === 0) return true;
  const folded = foldSearch(haystack);
  return needles.every((needle) => folded.includes(needle));
}
