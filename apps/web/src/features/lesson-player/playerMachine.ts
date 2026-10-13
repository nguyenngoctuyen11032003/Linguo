import type { CompleteResult, Exercise, GradedAttempt, Lesson, RunState, SubmitResult } from './service';

/**
 * Pure lesson-player reducer (spec §1, §5.5, §7.2–7.4). No I/O: the `useLessonRun` hook performs RPCs and feeds
 * the outcomes back as actions.
 *
 * Positions are linear and double as the server `cursor`:
 *   0..3                 content steps (objective, explain, examples, mistakes)
 *   4..4+entries-1       one position per queue entry (exercise)
 *   4+entries            summary
 *   4+entries+1          next review (after `complete_lesson` succeeded)
 * Entries are only ever appended, so a saved cursor keeps pointing at the same thing.
 */

export const CONTENT_STEPS = ['objective', 'explain', 'examples', 'mistakes'] as const;
export const STEPS = [...CONTENT_STEPS, 'recognition', 'recall', 'application', 'summary', 'next_review'] as const;
export type StepId = (typeof STEPS)[number];
const FIRST_EXERCISE = CONTENT_STEPS.length;

export interface QueueEntry {
  exerciseId: string;
  /** A later occurrence of the exercise: the end-of-lesson redo (PRD §7.5) or a second try after a late sync. */
  retry: boolean;
  /** Retry entries only: the learner has answered in this entry (confirmed or queued offline). */
  submitted: boolean;
}

export interface ExerciseProgress {
  /** Latest server-confirmed grading; never built on the client. */
  graded: GradedAttempt | null;
  /** Correct, almost, or answer revealed: nothing more is required for `complete_lesson`. */
  final: boolean;
  /** Idempotency keys of submissions waiting in the outbox. */
  pendingKeys: string[];
}

export type CompletionStatus = 'idle' | 'completing' | 'completed' | 'error';

export interface PlayerState {
  lesson: Lesson;
  runId: string;
  entries: QueueEntry[];
  /** Position currently shown. */
  cursor: number;
  /** Furthest position reached; this is what is saved to the server. */
  maxCursor: number;
  exercises: Record<string, ExerciseProgress>;
  submitting: { key: string; exerciseId: string } | null;
  /** Error code of the last submission the server rejected for good. */
  submitError: string | null;
  /** Items in this user's outbox (all runs): `complete_lesson` waits for zero. */
  outboxSize: number;
  completion: { status: CompletionStatus; result: CompleteResult | null; error: string | null };
}

export interface PendingSubmission {
  idempotencyKey: string;
  exerciseId: string;
}

export interface InitInput {
  lesson: Lesson;
  run: RunState;
  /** Outbox items of this run, merged so their exercises show as pending instead of unanswered. */
  pending?: PendingSubmission[];
  outboxSize?: number;
}

export type PlayerAction =
  | { type: 'go_to'; cursor: number }
  | { type: 'next' }
  | { type: 'submit_start'; key: string; exerciseId: string }
  | { type: 'submit_result'; key: string; result: SubmitResult }
  | { type: 'submit_queued'; key: string }
  | { type: 'submit_failed'; key: string; code: string | null }
  | { type: 'sync_result'; key: string; exerciseId: string; result: SubmitResult }
  | { type: 'sync_failed'; key: string; exerciseId: string }
  | { type: 'outbox_size'; size: number }
  | { type: 'complete_start' }
  | { type: 'complete_result'; result: CompleteResult }
  | { type: 'complete_failed'; code: string | null };

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const isFinal = (g: GradedAttempt | null) => !!g && (g.isCorrect || g.revealed);

export const summaryIndex = (s: Pick<PlayerState, 'entries'>) => FIRST_EXERCISE + s.entries.length;

function entryAt(s: PlayerState, cursor: number): QueueEntry | null {
  return s.entries[cursor - FIRST_EXERCISE] ?? null;
}

function progressOf(s: PlayerState, id: string): ExerciseProgress {
  return s.exercises[id] ?? { graded: null, final: false, pendingKeys: [] };
}

function entrySettled(s: PlayerState, entry: QueueEntry): boolean {
  const p = progressOf(s, entry.exerciseId);
  if (entry.retry) return entry.submitted && (p.final || p.pendingKeys.length > 0);
  return p.final || p.pendingKeys.length > 0;
}

