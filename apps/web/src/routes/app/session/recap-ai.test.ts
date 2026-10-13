import { describe, expect, it } from 'vitest';
import { aiRequestSchema } from '@linguo/shared';
import { recapAiState } from './recap-ai';

const learner = { language: 'ko' as const, level: 'hangul' };

describe('recapAiState', () => {
  it('analyzes the error when question and answer key are known', () => {
    const state = recapAiState({ prompt: 'Q', expected: 'A', answer: '', lesson_id: null }, learner);
    expect(state?.request).toEqual({ task: 'analyze_error', language: 'ko', level: 'hangul', prompt: 'Q', expected: 'A', answer: '' });
    expect(aiRequestSchema.safeParse(state?.request).success).toBe(true);
  });

  it('explains the concept when only one side is known, and clips long text', () => {
    const state = recapAiState({ prompt: '', expected: 'x'.repeat(400), answer: 'y', lesson_id: null }, learner);
    expect(state?.request.task).toBe('explain_concept');
    expect(aiRequestSchema.safeParse(state?.request).success).toBe(true);
  });

  it('offers nothing without text', () => {
    expect(recapAiState({ prompt: ' ', expected: '', answer: 'y', lesson_id: null }, learner)).toBeNull();
  });
});
