import { describe, expect, it } from 'vitest';
import { aiRequestSchema, type LessonPayload } from '@linguo/shared';
import { clip, exercisePromptText, feedbackAiRequests, lessonAiContext, responseText, type LessonAiContext } from './ai-context';
import { makeExercise, makeResult } from './test-fixtures';

const LESSON_ID = '20000000-0000-4000-8000-000000000001';
const AI: LessonAiContext = {
  language: 'en',
  level: 'a1',
  lessonId: LESSON_ID,
  concept: 'Động từ to be — am',
  curated: { title: 'Động từ to be', body: 'I đi với am.' },
};

describe('clip', () => {
  it('collapses whitespace and cuts with an ellipsis', () => {
    expect(clip('  a \n b  ', 10)).toBe('a b');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
    expect(clip('abcdefghij', 5)).toHaveLength(5);
  });
});

describe('exercisePromptText / responseText', () => {
  it('describes each exercise type in plain text', () => {
    expect(exercisePromptText(makeExercise('mcq'))).toBe('Chọn từ có nghĩa là "táo" (apple / banana / cherry)');
    expect(exercisePromptText(makeExercise('listen'))).toContain('Hello, my name is Lan.');
    expect(exercisePromptText(makeExercise('fill_blank'))).toBe('Điền vào chỗ trống: I ___ a student and she ___ a teacher.');
    expect(exercisePromptText(makeExercise('word_bank'))).toContain('Sắp xếp thành câu');
    expect(exercisePromptText(makeExercise('translate'))).toBe('Dịch: Tôi là học sinh.');
    expect(exercisePromptText(makeExercise('mcq', { prompt: { broken: true } }))).toBe('');
  });

  it('turns responses into the text the learner saw', () => {
    expect(responseText(makeExercise('mcq'), { option_id: 'o2' })).toBe('banana');
    expect(responseText(makeExercise('listen'), { option_id: 'l1' })).toBe('Xin chào, tôi tên Lan.');
    expect(responseText(makeExercise('word_bank'), { token_ids: ['t1', 't5', 't3'] })).toBe('I is a');
    expect(responseText(makeExercise('fill_blank'), { blanks: { b1: 'am', b2: 'are' } })).toBe('am / are');
    expect(responseText(makeExercise('translate'), { text: 'I is student' })).toBe('I is student');
    expect(responseText(makeExercise('translate'), { give_up: true })).toBe('');
    expect(responseText(makeExercise('translate'), null)).toBe('');
  });
});

describe('feedbackAiRequests', () => {
  const input = { ai: AI, prompt: 'Dịch: Tôi là học sinh.', answer: 'I is student' };

  it('offers nothing while the learner may still retry', () => {
    expect(feedbackAiRequests(makeResult({ verdict: 'incorrect', revealed: false }), input)).toBeNull();
  });

  it('asks analyze_error with the revealed answer and explain_concept for the lesson', () => {
    const result = makeResult({ revealed: true, final: true, display_answer: 'I am a student.', explanation: { vi: 'I đi với am.' } });
    const requests = feedbackAiRequests(result, input)!;
    expect(requests.why?.request).toEqual({
      task: 'analyze_error',
      language: 'en',
      level: 'a1',
      lesson_id: LESSON_ID,
      prompt: 'Dịch: Tôi là học sinh.',
      expected: 'I am a student.',
      answer: 'I is student',
    });
    expect(requests.why?.fallback).toEqual({ title: 'Giải thích trong bài', body: 'I đi với am.' });
    expect(requests.explain).toEqual({
      request: { task: 'explain_concept', language: 'en', level: 'a1', lesson_id: LESSON_ID, concept: 'Động từ to be — am' },
      fallback: AI.curated,
    });
    // Both requests satisfy the Edge Function contract.
    expect(aiRequestSchema.safeParse(requests.why!.request).success).toBe(true);
    expect(aiRequestSchema.safeParse(requests.explain.request).success).toBe(true);
  });

  it('uses the learner answer as the expected one when it was right and nothing was revealed', () => {
    const requests = feedbackAiRequests(makeResult({ verdict: 'correct', is_correct: true, final: true }), { ...input, answer: 'I am a student.' })!;
    expect(requests.why?.request).toMatchObject({ expected: 'I am a student.', answer: 'I am a student.' });
    // No explanation on the result: the lesson's curated text is the fallback.
    expect(requests.why?.fallback).toEqual({ title: 'Giải thích trong bài', body: 'I đi với am.' });
  });

  it('drops "Vì sao?" when there is nothing to compare against', () => {
    const requests = feedbackAiRequests(makeResult({ verdict: 'correct', is_correct: true }), { ...input, answer: '' })!;
    expect(requests.why).toBeNull();
    expect(requests.explain.request.task).toBe('explain_concept');
  });

  it('clips long texts to the contract limits', () => {
    const long = 'x'.repeat(900);
    const requests = feedbackAiRequests(makeResult({ revealed: true, display_answer: long }), { ai: { ...AI, concept: long }, prompt: long, answer: long })!;
    expect(aiRequestSchema.safeParse(requests.why!.request).success).toBe(true);
    expect(aiRequestSchema.safeParse(requests.explain.request).success).toBe(true);
  });
});

describe('lessonAiContext', () => {
  const lesson = {
    id: LESSON_ID,
    key: 'en:lesson:to-be',
    language_code: 'en',
    level_code: 'a1',
    title: { vi: 'Động từ to be' },
    objectives: [],
    body: [
      { type: 'explain', text: { vi: 'I đi với am.' } },
      { type: 'deep_explain', text: { vi: 'Chi tiết.' } },
      { type: 'explain', text: { vi: 'She đi với is.' } },
    ],
    estimated_minutes: 5,
    skills: [],
    content_version: 1,
    is_demo: true,
    unit_title: { vi: 'Unit' },
    program_title: { vi: 'Program' },
  } as unknown as LessonPayload['lesson'];
  const itemId = '40000000-0000-4000-8000-000000000001';
  const items = [{ id: itemId, key: 'en:am', item_type: 'vocab', front: { text: 'am' }, back: {}, audio_path: null, role: 'introduce', position: 0 }] as never;

  it('names the lesson and the exercise item, with the explain blocks as curated text', () => {
    expect(lessonAiContext(lesson, makeExercise('mcq', { item_id: itemId }), items)).toEqual({
      language: 'en',
      level: 'a1',
      lessonId: LESSON_ID,
      concept: 'Động từ to be — am',
      curated: { title: 'Động từ to be', body: 'I đi với am.\n\nShe đi với is.' },
    });
  });

  it('falls back to the lesson title without an item', () => {
    expect(lessonAiContext(lesson, makeExercise('mcq'), items).concept).toBe('Động từ to be');
  });
});
