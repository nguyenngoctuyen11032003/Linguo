import { describe, expect, it } from 'vitest';
import {
  AI_OUTPUT_SCHEMAS,
  AI_REQUEST_MAX_BYTES,
  AI_TASKS,
  ANALYZE_SENTENCE_MAX_CHARS,
  PLAN_REVIEW_MAX_GAPS,
  aiRequestSchema,
  aiSuccessSchema,
  analyzeSentenceOutputSchema,
  planReviewOutputSchema,
  summarizeSessionOutputSchema,
} from './contract';

const LESSON = '11111111-1111-4111-8111-111111111111';

describe('analyze_sentence contract', () => {
  const req = { task: 'analyze_sentence', language: 'ko', level: 'topik1', sentence: '저는 학생이에요.' };
  const out = {
    translation_vi: 'Tôi là học sinh.',
    alternative_meanings: [],
    tokens: [
      { text: '저는', pos: 'pronoun', meaning_vi: 'tôi (chủ đề)' },
      { text: '학생이에요', pos: 'noun', meaning_vi: 'là học sinh' },
    ],
    components: [{ label: 'subject', text: '저는', note_vi: 'Chủ ngữ với 는.' }],
    grammar_points: [{ pattern: '-이에요/예요', explanation_vi: 'Đuôi câu "là" lịch sự.' }],
    confidence: 'high',
    uncertainty: null,
  };

  it('is a known task with an output schema', () => {
    expect(AI_TASKS).toContain('analyze_sentence');
    expect(AI_OUTPUT_SCHEMAS.analyze_sentence).toBe(analyzeSentenceOutputSchema);
  });

  it('request: strict, bounded, no lesson_id or model', () => {
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...req, sentence: '  ' }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, sentence: 'x'.repeat(ANALYZE_SENTENCE_MAX_CHARS + 1) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, model: 'g' }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, lesson_id: LESSON }).success).toBe(false);
  });

  it('output: strict shape, pos enum, bounded lists', () => {
    expect(analyzeSentenceOutputSchema.parse(out)).toEqual(out);
    expect(analyzeSentenceOutputSchema.safeParse({ ...out, tokens: [] }).success).toBe(false);
    expect(analyzeSentenceOutputSchema.safeParse({ ...out, tokens: [{ ...out.tokens[0], pos: 'weird' }] }).success).toBe(false);
    expect(analyzeSentenceOutputSchema.safeParse({ ...out, extra: 1 }).success).toBe(false);
    expect(analyzeSentenceOutputSchema.safeParse({ ...out, alternative_meanings: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });

  it('a maximal Korean request fits the body limit', () => {
    const big = { ...req, sentence: '가'.repeat(ANALYZE_SENTENCE_MAX_CHARS) };
    expect(new TextEncoder().encode(JSON.stringify(big)).byteLength).toBeLessThanOrEqual(AI_REQUEST_MAX_BYTES);
  });
});

describe('summarize_session contract', () => {
  const req = {
    task: 'summarize_session',
    language: 'en',
    level: 'a2',
    minutes: 12,
    activities: [
      { kind: 'review', status: 'done', minutes: 5 },
      { kind: 'lesson', status: 'skipped', minutes: 7 },
    ],
    accuracy_by_stage: [{ stage: 'recall', attempts: 8, correct: 6 }],
    error_tags: [{ tag: 'article', count: 2 }],
  };
  const out = {
    recap_vi: 'Hôm nay bạn đã ôn 5 phút.',
    errors_to_remember: [{ tag: 'article', note_vi: 'Nhớ a/an/the.' }],
    next_step_vi: 'Mai làm bài tiếp theo.',
  };

  it('is a known task; optional parts default to empty', () => {
    expect(AI_TASKS).toContain('summarize_session');
    expect(AI_OUTPUT_SCHEMAS.summarize_session).toBe(summarizeSessionOutputSchema);
    const min = aiRequestSchema.parse({ task: 'summarize_session', language: 'en', level: 'a2', minutes: 3, activities: [req.activities[0]] });
    expect(min).toMatchObject({ accuracy_by_stage: [], error_tags: [] });
  });

  it('request: bounded and strict', () => {
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...req, activities: [] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, activities: Array(13).fill(req.activities[0]) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, minutes: -1 }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, error_tags: Array(6).fill({ tag: 'typo', count: 1 }) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, error_tags: [{ tag: 'Bad Tag', count: 1 }] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, accuracy_by_stage: [{ stage: 'recall', attempts: 2, correct: 3 }] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, name: 'Lan' }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, activities: [{ ...req.activities[0], title: 'x' }] }).success).toBe(false);
  });

  it('output: at most 3 errors', () => {
    expect(summarizeSessionOutputSchema.parse(out)).toEqual(out);
    const four = Array(4).fill(out.errors_to_remember[0]);
    expect(summarizeSessionOutputSchema.safeParse({ ...out, errors_to_remember: four }).success).toBe(false);
    expect(summarizeSessionOutputSchema.safeParse({ ...out, extra: 1 }).success).toBe(false);
  });
});

describe('plan_review contract', () => {
  const req = {
    task: 'plan_review',
    language: 'en',
    level: 'a2',
    gaps: [
      { kind: 'lesson', id: LESSON, label: 'Present simple', count: 4 },
      { kind: 'tag', id: 'mcq', label: 'Trắc nghiệm', count: 3 },
    ],
  };
  const out = {
    summary_vi: 'Ưu tiên bài present simple.',
    steps: [
      { kind: 'redo_lesson', target: LESSON, cards: null, reason_vi: 'Sai 4 lần.' },
      { kind: 'review_cards', target: 'mcq', cards: 10, reason_vi: 'Luyện trắc nghiệm.' },
    ],
  };

  it('is a known task with an output schema', () => {
    expect(AI_TASKS).toContain('plan_review');
    expect(AI_OUTPUT_SCHEMAS.plan_review).toBe(planReviewOutputSchema);
  });

  it('request: 1..N unique gaps', () => {
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...req, gaps: [] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, gaps: [req.gaps[0], req.gaps[0]] }).success).toBe(false);
    const many = Array.from({ length: PLAN_REVIEW_MAX_GAPS + 1 }, (_, i) => ({ kind: 'tag', id: `t${i}`, label: 'x', count: 1 }));
    expect(aiRequestSchema.safeParse({ ...req, gaps: many }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, gaps: [{ ...req.gaps[0], id: 'has space' }] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, gaps: [{ ...req.gaps[0], count: 0 }] }).success).toBe(false);
  });

  it('output: 1..5 steps with a kind enum', () => {
    expect(planReviewOutputSchema.parse(out)).toEqual(out);
    expect(planReviewOutputSchema.safeParse({ ...out, steps: [] }).success).toBe(false);
    expect(planReviewOutputSchema.safeParse({ ...out, steps: Array(6).fill(out.steps[0]) }).success).toBe(false);
    expect(planReviewOutputSchema.safeParse({ ...out, steps: [{ ...out.steps[0], kind: 'delete_account' }] }).success).toBe(false);
  });

  it('success envelope accepts the new tasks', () => {
    for (const task of ['analyze_sentence', 'summarize_session', 'plan_review']) {
      const ok = aiSuccessSchema.safeParse({
        task,
        prompt_version: `${task}@1`,
        data: {},
        cached: false,
        ai_generated: true,
        response_id: 'id',
        quota: { used: 1, limit: 20, resets_at: '2026-10-14T17:00:00.000Z' },
      });
      expect(ok.success).toBe(true);
    }
  });
});