/** Whether `cursor` can be left forward. */
function settledAt(s: PlayerState, cursor: number): boolean {
  if (cursor < FIRST_EXERCISE) return true;
  const entry = entryAt(s, cursor);
  return entry ? entrySettled(s, entry) : false;
}

function hasOpenEntry(s: PlayerState, exerciseId: string, from: number): boolean {
  return s.entries.some((e, i) => i + FIRST_EXERCISE >= from && e.exerciseId === exerciseId && !entrySettled(s, e));
}

function appendRetry(s: PlayerState, exerciseId: string): PlayerState {
  if (hasOpenEntry(s, exerciseId, s.cursor)) return s;
  return { ...s, entries: [...s.entries, { exerciseId, retry: true, submitted: false }] };
}

/**
 * At the summary, every exercise still lacking a final result and not waiting in the outbox (second try after a
 * late sync, a dropped submission, a resumed run) gets a redo entry. Appending moves the summary one slot later,
 * so a learner sitting on it lands on the first redo.
 */
function sweep(s: PlayerState): PlayerState {
  if (s.cursor !== summaryIndex(s)) return s;
  let next = s;
  const seen = new Set<string>();
  for (const e of s.entries) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    const p = progressOf(next, e.exerciseId);
    if (!p.final && p.pendingKeys.length === 0) next = appendRetry(next, e.exerciseId);
  }
  return next;
}

function withProgress(s: PlayerState, id: string, update: (p: ExerciseProgress) => ExerciseProgress): PlayerState {
  return { ...s, exercises: { ...s.exercises, [id]: update(progressOf(s, id)) } };
}

/** Applies a confirmed grading; an older attempt never overwrites a newer one and a final result stays final. */
function applyGraded(s: PlayerState, id: string, result: SubmitResult, dropKey: string): PlayerState {
  return withProgress(s, id, (p) => {
    const graded: GradedAttempt = {
      attemptNo: result.attemptNo,
      verdict: result.verdict,
      isCorrect: result.isCorrect,
      revealed: result.revealed,
      feedback: result.feedback,
    };
    const newer = !p.graded || graded.attemptNo >= p.graded.attemptNo;
    return {
      graded: newer ? graded : p.graded,
      final: p.final || isFinal(graded),
      pendingKeys: p.pendingKeys.filter((k) => k !== dropKey),
    };
  });
}

function markCurrentRetrySubmitted(s: PlayerState): PlayerState {
  const index = s.cursor - FIRST_EXERCISE;
  const entry = s.entries[index];
  if (!entry?.retry || entry.submitted) return s;
  const entries = s.entries.slice();
  entries[index] = { ...entry, submitted: true };
  return { ...s, entries };
}

// ---------------------------------------------------------------------------------------------
// Init (fresh start or resume)
// ---------------------------------------------------------------------------------------------

export function initPlayer({ lesson, run, pending = [], outboxSize = 0 }: InitInput): PlayerState {
  const known = new Set(lesson.exercises.map((e) => e.id));
  // Content may have changed since the run started: drop queue ids the lesson no longer has.
  const queue = (run.queue.length ? run.queue : lesson.exercises.map((e) => e.id)).filter((id) => known.has(id));
  const seen = new Set<string>();
  const cursor = Math.max(0, Math.min(run.cursor, FIRST_EXERCISE + queue.length));
  const entries: QueueEntry[] = queue.map((exerciseId, i) => {
    const retry = seen.has(exerciseId);
    seen.add(exerciseId);
    return { exerciseId, retry, submitted: retry && i + FIRST_EXERCISE < cursor };
  });

  const exercises: Record<string, ExerciseProgress> = {};
  for (const id of seen) {
    const graded = run.attempts[id] ?? null;
    exercises[id] = { graded, final: isFinal(graded), pendingKeys: [] };
  }
  for (const item of pending) {
    const p = exercises[item.exerciseId];
    if (p && !p.pendingKeys.includes(item.idempotencyKey)) p.pendingKeys.push(item.idempotencyKey);
  }

  let state: PlayerState = {
    lesson,
    runId: run.runId,
    entries,
    cursor,
    maxCursor: cursor,
    exercises,
    submitting: null,
    submitError: null,
    outboxSize,
    completion: { status: 'idle', result: null, error: null },
  };

  if (run.status === 'completed') {
    const end = summaryIndex(state) + 1;
    return { ...state, cursor: end, maxCursor: end, completion: { status: 'completed', result: null, error: null } };
  }
  // A retry entry being shown with a queued answer was already submitted before the reload.
  const current = entryAt(state, cursor);
  if (current?.retry && progressOf(state, current.exerciseId).pendingKeys.length > 0) state = markCurrentRetrySubmitted(state);
  return sweep(state);
}

