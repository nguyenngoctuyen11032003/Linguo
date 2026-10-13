import type { CompleteResult, ExerciseResponse, ExerciseStage, LessonItem, LessonPayload, PublicExercise, SubmitResult } from '@linguo/shared';

// Spec 2 §7: contract between the lesson-player data layer (useLessonRun),
// the exercise components and the lesson screen.

export type Confidence = 1 | 2 | 3;

export interface SubmitMeta {
  /** null in the recognition stage or when the learner did not pick one. */
  confidence: Confidence | null;
  responseMs: number;
  hintCount: number;
}

export type ExerciseUiState =
  | { status: 'idle'; attempts: number; lastResult: SubmitResult | null }
  | { status: 'submitting'; attempts: number; lastResult: SubmitResult | null }
  /** Saved in the offline outbox; no verdict is shown until the server confirms. */
  | { status: 'pending_sync'; attempts: number; lastResult: SubmitResult | null }
  | { status: 'graded'; attempts: number; lastResult: SubmitResult };

export type LessonStep =
  | { kind: 'objective' }
  | { kind: 'explain' }
  | { kind: 'examples' }
  | { kind: 'mistake' }
  | { kind: 'exercise'; exerciseId: string; stage: ExerciseStage; recheck: boolean; queueIndex: number }
  | { kind: 'summary' }
  | { kind: 'next_review' };

export interface LessonRunApi {
  status: 'loading' | 'ready' | 'error';
  /** Vietnamese message (from lessonErrorMessage) when status is 'error'. */
  error: string | null;
  lesson: LessonPayload['lesson'] | null;
  items: LessonItem[];
  exercises: Record<string, PublicExercise>;
  steps: LessonStep[];
  stepIndex: number;
  step: LessonStep | null;
  goTo: (index: number) => void;
  next: () => void;
  back: () => void;
  exerciseState: (exerciseId: string, queueIndex: number) => ExerciseUiState;
  submit: (exerciseId: string, queueIndex: number, response: ExerciseResponse, meta: SubmitMeta) => Promise<void>;
  /** Attempts waiting in the offline outbox for this user. */
  pendingCount: number;
  canComplete: boolean;
  complete: () => Promise<CompleteResult | null>;
  completeResult: CompleteResult | null;
  retry: () => void;
}
