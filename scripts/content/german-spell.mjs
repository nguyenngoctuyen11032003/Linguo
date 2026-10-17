// Offline German spelling for the content lint (german-lint.mjs): nspell + the igerman98 Hunspell dictionary
// (dictionary-de), plus what nspell lacks: compound words and the project allow-lists.
//
// Why not plain nspell:
//  - nspell has no compound support, but German is mostly compounds (Straßenbahn, Hausaufgabe): we split a
//    word into dictionary words ourselves (with linking elements -s/-es/-n/-en/-e/-er) in `isCompound`.
//  - igerman98 lists many words twice: once as the real word and once as a lowercase "only inside
//    compounds" form (flag `o`, e.g. `gehen/DIVXW` and `gehen/Sozm`, `dusche/Nozm`). nspell merges the flags
//    of every line (and of forms derived by affixes, e.g. dusche from duschen), so the merged word carries
//    `o` and is rejected ("gut", "gehen", "schwimmen", "dusche" all came out wrong). `fixDictionary` drops
//    all `o` lines. Lowercase nouns (`tisch/...ozm`) then have no entry at all, which is what keeps
//    "tisch" a spelling error (reported as a capitalisation error).
import { BUILTIN_ALLOW } from './german-data.mjs';

const UPPER_FIRST = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const LOWER_FIRST = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const LINKS = ['s', 'es', 'n', 'en', 'e', 'er', 'ens'];
/** Two-letter compound parts that are real words (Ei, Öl); every other part needs ≥ 3 letters. */
const SHORT_PARTS = new Set(['ei', 'öl', 'tv', 'pc']);
/** Two-letter verb prefixes (anrufen, zumachen) allowed as the first part of a compound. */
const VERB_PREFIXES = new Set(['ab', 'an', 'zu', 'um']);

/**
 * Drops every `o` (ONLYINCOMPOUND) and `h` (NEEDAFFIX pseudo-root) line: nspell honours neither, so such lines
 * would make bare compound pieces valid ("tisch") or shadow derived forms. Exported for tests.
 */
export function fixDictionary(dicText) {
  const lines = dicText.split(/\r?\n/);
  lines.shift(); // entry count
  const flagsOf = (line) => (line.includes('/') ? line.split('/')[1].split(/\s/)[0] : '');
  const kept = lines.filter((line) => line && !/[oh]/.test(flagsOf(line)));
  return `${kept.length}\n${kept.join('\n')}\n`;
}

/** The grader folds ä→ae, ö→oe, ü→ue, ß→ss after NFC + lowercase (packages/shared grading, de rules). */
export function foldDigraphs(s) {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss');
}

/** Candidate umlaut/ß spellings of a digraph-spelled word (ae→ä, oe→ö, ue→ü, ss→ß, any subset). */
export function restoreDigraphs(word) {
  const spots = [];
  const re = /ae|oe|ue|ss|Ae|Oe|Ue/g;
  let m;
  while ((m = re.exec(word)) !== null) spots.push([m.index, m[0]]);
  if (spots.length === 0 || spots.length > 6) return [];
  const map = { ae: 'ä', oe: 'ö', ue: 'ü', ss: 'ß', Ae: 'Ä', Oe: 'Ö', Ue: 'Ü' };
  const out = [];
  for (let mask = 1; mask < 1 << spots.length; mask++) {
    let res = '';
    let last = 0;
    spots.forEach(([i, d], bit) => {
      res += word.slice(last, i) + (mask & (1 << bit) ? map[d] : d);
      last = i + 2;
    });
    out.push(res + word.slice(last));
  }
  return out;
}

/**
 * Creates the speller. `words`: allow-list entries (`Word` or `Word/Model`, the latter inflects like the
 * dictionary word Model). Resolves to `{ ok, check, exactEntry, sp, allow }`.
 */
