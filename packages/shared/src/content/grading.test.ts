import { describe, expect, it } from 'vitest';
import fixtures from './grading.fixtures.json';
import { DEFAULT_RUBRIC, type AnswerLang, type ExerciseAnswer, type ExerciseResponse, type ExerciseType, type KnownWrong, type Rubric, type Verdict } from './exercises';
import { gradeResponse, levenshtein, normalizeAnswer, stripDiacritics } from './grading';

const SCORES: Record<Verdict, number> = { correct: 1, almost: 0.8, incorrect: 0 };
const rubricOf = (r: object | undefined): Rubric => ({ ...DEFAULT_RUBRIC, ...(r as Partial<Rubric> | undefined) });

describe('normalizeAnswer (shared fixtures, mirrored by SQL)', () => {
  for (const c of fixtures.normalize) {
    it(c.name, () => {
      expect(normalizeAnswer(c.input, c.lang as AnswerLang, rubricOf(c.rubric))).toBe(c.expected);
    });
  }
});

describe('gradeResponse (shared fixtures, mirrored by SQL)', () => {
  for (const c of fixtures.grade) {
    it(c.name, () => {
      const kw = 'known_wrong' in c ? (c.known_wrong as KnownWrong[]) : [];
      const result = gradeResponse(
        {
          type: c.type as ExerciseType,
          answer: c.answer as ExerciseAnswer,
          rubric: rubricOf('rubric' in c ? c.rubric : undefined),
          knownWrong: kw,
          lang: c.lang as AnswerLang,
        },
        c.response as ExerciseResponse,
      );
      const verdict = c.expected.verdict as Verdict;
      expect(result).toEqual({
        verdict,
        score: SCORES[verdict],
        errorTags: c.expected.error_tags,
        feedbackVi: c.expected.feedback_vi,
      });
    });
  }
});

describe('grading helpers', () => {
  it('stripDiacritics drops marks and maps đ/Đ to d', () => {
    expect(stripDiacritics('Đường đẹp quá')).toBe('duong dep qua');
  });

  it('levenshtein counts single edits', () => {
    expect(levenshtein('teacher', 'teachr')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('known_wrong is checked after accepted answers', () => {
    const r = gradeResponse(
      {
        type: 'translate',
        answer: { accepted: ['Hello'] },
        rubric: DEFAULT_RUBRIC,
        knownWrong: [{ answer: 'hello', feedback_vi: 'x', error_tag: 'oops' }],
        lang: 'en',
      },
      { text: 'Hello!' },
    );
    expect(r.verdict).toBe('correct');
  });

  it('fill_blank takes the worst blank, unions tags and keeps the first feedback', () => {
    const r = gradeResponse(
      {
        type: 'fill_blank',
        answer: { blanks: { b1: ['teacher'], b2: ['is'], b3: ['student'] } },
        rubric: { ...DEFAULT_RUBRIC, typo_tolerance: 1 },
        knownWrong: [{ answer: 'are', feedback_vi: 'Dùng is.', error_tag: 'be_agreement' }],
        lang: 'en',
      },
      { blanks: { b1: 'teachr', b2: 'are', b3: 'studnt' } },
    );
    expect(r).toEqual({ verdict: 'incorrect', score: 0, errorTags: ['typo', 'be_agreement'], feedbackVi: 'Dùng is.' });
  });

  it('typo tolerance ignores be/article tokens', () => {
    const r = gradeResponse(
      { type: 'translate', answer: { accepted: ['They are happy'] }, rubric: { ...DEFAULT_RUBRIC, typo_tolerance: 1 }, knownWrong: [], lang: 'en' },
      { text: 'They ar happy' },
    );
    expect(r.verdict).toBe('incorrect');
  });

  it('give up on a choice exercise is incorrect', () => {
    const r = gradeResponse(
      { type: 'mcq', answer: { correct_option_id: 'a' }, rubric: DEFAULT_RUBRIC, knownWrong: [], lang: 'en' },
      { give_up: true },
    );
    expect(r.verdict).toBe('incorrect');
  });
});
