// Spec 6.9: an order-aware, word-by-word view of how a (possibly wrong) speech-to-text transcript lines up with the
// target sentence. It only says which words were heard, heard nearly, heard as something else, or not heard. There is
// deliberately no numeric score, percentage or grade here, and nothing is inferred about the learner's level.

/** Kana and Han: Japanese/Chinese write without spaces, so these are compared character by character. Hangul is not. */
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const HANGUL_WORD = /^[가-힣]+$/;
const LATIN_WORD = /^[\p{Script=Latin}']+$/u;

export interface AlignUnit {
  /** As written in the sentence (case kept, punctuation dropped). */
  text: string;
  /** Lowercased form used for comparing. */
  norm: string;
  /** A single kana/Han character: rendered without a space next to another one. */
  cjk: boolean;
}

export type MarkKind = 'match' | 'near' | 'misheard' | 'missed';

export interface TargetMark extends AlignUnit {
  kind: MarkKind;
  /** What the transcript had in this place, for `near` and `misheard`. */
  heard?: string;
}

export interface Alignment {
  /** `char` when the target has kana/Han and is compared character by character. */
  unit: 'word' | 'char';
  /** One mark per target unit, in sentence order. */
  target: TargetMark[];
  /** Words in the transcript that line up with nothing in the target, in order. */
  extra: string[];
}

function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'");
}

/**
 * Splits text into comparable units: words for space-separated scripts, single characters for kana/Han runs.
 * Same rules as `tokenize` in overlap.ts for the words themselves.
 */