export async function createSpeller({ words = [] } = {}) {
  const dictionary = (await import('dictionary-de')).default;
  const nspell = (await import('nspell')).default;
  const dic = fixDictionary(Buffer.from(dictionary.dic).toString('utf8'));
  const sp = nspell({ aff: Buffer.from(dictionary.aff), dic });

  const allow = new Set();
  const addWord = (entry) => {
    const [word, model] = entry.split('/');
    if (!word) return;
    allow.add(word.toLowerCase());
    if (model && sp.correct(model)) sp.add(word, model);
    // Short entries (abbreviations: Str, Std) must not become compound pieces (Str+asse).
    else if (word.length >= 4) sp.add(word);
  };
  for (const w of BUILTIN_ALLOW) addWord(w);
  for (const w of words) addWord(w);

  const cache = new Map();
  const correct = (w) => {
    let v = cache.get(w);
    if (v === undefined) {
      v = sp.correct(w);
      cache.set(w, v);
    }
    return v;
  };

  /** A compound part: a dictionary word (any case) or word + linking element / verb stem. */
  const knownPart = (part, last, nounLike, first = false) => {
    if (part.length < 2) return false;
    if (part.length < 3 && !SHORT_PARTS.has(part.toLowerCase()) && !(first && VERB_PREFIXES.has(part))) return false;
    if (last) {
      // The head of a noun compound is checked capitalised; of a lowercase compound lowercase only.
      return nounLike ? correct(UPPER_FIRST(part)) : correct(LOWER_FIRST(part));
    }
    const variants = (p) => (nounLike ? [UPPER_FIRST(p), LOWER_FIRST(p)] : [LOWER_FIRST(p), UPPER_FIRST(p)]);
    const stems = new Set([part]);
    for (const link of LINKS) if (part.length - link.length >= 3 && part.endsWith(link)) stems.add(part.slice(0, -link.length));
    for (const stem of [...stems]) for (const add of ['e', 'en', 'n']) stems.add(stem + add);
    for (const stem of stems) for (const v of variants(stem)) if (correct(v)) return true;
    return false;
  };

  const compoundMemo = new Map();
  /** True when `word` splits into ≥ 2 dictionary words (with linking elements). */
  const isCompound = (word) => {
    if (compoundMemo.has(word)) return compoundMemo.get(word);
    const nounLike = word.charAt(0) !== word.charAt(0).toLowerCase();
    const memo = new Map();
    const split = (start) => {
      if (memo.has(start)) return memo.get(start);
      let res = false;
      for (let end = start + 2; end <= word.length && !res; end++) {
        const part = word.slice(start, end);
        if (end === word.length) res = start > 0 && knownPart(part, true, nounLike);
        else if (knownPart(part, false, nounLike, start === 0)) res = split(end);
      }
      memo.set(start, res);
      return res;
    };
    const res = word.length >= 6 && split(0);
    compoundMemo.set(word, res);
    return res;
  };

  /** Spelling of one word token (letters only, may contain ß/umlauts). */
  const ok = (token) => allow.has(token.toLowerCase()) || correct(token) || isCompound(token) || isVerbForm(token);

  /** Verb forms the dictionary lacks: bare-stem imperative (geh, schließ) and zu-infinitive (aufzustehen). */
  const isVerbForm = (word) => {
    // A sentence-initial imperative is capitalised (Schließ bitte…); other capitalised words are not verb forms.
    const token = word === UPPER_FIRST(word.toLowerCase()) ? word.toLowerCase() : word;
    if (token !== token.toLowerCase() || token.length < 3) return false;
    if (Object.hasOwn(sp.data, `${token}en`)) return true;
    // aufzustehen = auf + zu + stehen; zuzuklappen = zu + zu + klappen
    for (let i = 2; i < token.length - 3; i++) {
      if (token.startsWith('zu', i) && token.endsWith('n')) {
        const infinitive = token.slice(0, i) + token.slice(i + 2);
        if (correct(infinitive) || isCompound(infinitive)) return true;
      }
    }
    return false;
  };

  /**
   * Explains why `token` is wrong: { kind: 'digraph' | 'capital' | 'unknown', suggestions }.
   * Returns null when the token is fine.
   */
  const check = (token) => {
    if (ok(token)) {
      // A compound that only parses because a part (Strass) looks like the digraph of ß: Strassenbahn.
      if (!correct(token) && /ss/.test(token)) {
        const eszett = token.replaceAll('ss', 'ß');
        if (eszett !== token && ok(eszett)) return { kind: 'digraph', suggestions: [eszett] };
      }
      return null;
    }
    if (token === token.toLowerCase()) {
      const cap = UPPER_FIRST(token);
      if (ok(cap)) return { kind: 'capital', suggestions: [cap] };
    }
    const restored = restoreDigraphs(token).filter((v) => ok(v));
    if (restored.length) return { kind: 'digraph', suggestions: restored.slice(0, 3) };
    try {
      return { kind: 'unknown', suggestions: sp.suggest(token).slice(0, 3) };
    } catch {
      return { kind: 'unknown', suggestions: [] };
    }
  };

  /** True when the dictionary itself lists `token` with exactly this capitalisation (a word form, not a compound). */
  const exactEntry = (token) => Object.hasOwn(sp.data, token);

  return { ok, check, sp, exactEntry, allow };
}