// ---------------------------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------------------------

export function playerReducer(s: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'go_to': {
      // Back/forward through content steps already seen, or straight to the frontier (`?buoc=` sync).
      const target = action.cursor;
      if (!Number.isInteger(target) || target < 0 || target > s.maxCursor || target === s.cursor) return s;
      if (target !== s.maxCursor && target >= FIRST_EXERCISE) return s;
      if (s.submitting) return s;
      return { ...s, cursor: target };
    }

    case 'next': {
      if (s.submitting || s.completion.status === 'completed') return s;
      if (s.cursor >= summaryIndex(s) || !settledAt(s, s.cursor)) return s;
      const cursor = s.cursor + 1;
      return sweep({ ...s, cursor, maxCursor: Math.max(s.maxCursor, cursor), submitError: null });
    }

    case 'submit_start': {
      const entry = entryAt(s, s.cursor);
      if (s.submitting || !entry || entry.exerciseId !== action.exerciseId || entrySettled(s, entry)) return s;
      return { ...s, submitting: { key: action.key, exerciseId: action.exerciseId }, submitError: null };
    }

    case 'submit_result': {
      if (s.submitting?.key !== action.key) return s;
      const id = s.submitting.exerciseId;
      let next = applyGraded({ ...s, submitting: null }, id, action.result, action.key);
      next = markCurrentRetrySubmitted(next);
      // The server appended the item to its queue (wrong twice / revealed): mirror it.
      if (action.result.requeued) next = appendRetry(next, id);
      return next;
    }

    case 'submit_queued': {
      if (s.submitting?.key !== action.key) return s;
      const id = s.submitting.exerciseId;
      let next = withProgress({ ...s, submitting: null }, id, (p) =>
        p.pendingKeys.includes(action.key) ? p : { ...p, pendingKeys: [...p.pendingKeys, action.key] },
      );
      next = markCurrentRetrySubmitted(next);
      return next;
    }

    case 'submit_failed': {
      if (s.submitting?.key !== action.key) return s;
      return { ...s, submitting: null, submitError: action.code };
    }

    case 'sync_result': {
      const p = s.exercises[action.exerciseId];
      if (!p) return s;
      let next = applyGraded(s, action.exerciseId, action.result, action.key);
      const after = progressOf(next, action.exerciseId);
      const current = entryAt(next, next.cursor);
      const showingIt = current?.exerciseId === action.exerciseId;
      if (showingIt && current.retry && !after.final && after.pendingKeys.length === 0) {
        // The learner is still on this redo: let them answer again in place.
        const entries = next.entries.slice();
        entries[next.cursor - FIRST_EXERCISE] = { ...current, submitted: false };
        next = { ...next, entries };
      } else if (!after.final && after.pendingKeys.length === 0 && !showingIt) {
        // First wrong answer confirmed after the learner moved on: give the second try at the end.
        next = appendRetry(next, action.exerciseId);
      }
      if (action.result.requeued) next = appendRetry(next, action.exerciseId);
      return sweep(next);
    }

    case 'sync_failed': {
      if (!s.exercises[action.exerciseId]) return s;
      const next = withProgress(s, action.exerciseId, (p) => ({ ...p, pendingKeys: p.pendingKeys.filter((k) => k !== action.key) }));
      const current = entryAt(next, next.cursor);
      if (current?.retry && current.exerciseId === action.exerciseId && !entrySettled(next, { ...current, submitted: true })) {
        const entries = next.entries.slice();
        entries[next.cursor - FIRST_EXERCISE] = { ...current, submitted: false };
        return { ...next, entries };
      }
      return sweep(next);
    }

    case 'outbox_size':
      return s.outboxSize === action.size ? s : { ...s, outboxSize: action.size };

    case 'complete_start':
      if (!canComplete(s)) return s;
      return { ...s, completion: { status: 'completing', result: null, error: null } };

    case 'complete_result': {
      const end = summaryIndex(s) + 1;
      return { ...s, cursor: end, maxCursor: end, completion: { status: 'completed', result: action.result, error: null } };
    }

    case 'complete_failed':
      return s.completion.status === 'completing' ? { ...s, completion: { status: 'error', result: null, error: action.code } } : s;
  }
}

