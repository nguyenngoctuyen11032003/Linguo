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

/** Whitespace for trim/collapse: ASCII space, \t \n \v \f \r, NO-BREAK SPACE, IDEOGRAPHIC SPACE. */
export const EXAM_WHITESPACE = ' \t\n\u000b\f\r 　';
/** Stripped from the end of a short_text answer (any run of them). */
export const EXAM_TRAILING_PUNCTUATION = '.?!,;:。、…';

const LEADING_WS = /^[ \t\n\v\f\r 　]+/u;
const TRAILING_WS = /[ \t\n\v\f\r 　]+$/u;
const WS_RUN = /[ \t\n\v\f\r 　]+/gu;
const TRAILING_PUNCT = /[.?!,;:。、…]+$/u;

export function normalizeExamText(s: string): string {
  return s
    .normalize('NFC')
    .replace(LEADING_WS, '')
    .replace(TRAILING_WS, '')
    .replace(WS_RUN, ' ')
    .replace(TRAILING_PUNCT, '')
    .toLowerCase();
}

/**
 * Grades one saved answer against its key.
 * - mcq: `key` is the correct option id; exact id match.
 * - short_text: `key` lists accepted answers; correct when normalizeExamText(answer) equals the
 *   normalised form of any of them (an answer that normalises to "" is never correct).
 * - essay: not auto-graded → null.
 * A missing answer (null) is incorrect for mcq and short_text.
 */
export function gradeExamAnswer(kind: ExamQuestionKind, answer: string | null, key: string | readonly string[] | null): boolean | null {
  if (kind === 'essay') return null;
  if (answer === null) return false;
  if (kind === 'mcq') return typeof key === 'string' && answer === key;
  if (!Array.isArray(key)) return false;
  const given = normalizeExamText(answer);
  if (given === '') return false;
  return key.some((accepted) => normalizeExamText(accepted) === given);
}
