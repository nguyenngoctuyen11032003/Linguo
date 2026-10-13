import {
  isGiveUp,
  type AnswerLang,
  type ChoiceAnswer,
  type ChoiceResponse,
  type ExerciseAnswer,
  type ExerciseResponse,
  type ExerciseType,
  type FillBlankAnswer,
  type FillBlankResponse,
  type KnownWrong,
  type Rubric,
  type TextResponse,
  type TranslateAnswer,
  type Verdict,
  type WordBankAnswer,
  type WordBankResponse,
} from './exercises';

// Spec 2 §5.3–5.4 and the normative "Grading algorithm" in the spec 2 plan.
// Mirrored in SQL by public.grading_normalize / public.grade_exercise; both
// must pass every case in grading.fixtures.json.

const IGNORED_PUNCTUATION = /[.,!?;:"()[\]{}…。、「」『』«»¿¡？！，]/gu;
const TRAILING_PUNCTUATION = /[.!?…。？！]+$/u;

const CONTRACTIONS: Record<string, string> = {
  'can not': 'cannot',
  "can't": 'cannot',
  "won't": 'will not',
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "couldn't": 'could not',
  "shouldn't": 'should not',
  "wouldn't": 'would not',
  "i'll": 'i will',
  "you'll": 'you will',
  "we'll": 'we will',
  "they'll": 'they will',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'd": 'i would',
};
const CONTRACTION_RE = new RegExp(
  `\\b(${Object.keys(CONTRACTIONS)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g',
);

/** Old-style Vietnamese tone placement → new style, only at the end of a word. */
const VI_TONES: Record<string, string> = {
  oà: 'òa',
  oá: 'óa',
  oả: 'ỏa',
  oã: 'õa',
  oạ: 'ọa',
  oè: 'òe',
  oé: 'óe',
  oẻ: 'ỏe',
  oẽ: 'õe',
  oẹ: 'ọe',
  uỳ: 'ùy',
  uý: 'úy',
  uỷ: 'ủy',
  uỹ: 'ũy',
  uỵ: 'ụy',
};
const VI_TONE_RE = new RegExp(`(${Object.keys(VI_TONES).join('|')})(?!\\p{L})`, 'gu');

const collapse = (s: string) => s.replace(/\s+/gu, ' ').trim();

export function normalizeAnswer(input: string, lang: AnswerLang, rubric: Rubric): string {
  let s = input.normalize('NFC').toLowerCase();
  s = s.replace(/[’‘`´]/gu, "'").replace(/[“”„]/gu, '"');
  s = rubric.punctuation === 'ignore' ? s.replace(IGNORED_PUNCTUATION, ' ') : s.replace(TRAILING_PUNCTUATION, '');
  s = collapse(s);
  if (lang === 'en' && rubric.expand_contractions) s = s.replace(CONTRACTION_RE, (m) => CONTRACTIONS[m] ?? m);
  if (lang === 'vi') s = s.replace(VI_TONE_RE, (m) => VI_TONES[m] ?? m);
  return collapse(s);
}

/** NFD, drop combining marks, map đ/Đ to d. */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/gu, 'd').normalize('NFC');
}

/** Levenshtein distance over code points. */
export function levenshtein(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length]!;
}

export interface GradeInput {
  type: ExerciseType;
  answer: ExerciseAnswer;
  rubric: Rubric;
  knownWrong: KnownWrong[];
  lang: AnswerLang;
}

export interface GradeResult {
  verdict: Verdict;
  score: number;
  errorTags: string[];
  feedbackVi: string | null;
}

const SCORES: Record<Verdict, number> = { correct: 1, almost: 0.8, incorrect: 0 };
const RANK: Record<Verdict, number> = { correct: 2, almost: 1, incorrect: 0 };

const result = (verdict: Verdict, errorTags: string[] = [], feedbackVi: string | null = null): GradeResult => ({
  verdict,
  score: SCORES[verdict],
  errorTags,
  feedbackVi,
});

const ARTICLES = new Set(['a', 'an', 'the']);
const TYPO_EXCLUDED = new Set(['a', 'an', 'the', 'am', 'is', 'are']);
const KO_PARTICLE_PAIRS: [string, string][] = [
  ['이에요', '예요'],
  ['으로', '로'],
  ['은', '는'],
  ['이', '가'],
  ['을', '를'],
  ['와', '과'],
];

