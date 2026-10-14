import { aiRequestSchema, REVIEW_WRITING_PROMPT_MAX_CHARS } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { examResult } from '@/features/exam/exam-fixtures';
import { writingFeedbackLevel, writingFeedbackRequest } from './writing-feedback';

const result = examResult();
const essay = result.review[3]!;

describe('writingFeedbackRequest', () => {
  it('builds a valid review_writing request from an essay review item', () => {
    const request = writingFeedbackRequest(result, essay);
    expect(request).toEqual({
      task: 'review_writing',
      language: 'ko',
      level: 'topik4',
      prompt: `${essay.prompt.instruction_vi}\n\n${essay.prompt.stem}`,
      answer: essay.answer,
      rubric: essay.rubric,
    });
    expect(aiRequestSchema.safeParse(request).success).toBe(true);
  });

  it('includes the passage and trims the prompt to the contract limit', () => {
    const long = { ...essay, prompt: { ...essay.prompt, passage: '표'.repeat(2000) } };
    const request = writingFeedbackRequest(result, long);
    expect(request?.task === 'review_writing' && request.prompt).toContain('표표표');
    expect(request?.task === 'review_writing' && request.prompt.length).toBe(REVIEW_WRITING_PROMPT_MAX_CHARS);
    expect(aiRequestSchema.safeParse(request).success).toBe(true);
  });

  it('is null for non-essays, blank or too-long essays and missing rubrics', () => {
    expect(writingFeedbackRequest(result, result.review[0]!)).toBeNull();
    expect(writingFeedbackRequest(result, { ...essay, answer: null })).toBeNull();
    expect(writingFeedbackRequest(result, { ...essay, answer: '   ' })).toBeNull();
    expect(writingFeedbackRequest(result, { ...essay, answer: 'a'.repeat(1501) })).toBeNull();
    expect(writingFeedbackRequest(result, { ...essay, rubric: null })).toBeNull();
    expect(writingFeedbackRequest(result, { ...essay, rubric: [] })).toBeNull();
  });

  it('keeps only rubric rows the contract accepts', () => {
    const rubric = [...essay.rubric!, { key: 'Bad Key', label_vi: 'x', description_vi: 'y', max_points: 3 }];
    const request = writingFeedbackRequest(result, { ...essay, rubric });
    expect(request?.task === 'review_writing' && request.rubric).toEqual(essay.rubric);
  });
});

describe('writingFeedbackLevel', () => {
  it('uses the CEFR level of the form, a typical TOPIK level otherwise', () => {
    expect(writingFeedbackLevel(result)).toBe('topik4');
    expect(writingFeedbackLevel({ ...result, family: 'topik_i' })).toBe('topik2');
    const cefr = { ...result, family: 'cefr' as const, cefr_sections: [{ section: 'reading' as const, level_code: 'b1', reached: true }] };
    expect(writingFeedbackLevel(cefr)).toBe('b1');
    expect(writingFeedbackLevel({ ...cefr, cefr_sections: null })).toBe('a2');
  });
});
