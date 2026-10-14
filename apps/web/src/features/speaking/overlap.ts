// Spec 6.9: a speech-to-text transcript may be wrong, so it is only compared with the target sentence as a gentle
// word-overlap hint. There is deliberately no numeric score or grade here.

export type OverlapLevel = 'close' | 'partial' | 'far';

export interface OverlapHint {
  /** Target words that were not found in the transcript, in sentence order. */
  missing: string[];
  level: OverlapLevel;
}

/** Lowercase words; letters (any script, incl. Hangul), digits and inner apostrophes survive, the rest is dropped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 0);
}

export function compareToTarget(target: string, transcript: string): OverlapHint | null {
  const targetWords = tokenize(target);
  const heard = new Set(tokenize(transcript));
  if (targetWords.length === 0 || heard.size === 0) return null;
  const missing = targetWords.filter((w) => !heard.has(w));
  const found = (targetWords.length - missing.length) / targetWords.length;
  return { missing, level: found >= 0.8 ? 'close' : found >= 0.4 ? 'partial' : 'far' };
}
