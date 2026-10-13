import type { ExerciseStage, ExerciseType, PublicExercise, SubmitResult } from '@linguo/shared';
import type { ExerciseUiState } from '@/features/lesson-player/types';

const PROMPTS: Record<ExerciseType, Record<string, unknown>> = {
  mcq: {
    stem: 'Chọn từ có nghĩa là "táo"',
    stem_lang: 'vi',
    options: [
      { id: 'o1', text: 'apple', lang: 'en' },
      { id: 'o2', text: 'banana', lang: 'en' },
      { id: 'o3', text: 'cherry', lang: 'en' },
    ],
    shuffle: false,
  },
  listen: {
    audio_asset_id: null,
    fallback_text: 'Hello, my name is Lan.',
    options: [
      { id: 'l1', text: 'Xin chào, tôi tên Lan.', lang: 'vi' },
      { id: 'l2', text: 'Tạm biệt Lan.', lang: 'vi' },
    ],
    shuffle: false,
  },
  fill_blank: {
    template: 'I {{b1}} a student and she {{b2}} a teacher.',
    blanks: [{ id: 'b1', width_hint: 3 }, { id: 'b2' }],
    hint_levels: ['Tôi là học sinh và cô ấy là giáo viên.', 'am / is'],
  },
  word_bank: {
    instruction: 'Sắp xếp thành câu "Tôi là học sinh"',
    tokens: [
      { id: 't1', text: 'I' },
      { id: 't2', text: 'am' },
      { id: 't3', text: 'a' },
      { id: 't4', text: 'student' },
      { id: 't5', text: 'is' },
    ],
  },
  translate: {
    source_text: 'Tôi là học sinh.',
    source_lang: 'vi',
    direction: 'vi_to_target',
    hint_levels: ['I am a ...', 'student'],
  },
};

let n = 0;
export function makeExercise(type: ExerciseType, overrides: Partial<PublicExercise> = {}, stage: ExerciseStage = 'recognition'): PublicExercise {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    key: `${type}-${n}`,
    version: 1,
    order_index: n,
    type,
    stage,
    answer_lang: type === 'listen' ? 'vi' : 'en',
    item_id: null,
    difficulty: 1,
    prompt: PROMPTS[type],
    ...overrides,
  };
}

export function makeResult(overrides: Partial<SubmitResult> = {}): SubmitResult {
  return {
    attempt_id: '00000000-0000-4000-8000-aaaaaaaaaaaa',
    attempt_no: 1,
    verdict: 'incorrect',
    is_correct: false,
    score: 0,
    error_tags: [],
    feedback_vi: null,
    revealed: false,
    display_answer: null,
    explanation: null,
    final: false,
    requeued: false,
    replayed: false,
    ...overrides,
  };
}

export const IDLE: ExerciseUiState = { status: 'idle', attempts: 0, lastResult: null };
export const graded = (result: SubmitResult, attempts = 1): ExerciseUiState => ({ status: 'graded', attempts, lastResult: result });
