import type { LessonAttempt, LessonPayload, LessonRun, PathLesson, PublicExercise, SubmitArgs, SubmitResult } from '@linguo/shared';

// Valid (zod-parseable) payloads shared by the lesson-player unit tests.

export const LESSON_ID = '20000000-0000-4000-8000-000000000001';
export const PATH_ID = '30000000-0000-4000-8000-000000000001';
export const RUN_ID = '40000000-0000-4000-8000-000000000001';
export const EX1 = '50000000-0000-4000-8000-000000000001';
export const EX2 = '50000000-0000-4000-8000-000000000002';
export const ITEM_ID = '60000000-0000-4000-8000-000000000001';
export const PROGRAM_ID = '70000000-0000-4000-8000-000000000001';
export const UNIT_ID = '80000000-0000-4000-8000-000000000001';

export function exercise(id: string, overrides: Partial<PublicExercise> = {}): PublicExercise {
  return {
    id,
    key: `en:exercise:${id.slice(-4)}`,
    version: 1,
    order_index: id === EX1 ? 1 : 2,
    type: 'mcq',
    stage: id === EX1 ? 'recognition' : 'recall',
    answer_lang: 'en',
    item_id: ITEM_ID,
    difficulty: 1,
    prompt: { stem: { vi: 'Chọn đáp án' }, options: [{ id: 'a', text: 'Hello' }, { id: 'b', text: 'Bye' }] },
    ...overrides,
  };
}

export function run(overrides: Partial<LessonRun> = {}): LessonRun {
  return { id: RUN_ID, status: 'in_progress', cursor: 0, queue: [EX1, EX2], next_review_at: null, summary: null, ...overrides };
}

export function payload(overrides: Partial<LessonPayload> = {}): LessonPayload {
  return {
    lesson: {
      id: LESSON_ID,
      key: 'en:lesson:greetings-hello',
      language_code: 'en',
      level_code: 'a1',
      title: { vi: 'Chào hỏi' },
      objectives: [{ vi: 'Chào hỏi cơ bản' }],
      body: [
        { type: 'objective', text: { vi: 'Mục tiêu' } },
        { type: 'explain', text: { vi: 'Giải thích' } },
        { type: 'example', target: 'Hello', target_lang: 'en', translation: { vi: 'Xin chào' } },
        { type: 'common_mistake', wrong: 'Hello you', right: 'Hello', target_lang: 'en', note: { vi: 'Ghi chú' } },
        { type: 'summary', points: [{ vi: 'Tóm tắt' }] },
      ],
      estimated_minutes: 10,
      skills: ['speaking'],
      content_version: 1,
      is_demo: true,
      unit_title: { vi: 'Unit 1' },
      program_title: { vi: 'Tiếng Anh' },
    },
    items: [],
    exercises: [exercise(EX1), exercise(EX2)],
    run: run(),
    attempts: [],
    ...overrides,
  };
}

let attemptSeq = 0;
export function result(overrides: Partial<SubmitResult> = {}): SubmitResult {
  attemptSeq += 1;
  return {
    attempt_id: `90000000-0000-4000-8000-${String(attemptSeq).padStart(12, '0')}`,
    attempt_no: 1,
    verdict: 'correct',
    is_correct: true,
    score: 1,
    error_tags: [],
    feedback_vi: null,
    revealed: false,
    display_answer: 'Hello',
    explanation: null,
    final: true,
    requeued: false,
    replayed: false,
    ...overrides,
  };
}

export function attempt(exerciseId: string, overrides: Partial<LessonAttempt> = {}): LessonAttempt {
  const base: Partial<SubmitResult> = result();
  delete base.replayed;
  return { ...(base as Omit<SubmitResult, 'replayed'>), exercise_id: exerciseId, after_reveal: false, created_at: '2026-10-13T08:00:00Z', ...overrides };
}

let keySeq = 0;
export function submitArgs(overrides: Partial<SubmitArgs> = {}): SubmitArgs {
  keySeq += 1;
  return {
    p_run_id: RUN_ID,
    p_exercise_id: EX1,
    p_exercise_version: 1,
    p_idempotency_key: `a0000000-0000-4000-8000-${String(keySeq).padStart(12, '0')}`,
    p_response: { option_id: 'a' },
    p_confidence: null,
    p_response_ms: 1200,
    p_hint_count: 0,
    p_client_at: '2026-10-13T08:00:00.000Z',
    ...overrides,
  };
}

export function pathLesson(overrides: Partial<PathLesson> = {}): PathLesson {
  return {
    lesson_id: LESSON_ID,
    lesson_key: 'en:lesson:greetings-hello',
    program_id: PROGRAM_ID,
    program_title: { vi: 'Tiếng Anh' },
    unit_id: UNIT_ID,
    unit_title: { vi: 'Unit 1' },
    unit_order: 1,
    lesson_order: 1,
    title: { vi: 'Chào hỏi' },
    level_code: 'a1',
    estimated_minutes: 10,
    is_demo: true,
    prerequisite_ids: [],
    prerequisites_met: true,
    run_status: 'not_started',
    ...overrides,
  };
}
