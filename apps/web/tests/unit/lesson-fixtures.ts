import type { SubmitResult } from '@/features/lesson-player/service';

/** Server-shaped (`get_lesson`) payload for lesson-player tests. Exercises: e1, e2 recognition; e3 recall; e4 application. */
export function lessonPayloadJson(overrides: { run?: unknown; exercises?: unknown[] } = {}): Record<string, unknown> {
  const exercise = (id: string, stage: string, order: number) => ({
    id,
    version: 1,
    order_index: order,
    exercise_type: 'mcq',
    stage,
    answer_lang: 'en',
    prompt: { stem: { vi: `Câu ${id}` }, options: [{ id: 'a', text: 'Hello', lang: 'en' }], shuffle: false },
    item_id: null,
  });
  return {
    lesson: {
      id: 'lesson-1',
      language_code: 'en',
      level_code: 'pre_a1',
      title: { vi: 'Xin chào!' },
      objectives: [{ vi: 'Chào hỏi' }],
      body: [{ type: 'objective' }, { type: 'explain' }, { type: 'example' }, { type: 'common_mistake' }, { type: 'summary' }],
      estimated_minutes: 10,
      skills: ['speaking'],
    },
    content_version: 1,
    is_demo: true,
    items: [{ id: 'item-1', item_type: 'phrase', front: { text: 'Hello' }, back: { vi: 'Xin chào' }, audio_path: null }],
    exercises: overrides.exercises ?? [
      exercise('e1', 'recognition', 1),
      exercise('e2', 'recognition', 2),
      exercise('e3', 'recall', 3),
      exercise('e4', 'application', 4),
    ],
    run: overrides.run ?? null,
  };
}

export function runJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { run_id: 'run-1', status: 'in_progress', cursor: 0, queue: ['e1', 'e2', 'e3', 'e4'], attempts: [], ...overrides };
}

export function submitResult(overrides: Partial<SubmitResult> = {}): SubmitResult {
  return {
    attemptId: 'att-1',
    attemptNo: 1,
    verdict: 'correct',
    isCorrect: true,
    score: 1,
    revealed: false,
    requeued: false,
    replayed: false,
    feedback: { feedbackVi: null, errorTags: [], displayAnswer: 'Hello', explanation: { vi: 'Vì…' } },
    ...overrides,
  };
}

export const wrong1 = (o: Partial<SubmitResult> = {}) =>
  submitResult({ verdict: 'incorrect', isCorrect: false, score: 0, feedback: { feedbackVi: 'Thiếu be', errorTags: ['be'], displayAnswer: null, explanation: null }, ...o });

export const wrong2 = (o: Partial<SubmitResult> = {}) =>
  submitResult({ attemptNo: 2, verdict: 'incorrect', isCorrect: false, score: 0, revealed: true, requeued: true, ...o });

/** Deterministic v4-looking UUIDs for idempotency keys. */
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
