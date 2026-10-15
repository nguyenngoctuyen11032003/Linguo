import { describe, expect, it } from 'vitest';
import { LEVELS } from '../learning/levels';
import {
  AI_LEVELS,
  AI_OUTPUT_SCHEMAS,
  AI_REQUEST_MAX_BYTES,
  AI_TASKS,
  REVIEW_WRITING_ANSWER_MAX_CHARS,
  REVIEW_WRITING_PROMPT_MAX_CHARS,
  aiRequestSchema,
  aiSuccessSchema,
  reviewWritingOutputSchema,
} from './contract';

const rubric = [
  { key: 'content', label_vi: 'Nội dung', description_vi: 'Trả lời đủ ba ý.', max_points: 4 },
  { key: 'language', label_vi: 'Ngôn ngữ', description_vi: 'Ngữ pháp và chính tả đúng.', max_points: 3 },
];

const request = {
  task: 'review_writing',
  language: 'en',
  level: 'a2',
  prompt: 'Write an email to Alex about a film.',
  answer: 'Hi Alex, lets watch a film on Saturday at 6.',
  rubric,
};

const output = {
  criteria: [
    { key: 'content', points: 3, comment_vi: 'Bạn nêu được phim và giờ gặp, còn thiếu chỗ gặp.' },
    { key: 'language', points: 2, comment_vi: 'Cần viết "Let\'s" có dấu nháy.' },
  ],
  overall_vi: 'Bài viết rõ ý, cần bổ sung chỗ gặp.',
  corrected_version: "Hi Alex, let's watch a film on Saturday at 6 outside the cinema.",
};

describe('review_writing contract', () => {
  it('is a known task with an output schema', () => {
    expect(AI_TASKS).toContain('review_writing');
    expect(AI_OUTPUT_SCHEMAS.review_writing).toBe(reviewWritingOutputSchema);
  });

  it('accepts a well-formed request and trims text', () => {
    const parsed = aiRequestSchema.parse({ ...request, answer: `  ${request.answer}  ` });
    expect(parsed.task).toBe('review_writing');
    if (parsed.task === 'review_writing') expect(parsed.answer).toBe(request.answer);
  });

  it('rejects too-long essays and prompts, blank answers and client-chosen extras', () => {
    expect(aiRequestSchema.safeParse({ ...request, answer: 'x'.repeat(REVIEW_WRITING_ANSWER_MAX_CHARS + 1) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, answer: 'x'.repeat(REVIEW_WRITING_ANSWER_MAX_CHARS) }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...request, prompt: 'x'.repeat(REVIEW_WRITING_PROMPT_MAX_CHARS + 1) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, answer: '   ' }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, model: 'gemini-pro' }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, language: 'fr' }).success).toBe(false);
  });

  it('validates the rubric: 1–6 criteria, unique snake_case keys, bounded points', () => {
    expect(aiRequestSchema.safeParse({ ...request, rubric: [] }).success).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...rubric[0], key: `k_${'abcdefg'[i]}` }));
    expect(aiRequestSchema.safeParse({ ...request, rubric: seven }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, rubric: [rubric[0], rubric[0]] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, rubric: [{ ...rubric[0], key: 'Bad-Key' }] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, rubric: [{ ...rubric[0], max_points: 0 }] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, rubric: [{ ...rubric[0], max_points: 31 }] }).success).toBe(false);
  });

  it('level is restricted to the CEFR / TOPIK / JLPT codes of the learning levels', () => {
    for (const lvl of [...LEVELS.en, ...LEVELS.ko, ...LEVELS.ja]) {
      expect(aiRequestSchema.safeParse({ ...request, level: lvl }).success).toBe(true);
    }
    expect(AI_LEVELS).toEqual([...LEVELS.en, ...LEVELS.ko, ...LEVELS.ja]);
    for (const bad of ['', 'ignore_all', 'A2', 'x1', 'topik7', 'a2 ', 'native', 'N5', 'n6', 'jlpt_n5']) {
      expect(aiRequestSchema.safeParse({ ...request, level: bad }).success).toBe(false);
    }
  });

  it('a maximal Korean request still fits the body limit', () => {
    const ko = {
      ...request,
      language: 'ko',
      level: 'topik4',
      prompt: '가'.repeat(REVIEW_WRITING_PROMPT_MAX_CHARS),
      answer: '나'.repeat(REVIEW_WRITING_ANSWER_MAX_CHARS),
      rubric: Array.from({ length: 6 }, (_, i) => ({
        key: `k_${'abcdef'[i]}`,
        label_vi: 'ữ'.repeat(80),
        description_vi: 'ữ'.repeat(300),
        max_points: 30,
      })),
    };
    expect(aiRequestSchema.safeParse(ko).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(ko)).byteLength).toBeLessThanOrEqual(AI_REQUEST_MAX_BYTES);
  });

  it('output: strict shape with length limits', () => {
    expect(reviewWritingOutputSchema.parse(output)).toEqual(output);
    expect(reviewWritingOutputSchema.safeParse({ ...output, score: 9 }).success).toBe(false);
    expect(reviewWritingOutputSchema.safeParse({ ...output, criteria: [] }).success).toBe(false);
    expect(reviewWritingOutputSchema.safeParse({ ...output, overall_vi: 'x'.repeat(801) }).success).toBe(false);
    expect(reviewWritingOutputSchema.safeParse({ ...output, corrected_version: 'x'.repeat(2001) }).success).toBe(false);
    const comment = { ...output.criteria[0], comment_vi: 'x'.repeat(501) };
    expect(reviewWritingOutputSchema.safeParse({ ...output, criteria: [comment] }).success).toBe(false);
    expect(reviewWritingOutputSchema.safeParse({ ...output, criteria: [{ ...output.criteria[0], points: -1 }] }).success).toBe(false);
    expect(reviewWritingOutputSchema.safeParse({ ...output, criteria: [{ ...output.criteria[0], points: 1.5 }] }).success).toBe(false);
  });

  it('success envelopes may carry the new task', () => {
    const ok = aiSuccessSchema.safeParse({
      task: 'review_writing',
      prompt_version: 'review_writing@1',
      data: output,
      cached: false,
      ai_generated: true,
      response_id: 'id',
      quota: { used: 1, limit: 20, resets_at: '2026-10-14T17:00:00.000Z' },
    });
    expect(ok.success).toBe(true);
  });
});