export function units(text: string): AlignUnit[] {
  const out: AlignUnit[] = [];
  for (const raw of normalizeApostrophes(text).split(/[^\p{L}\p{N}']+/u)) {
    const word = raw.replace(/^'+|'+$/g, '');
    if (!word) continue;
    let latinRun = '';
    const flush = () => {
      if (latinRun) out.push({ text: latinRun, norm: latinRun.toLowerCase(), cjk: false });
      latinRun = '';
    };
    for (const ch of word) {
      if (CJK_CHAR.test(ch)) {
        flush();
        out.push({ text: ch, norm: ch, cjk: true });
      } else {
        latinRun += ch;
      }
    }
    flush();
  }
  return out;
}

function levenshtein<T>(a: readonly T[], b: readonly T[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function commonPrefix(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Splits Hangul syllables into initial/medial/final jamo indices, so 갔 and 갓 differ by one piece, not one syllable. */
function jamo(word: string): string[] {
  const out: string[] = [];
  for (const ch of word) {
    const code = ch.charCodeAt(0) - 0xac00;
    out.push(`L${Math.floor(code / 588)}`, `V${Math.floor((code % 588) / 28)}`);
    if (code % 28) out.push(`T${code % 28}`);
  }
  return out;
}

/**
 * Two different words that are probably the same word said or transcribed a little differently.
 * Korean: same stem with another particle or ending (저는/저도, 학교에/학교에서), or one syllable or two jamo off.
 * English: same start with a short ending added (cup/cups, walk/walked), or a one-letter slip in a longer word.
 */
export function isNearMatch(target: string, heard: string): boolean {
  if (target === heard) return false;
  if (HANGUL_WORD.test(target) && HANGUL_WORD.test(heard)) {
    const a = [...target];
    const b = [...heard];
    const shorter = Math.min(a.length, b.length);
    if (commonPrefix(a, b) >= Math.max(1, Math.ceil(shorter / 2))) return true;
    if (shorter < 2) return false;
    return levenshtein(a, b) <= 1 || levenshtein(jamo(target), jamo(heard)) <= 2;
  }
  if (LATIN_WORD.test(target) && LATIN_WORD.test(heard)) {
    const a = [...target];
    const b = [...heard];
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    if (shorter >= 3 && commonPrefix(a, b) === shorter && longer - shorter <= 3) return true;
    return shorter >= 4 && levenshtein(a, b) <= 1;
  }
  return false;
}

const COST = { match: 0, near: 0.4, sub: 1.2, gap: 1 } as const;
type Step = 'diag' | 'up' | 'left';

/**
 * Lines the transcript up with the target in order (weighted edit distance over units) and marks every target unit.
 * Returns null when either side has nothing to compare.
 */
export function alignToTarget(target: string, transcript: string): Alignment | null {
  const t = units(target);
  const unit: Alignment['unit'] = t.some((u) => u.cjk) ? 'char' : 'word';
  const h = units(transcript);
  if (t.length === 0 || h.length === 0) return null;

  const n = t.length;
  const m = h.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const step: Step[][] = Array.from({ length: n + 1 }, () => new Array<Step>(m + 1).fill('diag'));
  for (let i = 1; i <= n; i++) {
    cost[i]![0] = i * COST.gap;
    step[i]![0] = 'up';
  }
  for (let j = 1; j <= m; j++) {
    cost[0]![j] = j * COST.gap;
    step[0]![j] = 'left';
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const a = t[i - 1]!.norm;
      const b = h[j - 1]!.norm;
      const pair = a === b ? COST.match : isNearMatch(a, b) ? COST.near : COST.sub;
      const diag = cost[i - 1]![j - 1]! + pair;
      const up = cost[i - 1]![j]! + COST.gap;
      const left = cost[i]![j - 1]! + COST.gap;
      // Ties prefer pairing words up, then a missing target word over an extra heard one.
      if (diag <= up && diag <= left) {
        cost[i]![j] = diag;
        step[i]![j] = 'diag';
      } else if (up <= left) {
        cost[i]![j] = up;
        step[i]![j] = 'up';
      } else {
        cost[i]![j] = left;
        step[i]![j] = 'left';
      }
    }
  }

  const marks: TargetMark[] = [];
  const extra: string[] = [];
  let i = n;
  let j = m;
  // Character mode: heard characters just before a mis-heard one read as one word (わたし for 私), so they join it.
  let joinHeard = false;
  while (i > 0 || j > 0) {
    const s = step[i]![j]!;
    if (i > 0 && j > 0 && s === 'diag') {
      const tu = t[i - 1]!;
      const hu = h[j - 1]!;
      if (tu.norm === hu.norm) marks.push({ ...tu, kind: 'match' });
      else marks.push({ ...tu, kind: isNearMatch(tu.norm, hu.norm) ? 'near' : 'misheard', heard: hu.text });
      joinHeard = unit === 'char' && tu.cjk && hu.cjk && marks[marks.length - 1]!.kind === 'misheard';
      i--;
      j--;
    } else if (i > 0 && (s === 'up' || j === 0)) {
      marks.push({ ...t[i - 1]!, kind: 'missed' });
      joinHeard = false;
      i--;
    } else {
      const hu = h[j - 1]!;
      const last = marks[marks.length - 1];
      if (joinHeard && hu.cjk && last) last.heard = hu.text + (last.heard ?? '');
      else {
        extra.push(hu.text);
        joinHeard = false;
      }
      j--;
    }
  }
  return { unit, target: marks.reverse(), extra: extra.reverse() };
}

/** Joins units the way they are written: no space between two kana/Han characters, a space otherwise. */
export function joinUnits(list: readonly AlignUnit[]): string {
  return list.reduce((s, u, k) => (k === 0 ? u.text : s + (u.cjk && list[k - 1]!.cjk ? '' : ' ') + u.text), '');
}

/**
 * Up to `max` short bits of the target worth listening to again: words that were not heard or heard as something
 * else, in sentence order, without repeats. In `char` mode neighbouring characters are kept together as one phrase.
 */
export function practiceTargets(alignment: Alignment, max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (text: string) => {
    const key = text.toLowerCase();
    if (out.length < max && !seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
  };
  let run: TargetMark[] = [];
  const flushRun = () => {
    if (run.length) add(joinUnits(run));
    run = [];
  };
  for (const mark of alignment.target) {
    const needsWork = mark.kind === 'missed' || mark.kind === 'misheard';
    if (alignment.unit === 'char' && mark.cjk) {
      if (needsWork) run.push(mark);
      else flushRun();
    } else {
      flushRun();
      if (needsWork) add(mark.text);
    }
  }
  flushRun();
  return out;
}
