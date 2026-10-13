import type { CompleteResult, LessonAttempt, LessonPayload, LessonRun, SubmitResult } from '@linguo/shared';
import type { ExerciseUiState, LessonStep } from './types';

// Spec 2 §7.2: the pure core of the lesson player. Steps follow PRD §6.2; exercise steps mirror the run queue
// (re-check entries are appended to the queue by the server and become extra exercise steps).

/** Objective → explanation → examples → common mistake → one step per queue entry → summary → next review. */
export function buildSteps(payload: LessonPayload, queue: readonly string[]): LessonStep[] {
  const { lesson, exercises } = payload;
  const has = (type: string) => lesson.body.some((block) => block.type === type);
  const steps: LessonStep[] = [];
  if (has('objective') || lesson.objectives.length > 0) steps.push({ kind: 'objective' });
  if (has('explain') || has('deep_explain')) steps.push({ kind: 'explain' });
  if (has('example')) steps.push({ kind: 'examples' });
  if (has('common_mistake')) steps.push({ kind: 'mistake' });
  const byId = new Map(exercises.map((e) => [e.id, e]));
  queue.forEach((exerciseId, queueIndex) => {
    const exercise = byId.get(exerciseId);
    if (!exercise) return; // unknown id (stale queue): skip rather than render a broken step
    steps.push({ kind: 'exercise', exerciseId, stage: exercise.stage, recheck: queueIndex >= exercises.length, queueIndex });
  });
  steps.push({ kind: 'summary' }, { kind: 'next_review' });
  return steps;
}

/** In-flight state of one queue entry; absent means "derive from attempts". */
type LocalStatus = 'submitting' | 'pending_sync';

export interface PlayerState {
  payload: LessonPayload | null;
  run: LessonRun | null;
  steps: LessonStep[];
  stepIndex: number;
  /** Server-confirmed attempts of the current run, oldest first. */
  attempts: LessonAttempt[];
  local: Record<string, LocalStatus>;
  completeResult: CompleteResult | null;
}

export interface EntryRef {
  exerciseId: string;
  queueIndex: number;
}

export type PlayerAction =
  | { type: 'loaded'; payload: LessonPayload; run: LessonRun; stepIndex: number; pending?: EntryRef[] }
  | { type: 'goto'; index: number }
  | ({ type: 'submitting' } & EntryRef)
  | ({ type: 'pending' } & EntryRef)
  /** The submit failed on the server: the entry goes back to idle. */
  | ({ type: 'failed' } & EntryRef)
  | ({ type: 'graded'; result: SubmitResult } & EntryRef)
  | { type: 'queueChanged'; queue: string[] }
  | { type: 'completed'; result: CompleteResult };

export const initialPlayerState: PlayerState = {
  payload: null,
  run: null,
  steps: [],
  stepIndex: 0,
  attempts: [],
  local: {},
  completeResult: null,
};

export function entryKey(exerciseId: string, queueIndex: number): string {
  return `${exerciseId}#${queueIndex}`;
}

function clamp(index: number, steps: readonly LessonStep[]): number {
  if (steps.length === 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), steps.length - 1);
}

function withoutLocal(local: PlayerState['local'], key: string): PlayerState['local'] {
  if (!(key in local)) return local;
  const next = { ...local };
  delete next[key];
  return next;
}

function withQueue(state: PlayerState, queue: string[]): PlayerState {
  if (!state.payload || !state.run) return state;
  const run = { ...state.run, queue };
  const steps = buildSteps(state.payload, queue);
  return { ...state, run, steps, stepIndex: clamp(state.stepIndex, steps) };
}

type ResultFields = Omit<SubmitResult, 'replayed'>;

