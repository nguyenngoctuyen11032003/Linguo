import type { ExamQuestionKind } from './contract';

// Spec 9 §3 submit_exam grading, shared by TS (content checks, e2e mocks) and SQL (submit_exam).
// The SQL port must agree case for case with grading.fixtures.json (pgTAP is generated from it).
//
// normalizeExamText(s), in this order:
//   1. Unicode NFC
//   2. trim EXAM_WHITESPACE at both ends
//   3. collapse every run of EXAM_WHITESPACE to one ASCII space
//   4. strip the trailing run of characters in EXAM_TRAILING_PUNCTUATION (no re-trim afterwards)
//   5. lower-case with the Unicode default mapping (String#toLowerCase, never locale-sensitive)
//   6. language 'de' only: fold ä ö ü ß to ae oe ue ss (after lower-casing, so Ä Ö Ü ẞ are folded as well).
//      Spaces are kept; dotless forms (fur, schon) stay different. Other languages: no step 6.

/** Whitespace for trim/collapse: ASCII space, \t \n \v \f \r, NO-BREAK SPACE, IDEOGRAPHIC SPACE. */
export const EXAM_WHITESPACE = ' \t\n\u000b\f\r\u00a0\u3000';
/** Stripped from the end of a short_text answer (any run of them). */
export const EXAM_TRAILING_PUNCTUATION = '.?!,;:。、…';

const LEADING_WS = /^[ \t\n\v\f\r\u00a0\u3000]+/u;
const TRAILING_WS = /[ \t\n\v\f\r\u00a0\u3000]+$/u;
const WS_RUN = /[ \t\n\v\f\r\u00a0\u3000]+/gu;
const TRAILING_PUNCT = /[.?!,;:。、…]+$/u;

/** German digraph folding (same mapping as the SQL port): ä→ae, ö→oe, ü→ue, ß→ss. Input is lower-case NFC. */
function foldGermanDigraphs(s: string): string {
  return s.replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss');
}

/** `language` is the exam form's language_code (exam_forms.language_code); only 'de' changes the result. */
export function normalizeExamText(s: string, language?: string | null): string {
  const normalized = s
    .normalize('NFC')
    .replace(LEADING_WS, '')
    .replace(TRAILING_WS, '')
    .replace(WS_RUN, ' ')
    .replace(TRAILING_PUNCT, '')
    .toLowerCase();
  return language === 'de' ? foldGermanDigraphs(normalized) : normalized;
}

/**
 * Grades one saved answer against its key.
 * - mcq: `key` is the correct option id; exact id match.
 * - short_text: `key` lists accepted answers; correct when normalizeExamText(answer, language) equals the
 *   normalised form of any of them (an answer that normalises to "" is never correct). `language` is the
 *   form's language_code; for 'de' both sides are digraph-folded (fuer = für, Strasse = Straße).
 * - essay: not auto-graded → null.
 * A missing answer (null) is incorrect for mcq and short_text.
 */
export function gradeExamAnswer(
  kind: ExamQuestionKind,
  answer: string | null,
  key: string | readonly string[] | null,
  language?: string | null,
): boolean | null {
  if (kind === 'essay') return null;
  if (answer === null) return false;
  if (kind === 'mcq') return typeof key === 'string' && answer === key;
  if (!Array.isArray(key)) return false;
  const given = normalizeExamText(answer, language);
  if (given === '') return false;
  return key.some((accepted) => normalizeExamText(accepted, language) === given);
}