// ---------------------------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------------------------

/** All queued exercises final, nothing pending anywhere, learner on the summary. */
export function canComplete(s: PlayerState): boolean {
  if (s.cursor !== summaryIndex(s) || s.submitting || s.outboxSize > 0) return false;
  if (s.completion.status === 'completing' || s.completion.status === 'completed') return false;
  return s.entries.every((e) => {
    const p = progressOf(s, e.exerciseId);
    return p.final && p.pendingKeys.length === 0;
  });
}

export interface PlayerView {
  kind: 'content' | 'exercise' | 'summary' | 'next_review';
  step: StepId;
  /** 1-based, out of `totalSteps` ("Bước 4/9"). */
  stepNumber: number;
  totalSteps: number;
  entry: QueueEntry | null;
  exercise: Exercise | null;
  /** 1-based position among queue entries ("Câu 3/8"); 0 outside exercises. */
  exerciseNumber: number;
  exerciseCount: number;
  /** Server-confirmed feedback to show; null while an answer for this entry is pending sync. */
  feedback: GradedAttempt | null;
  pendingSync: boolean;
  submitting: boolean;
  canSubmit: boolean;
  canAdvance: boolean;
  canGoBack: boolean;
  canComplete: boolean;
}

export function selectView(s: PlayerState): PlayerView {
  const summary = summaryIndex(s);
  const base = {
    totalSteps: STEPS.length,
    exerciseCount: s.entries.length,
    submitting: !!s.submitting,
    canGoBack: !s.submitting && s.cursor > 0 && s.cursor <= FIRST_EXERCISE,
    canComplete: canComplete(s),
  };
  const stepView = (step: StepId) => ({ step, stepNumber: STEPS.indexOf(step) + 1 });

  if (s.cursor < FIRST_EXERCISE) {
    return {
      ...base,
      ...stepView(CONTENT_STEPS[s.cursor] ?? 'objective'),
      kind: 'content',
      entry: null,
      exercise: null,
      exerciseNumber: 0,
      feedback: null,
      pendingSync: false,
      canSubmit: false,
      canAdvance: true,
    };
  }
  if (s.cursor >= summary) {
    const done = s.cursor > summary;
    return {
      ...base,
      ...stepView(done ? 'next_review' : 'summary'),
      kind: done ? 'next_review' : 'summary',
      entry: null,
      exercise: null,
      exerciseNumber: 0,
      feedback: null,
      pendingSync: !done && (s.outboxSize > 0 || Object.values(s.exercises).some((p) => p.pendingKeys.length > 0)),
      canSubmit: false,
      canAdvance: false,
      canGoBack: false,
    };
  }

  const entry = entryAt(s, s.cursor) as QueueEntry;
  const exercise = s.lesson.exercises.find((e) => e.id === entry.exerciseId) ?? null;
  const p = progressOf(s, entry.exerciseId);
  const pendingSync = p.pendingKeys.length > 0 && (!entry.retry || entry.submitted);
  const answeredHere = !entry.retry || entry.submitted;
  const settled = entrySettled(s, entry);
  return {
    ...base,
    // Redo entries sit at the end of the lesson, after the application stage.
    ...stepView(entry.retry ? 'application' : (exercise?.stage ?? 'recognition')),
    kind: 'exercise',
    entry,
    exercise,
    exerciseNumber: s.cursor - FIRST_EXERCISE + 1,
    feedback: !pendingSync && answeredHere ? p.graded : null,
    pendingSync,
    canSubmit: !s.submitting && !settled && !!exercise,
    canAdvance: !s.submitting && settled,
  };
}

/** Serializable run state for the offline cache (same shape as the server's). */
export function toRunSnapshot(s: PlayerState): RunState {
  const attempts: RunState['attempts'] = {};
  for (const [id, p] of Object.entries(s.exercises)) if (p.graded) attempts[id] = p.graded;
  return {
    runId: s.runId,
    status: s.completion.status === 'completed' ? 'completed' : 'in_progress',
    cursor: s.maxCursor,
    queue: s.entries.map((e) => e.exerciseId),
    attempts,
  };
}
