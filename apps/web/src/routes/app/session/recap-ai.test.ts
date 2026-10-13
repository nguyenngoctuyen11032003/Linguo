import { describe, expect, it } from 'vitest';
import { aiRequestSchema } from '@linguo/shared';
import { LESSON_A, mistake } from '@/features/session/session-fixtures';
import { recapAiState } from './recap-ai';

const learner = { language: 'ko' as const, level: 'hangul' };

describe('recapAiState', () => {
  it('analyzes the error when the answer key is known, a give-up as an empty answer', () => {
    const state = recapAiState(mistake(1, { prompt_text: 'Q', expected_answer: 'A', learner_answer: null }), learner);
    expect(state?.request).toEqual({ task: 'analyze_error', language: 'ko', level: 'hangul', lesson_id: LESSON_A, prompt: 'Q', expected: 'A', answer: '' });
    expect(state?.fallback).toEqual({ title: 'Đáp án đúng', body: 'A' });
    expect(aiRequestSchema.safeParse(state?.request).success).toBe(true);
  });

  it('explains the question when the answer key was never revealed, and clips long text', () => {
    const state = recapAiState(mistake(1, { prompt_text: 'x'.repeat(400), expected_answer: null, learner_answer: 'y' }), learner);
    expect(state?.request).toMatchObject({ task: 'explain_concept', context: 'Người học trả lời: y' });
    expect(state?.fallback).toBeUndefined();
    expect(aiRequestSchema.safeParse(state?.request).success).toBe(true);
  });

  it('offers nothing without a question', () => {
    expect(recapAiState(mistake(1, { prompt_text: ' ' }), learner)).toBeNull();
  });
});