const noSpaces = (s: string) => s.replace(/ /gu, '');
const withoutArticles = (s: string) =>
  s
    .split(' ')
    .filter((t) => !ARTICLES.has(t))
    .join(' ');

function isSingleTypo(r: string, a: string): boolean {
  const rt = r.split(' ');
  const at = a.split(' ');
  if (rt.length !== at.length) return false;
  const diffs: number[] = [];
  for (let i = 0; i < rt.length; i++) if (rt[i] !== at[i]) diffs.push(i);
  if (diffs.length !== 1) return false;
  const x = rt[diffs[0]!]!;
  const y = at[diffs[0]!]!;
  if (Array.from(x).length < 5 || Array.from(y).length < 5) return false;
  if (TYPO_EXCLUDED.has(x) || TYPO_EXCLUDED.has(y)) return false;
  return levenshtein(x, y) === 1;
}

/** Swapping one word-final particle of `a` for its allomorph yields `r` (spaces ignored). */
function isParticleAllomorph(r: string, a: string): boolean {
  const target = noSpaces(r);
  for (const [p, q] of KO_PARTICLE_PAIRS) {
    for (const [from, to] of [
      [p, q],
      [q, p],
    ] as const) {
      let i = a.indexOf(from);
      while (i !== -1) {
        const end = i + from.length;
        if (end === a.length || a[end] === ' ') {
          if (noSpaces(a.slice(0, i) + to + a.slice(end)) === target) return true;
        }
        i = a.indexOf(from, i + 1);
      }
    }
  }
  return false;
}

function gradeText(response: string | undefined, accepted: string[], input: GradeInput): GradeResult {
  const { lang, rubric, knownWrong } = input;
  const r = normalizeAnswer(response ?? '', lang, rubric);
  if (r === '') return result('incorrect');
  const as = accepted.map((a) => normalizeAnswer(a, lang, rubric));

  if (as.includes(r)) return result('correct');
  const kw = knownWrong.find((k) => normalizeAnswer(k.answer, lang, rubric) === r);
  if (kw) return result('incorrect', [kw.error_tag], kw.feedback_vi);
  if (lang === 'en') {
    const rNoArt = withoutArticles(r);
    if (as.some((a) => withoutArticles(a) === rNoArt)) return result('incorrect', ['article']);
    if (rubric.typo_tolerance === 1 && as.some((a) => isSingleTypo(r, a))) return result('almost', ['typo']);
  }
  if (lang === 'ko') {
    if (rubric.ko_spacing === 'lenient' && as.some((a) => noSpaces(a) === noSpaces(r))) return result('almost', ['spacing']);
    if (as.some((a) => isParticleAllomorph(r, a))) return result('incorrect', ['particle_allomorph']);
  }
  if (lang === 'vi' && rubric.diacritics === 'lenient') {
    const rs = stripDiacritics(r);
    if (as.some((a) => stripDiacritics(a) === rs)) return result('almost', ['missing_diacritics']);
  }
  return result('incorrect');
}

export function gradeResponse(input: GradeInput, response: ExerciseResponse): GradeResult {
  if (isGiveUp(response)) return result('incorrect');
  switch (input.type) {
    case 'mcq':
    case 'listen': {
      const ok = (response as ChoiceResponse).option_id === (input.answer as ChoiceAnswer).correct_option_id;
      return result(ok ? 'correct' : 'incorrect');
    }
    case 'word_bank': {
      const ids = (response as WordBankResponse).token_ids ?? [];
      const ok = (input.answer as WordBankAnswer).orders.some(
        (order) => order.length === ids.length && order.every((id, i) => id === ids[i]),
      );
      return result(ok ? 'correct' : 'incorrect');
    }
    case 'translate':
      return gradeText((response as TextResponse).text, (input.answer as TranslateAnswer).accepted, input);
    case 'fill_blank': {
      const given = (response as FillBlankResponse).blanks ?? {};
      let verdict: Verdict = 'correct';
      const tags: string[] = [];
      let feedback: string | null = null;
      for (const [id, accepted] of Object.entries((input.answer as FillBlankAnswer).blanks)) {
        const r = gradeText(given[id], accepted, input);
        if (RANK[r.verdict] < RANK[verdict]) verdict = r.verdict;
        for (const t of r.errorTags) if (!tags.includes(t)) tags.push(t);
        feedback ??= r.feedbackVi;
      }
      return result(verdict, tags, feedback);
    }
  }
}
