import type { CompleteResult, LessonPayload, PathLesson, PublicExercise } from '@linguo/shared';
import { vi } from 'vitest';
import type { ExerciseUiState, LessonRunApi, LessonStep } from '@/features/lesson-player/types';

export const LESSON_ID = '0b8f7c1e-3f1a-4c3e-9a51-6f1d2b3c4d5e';
export const EX1 = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
export const EX2 = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';

export const LESSON: LessonPayload['lesson'] = {
  id: LESSON_ID,
  key: 'en.a1.greetings',
  language_code: 'en',
  level_code: 'A1',
  title: { vi: 'Chào hỏi cơ bản' },
  objectives: [{ vi: 'Chào và đáp lại lời chào' }, { vi: 'Giới thiệu tên mình' }],
  body: [
    { type: 'objective', text: { vi: 'Sau bài này bạn chào hỏi được.' } },
    { type: 'explain', text: { vi: 'Dùng Hello để chào ở mọi tình huống.' } },
    { type: 'deep_explain', text: { vi: 'Hi thân mật hơn Hello.' } },
    { type: 'example', target: 'Hello, Anna!', target_lang: 'en', translation: { vi: 'Xin chào, Anna!' }, note: { vi: 'Dùng được ở mọi nơi.' } },
    { type: 'common_mistake', wrong: 'Hello you!', right: 'Hello!', target_lang: 'en', note: { vi: 'Không thêm you sau Hello.' } },
    { type: 'summary', points: [{ vi: 'Hello = xin chào' }, { vi: 'Hi dùng với bạn bè' }] },
  ],
  estimated_minutes: 8,
  skills: ['speaking'],
  content_version: 1,
  is_demo: true,
  unit_title: { vi: 'Làm quen' },
  program_title: { vi: 'Tiếng Anh A1' },
};

const exercise = (id: string, order: number): PublicExercise => ({
  id,
  key: `ex-${order}`,
  version: 1,
  order_index: order,
  type: 'mcq',
  stage: 'recognition',
  answer_lang: 'en',
  item_id: null,
  difficulty: 1,
  prompt: { stem: { vi: 'Chọn lời chào' }, options: [] },
});

export const STEPS: LessonStep[] = [
  { kind: 'objective' },
  { kind: 'explain' },
  { kind: 'examples' },
  { kind: 'mistake' },
  { kind: 'exercise', exerciseId: EX1, stage: 'recognition', recheck: false, queueIndex: 0 },
  { kind: 'exercise', exerciseId: EX2, stage: 'recall', recheck: false, queueIndex: 1 },
  { kind: 'summary' },
  { kind: 'next_review' },
];

export const COMPLETE_RESULT: CompleteResult = {
  accuracy_by_stage: { recognition: 1, recall: 0.5, application: null },
  almost_count: 1,
  confident_wrong: 2,
  unsure_right: 0,
  next_review_at: '2026-10-15T01:00:00Z',
  completed_at: '2026-10-14T01:00:00Z',
};

const IDLE: ExerciseUiState = { status: 'idle', attempts: 0, lastResult: null };

/** A ready LessonRunApi at `stepIndex` with spies for every action. */
export function makeRun(overrides: Partial<LessonRunApi> = {}): LessonRunApi {
  const steps = overrides.steps ?? STEPS;
  const stepIndex = overrides.stepIndex ?? 0;
  return {
    status: 'ready',
    error: null,
    lesson: LESSON,
    items: [],
    exercises: { [EX1]: exercise(EX1, 1), [EX2]: exercise(EX2, 2) },
    goTo: vi.fn(),
    next: vi.fn(),
    back: vi.fn(),
    exerciseState: vi.fn(() => IDLE),
    submit: vi.fn().mockResolvedValue(undefined),
    pendingCount: 0,
    unresolved: [],
    canComplete: true,
    complete: vi.fn().mockResolvedValue(COMPLETE_RESULT),
    completeResult: null,
    runStatus: 'in_progress',
    retry: vi.fn(),
    restart: vi.fn(),
    ...overrides,
    steps,
    stepIndex,
    step: overrides.step !== undefined ? overrides.step : (steps[stepIndex] ?? null),
  };
}

let seq = 0;
/** A path_lessons row; ids are generated unless given. */
export function pathLesson(overrides: Partial<PathLesson> = {}): PathLesson {
  seq += 1;
  const n = String(seq).padStart(12, '0');
  return {
    lesson_id: `00000000-0000-4000-8000-${n}`,
    lesson_key: `lesson-${seq}`,
    program_id: '10000000-0000-4000-8000-000000000001',
    program_title: { vi: 'Tiếng Anh A1' },
    unit_id: '20000000-0000-4000-8000-000000000001',
    unit_title: { vi: 'Làm quen' },
    unit_order: 1,
    lesson_order: seq,
    title: { vi: `Bài ${seq}` },
    level_code: 'A1',
    estimated_minutes: 8,
    is_demo: false,
    prerequisite_ids: [],
    prerequisites_met: true,
    run_status: 'not_started',
    ...overrides,
  };
}