/** The grading fields shared by a submit result and a stored attempt. */
function resultFields(r: ResultFields): ResultFields {
  return {
    attempt_id: r.attempt_id,
    attempt_no: r.attempt_no,
    verdict: r.verdict,
    is_correct: r.is_correct,
    score: r.score,
    error_tags: r.error_tags,
    feedback_vi: r.feedback_vi,
    revealed: r.revealed,
    display_answer: r.display_answer,
    explanation: r.explanation,
    final: r.final,
    requeued: r.requeued,
  };
}

function toAttempt(exerciseId: string, result: SubmitResult, previous: readonly LessonAttempt[]): LessonAttempt {
  return {
    ...resultFields(result),
    exercise_id: exerciseId,
    // The server decides; locally an attempt after a revealing one is the same rule (spec 2 §5.5).
    after_reveal: previous.some((a) => a.exercise_id === exerciseId && a.revealed),
    created_at: new Date().toISOString(),
  };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'loaded': {
      const steps = buildSteps(action.payload, action.run.queue);
      const local: PlayerState['local'] = {};
      for (const p of action.pending ?? []) local[entryKey(p.exerciseId, p.queueIndex)] = 'pending_sync';
      return {
        payload: action.payload,
        run: action.run,
        steps,
        stepIndex: clamp(action.stepIndex, steps),
        attempts: action.payload.attempts,
        local,
        completeResult: null,
      };
    }
    case 'goto':
      return { ...state, stepIndex: clamp(action.index, state.steps) };
    case 'submitting':
    case 'pending':
      return {
        ...state,
        local: { ...state.local, [entryKey(action.exerciseId, action.queueIndex)]: action.type === 'submitting' ? 'submitting' : 'pending_sync' },
      };
    case 'failed':
      return { ...state, local: withoutLocal(state.local, entryKey(action.exerciseId, action.queueIndex)) };
    case 'graded': {
      const local = withoutLocal(state.local, entryKey(action.exerciseId, action.queueIndex));
      const known = state.attempts.some((a) => a.attempt_id === action.result.attempt_id);
      const attempts = known ? state.attempts : [...state.attempts, toAttempt(action.exerciseId, action.result, state.attempts)];
      let next: PlayerState = { ...state, local, attempts };
      const queue = state.run?.queue ?? [];
      // A replayed or duplicated result must not append a second re-check entry.
      if (action.result.requeued && queue.filter((id) => id === action.exerciseId).length < 2) {
        next = withQueue(next, [...queue, action.exerciseId]);
      }
      return next;
    }
    case 'queueChanged':
      return withQueue(state, action.queue);
    case 'completed': {
      const run = state.run
        ? { ...state.run, status: 'completed' as const, next_review_at: action.result.next_review_at }
        : state.run;
      return { ...state, run, completeResult: action.result };
    }
  }
}

function asResult(attempt: LessonAttempt): SubmitResult {
  return { ...resultFields(attempt), replayed: false };
}

/**
 * Attempts of one queue entry: when the exercise also has a re-check entry, the first pass owns the attempts made
 * before the answer was revealed and the re-check entry owns only the `after_reveal` ones.
 */
export function attemptsFor(state: PlayerState, exerciseId: string, queueIndex: number): LessonAttempt[] {
  const all = state.attempts.filter((a) => a.exercise_id === exerciseId);
  const queue = state.run?.queue ?? [];
  const positions = queue.flatMap((id, i) => (id === exerciseId ? [i] : []));
  if (positions.length < 2) return all;
  const isRecheck = queueIndex !== positions[0];
  return all.filter((a) => a.after_reveal === isRecheck);
}

export function exerciseStateFor(state: PlayerState, exerciseId: string, queueIndex: number): ExerciseUiState {
  const own = attemptsFor(state, exerciseId, queueIndex);
  const last = own.at(-1);
  const lastResult = last ? asResult(last) : null;
  const local = state.local[entryKey(exerciseId, queueIndex)];
  if (local) return { status: local, attempts: own.length, lastResult };
  if (lastResult) return { status: 'graded', attempts: own.length, lastResult };
  return { status: 'idle', attempts: 0, lastResult: null };
}
