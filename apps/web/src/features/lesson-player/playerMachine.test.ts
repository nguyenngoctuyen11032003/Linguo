import { describe, expect, it } from 'vitest';
import { lessonPayloadJson, runJson, submitResult, wrong1, wrong2 } from '../../../tests/unit/lesson-fixtures';
import {
  canComplete,
  initPlayer,
  playerReducer,
  selectView,
  summaryIndex,
  toRunSnapshot,
  type PlayerAction,
  type PlayerState,
} from './playerMachine';
import { parseLessonPayload, parseRunState, type CompleteResult } from './service';

const { lesson } = parseLessonPayload(lessonPayloadJson());

function start(run: Record<string, unknown> = {}, extra: Partial<Parameters<typeof initPlayer>[0]> = {}): PlayerState {
  return initPlayer({ lesson, run: parseRunState(runJson(run)), ...extra });
}

const apply = (s: PlayerState, ...actions: PlayerAction[]) => actions.reduce(playerReducer, s);

/** Submit at the current entry and get a confirmed result back. */
function answer(s: PlayerState, key: string, result = submitResult()): PlayerState {
  const exerciseId = selectView(s).exercise?.id ?? '';
  return apply(s, { type: 'submit_start', key, exerciseId }, { type: 'submit_result', key, result });
}

function answerOffline(s: PlayerState, key: string): PlayerState {
  const exerciseId = selectView(s).exercise?.id ?? '';
  return apply(s, { type: 'submit_start', key, exerciseId }, { type: 'submit_queued', key });
}

const next = (s: PlayerState) => playerReducer(s, { type: 'next' });

const COMPLETE: CompleteResult = {
  runId: 'run-1',
  nextReviewAt: '2026-10-14T00:00:00+07:00',
  completedAt: null,
  summary: { accuracyByStage: {}, almostCount: 0, confidentWrong: 0, unsureRight: 0 },
};

describe('playerMachine — steps', () => {
  it('walks objective → explain → examples → mistakes → recognition → recall → application → summary → next review', () => {
    let s = start();
    const steps: string[] = [];
    const record = () => {
      const v = selectView(s);
      steps.push(`${v.step}:${v.stepNumber}/${v.totalSteps}${v.kind === 'exercise' ? `:${v.exerciseNumber}/${v.exerciseCount}` : ''}`);
    };
    for (let i = 0; i < 4; i++) {
      record();
      s = next(s);
    }
    for (let i = 0; i < 4; i++) {
      record();
      s = next(answer(s, `k${i}`));
    }
    record();
    expect(canComplete(s)).toBe(true);
    s = apply(s, { type: 'complete_start' }, { type: 'complete_result', result: COMPLETE });
    record();
    expect(steps).toEqual([
      'objective:1/9',
      'explain:2/9',
      'examples:3/9',
      'mistakes:4/9',
      'recognition:5/9:1/4',
      'recognition:5/9:2/4',
      'recall:6/9:3/4',
      'application:7/9:4/4',
      'summary:8/9',
      'next_review:9/9',
    ]);
    expect(s.completion).toEqual({ status: 'completed', result: COMPLETE, error: null });
    expect(s.maxCursor).toBe(summaryIndex(s) + 1);
  });

  it('cannot leave an exercise before it has a final or pending answer', () => {
    let s = start({ cursor: 4 });
    expect(next(s)).toBe(s);
    s = answer(s, 'k1', wrong1());
    expect(selectView(s)).toMatchObject({ canAdvance: false, canSubmit: true, feedback: expect.objectContaining({ verdict: 'incorrect' }) });
    expect(next(s)).toBe(s);
    s = answer(s, 'k2', submitResult({ attemptNo: 2 }));
    expect(selectView(s).canAdvance).toBe(true);
  });

  it('goes back through content steps but not to past exercises', () => {
    let s = start();
    s = next(next(s));
    expect(apply(s, { type: 'go_to', cursor: 0 }).cursor).toBe(0);
    s = next(next(s)); // first exercise, maxCursor 4
    s = next(answer(s, 'k1'));
    expect(s.cursor).toBe(5);
    expect(apply(s, { type: 'go_to', cursor: 4 }).cursor).toBe(5); // a past exercise
    expect(apply(s, { type: 'go_to', cursor: 6 }).cursor).toBe(5); // beyond the frontier
    const back = apply(s, { type: 'go_to', cursor: 3 });
    expect(back.cursor).toBe(3);
    expect(apply(back, { type: 'go_to', cursor: 5 }).cursor).toBe(5); // return to the frontier
  });

  it('ignores a second submit while one is in flight', () => {
    let s = start({ cursor: 4 });
    s = apply(s, { type: 'submit_start', key: 'k1', exerciseId: 'e1' });
    expect(apply(s, { type: 'submit_start', key: 'k2', exerciseId: 'e1' })).toBe(s);
    expect(apply(s, { type: 'submit_result', key: 'k2', result: submitResult() })).toBe(s);
    expect(selectView(s)).toMatchObject({ submitting: true, canSubmit: false, canAdvance: false });
  });

  it('keeps the learner on the exercise when the server rejects the answer', () => {
    let s = start({ cursor: 4 });
    s = apply(s, { type: 'submit_start', key: 'k1', exerciseId: 'e1' }, { type: 'submit_failed', key: 'k1', code: 'invalid_response' });
    expect(s.submitError).toBe('invalid_response');
    expect(selectView(s).canSubmit).toBe(true);
  });
});

describe('playerMachine — retry queue', () => {
  it('appends an exercise wrong twice to the end of the lesson and serves it before the summary', () => {
    let s = start({ cursor: 4 });
    s = answer(s, 'k1', wrong1());
    s = answer(s, 'k2', wrong2());
    expect(selectView(s).feedback).toMatchObject({ revealed: true });
    expect(s.entries.map((e) => `${e.exerciseId}${e.retry ? '*' : ''}`)).toEqual(['e1', 'e2', 'e3', 'e4', 'e1*']);
    s = next(s);
    for (let i = 0; i < 3; i++) s = next(answer(s, `m${i}`));
    const v = selectView(s);
    expect(v).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e1' }), step: 'application', exerciseNumber: 5, exerciseCount: 5 });
    // The redo starts fresh: the earlier revealed answer is not shown before answering again.
    expect(v.feedback).toBeNull();
    expect(v.canSubmit).toBe(true);
    s = answer(s, 'r1', submitResult({ attemptNo: 3 }));
    expect(selectView(s).feedback).toMatchObject({ attemptNo: 3 });
    s = next(s);
    expect(selectView(s).kind).toBe('summary');
    expect(canComplete(s)).toBe(true);
  });

  it('does not queue the same exercise twice while a redo is still open', () => {
    let s = start({ cursor: 4 });
    s = answer(s, 'k1', wrong1());
    s = answer(s, 'k2', wrong2());
    s = apply(s, { type: 'sync_result', key: 'k2', exerciseId: 'e1', result: wrong2() });
    expect(s.entries.filter((e) => e.exerciseId === 'e1')).toHaveLength(2);
  });
});

describe('playerMachine — offline and sync', () => {
  it('never shows an unconfirmed verdict and lets the learner continue', () => {
    let s = start({ cursor: 4 });
    s = answer(s, 'k1', wrong1());
    s = answerOffline(s, 'k2');
    const v = selectView(s);
    expect(v).toMatchObject({ pendingSync: true, feedback: null, canAdvance: true, canSubmit: false });
    s = next(s);
    expect(selectView(s).exercise?.id).toBe('e2');
  });

  it('gives a second try at the end when a queued first answer syncs as wrong', () => {
    let s = start({ cursor: 4 });
    s = next(answerOffline(s, 'k1'));
    s = apply(s, { type: 'sync_result', key: 'k1', exerciseId: 'e1', result: wrong1() });
    expect(s.entries.at(-1)).toEqual({ exerciseId: 'e1', retry: true, submitted: false });
    expect(s.exercises.e1?.pendingKeys).toEqual([]);
  });

  it('lets the learner retry in place when the sync lands while still on the exercise', () => {
    let s = start({ cursor: 4 });
    s = answerOffline(s, 'k1');
    s = apply(s, { type: 'sync_result', key: 'k1', exerciseId: 'e1', result: wrong1() });
    expect(s.entries).toHaveLength(4);
    expect(selectView(s)).toMatchObject({ pendingSync: false, canSubmit: true, feedback: expect.objectContaining({ verdict: 'incorrect' }) });
  });

  it('ignores an older attempt arriving after a newer one but keeps a final result', () => {
    let s = start({ cursor: 4 });
    s = answer(s, 'k2', submitResult({ attemptNo: 2 }));
    s = apply(s, { type: 'sync_result', key: 'k1', exerciseId: 'e1', result: wrong1() });
    expect(s.exercises.e1).toMatchObject({ final: true, graded: expect.objectContaining({ attemptNo: 2, verdict: 'correct' }) });
  });

  it('blocks completion while anything is pending, then redirects to redo items from the summary', () => {
    let s = start({ cursor: 4 });
    s = next(answerOffline(s, 'k1'));
    for (let i = 0; i < 3; i++) s = next(answer(s, `m${i}`));
    s = apply(s, { type: 'outbox_size', size: 1 });
    expect(selectView(s)).toMatchObject({ kind: 'summary', pendingSync: true, canComplete: false });
    expect(apply(s, { type: 'complete_start' })).toBe(s);

    s = apply(s, { type: 'sync_result', key: 'k1', exerciseId: 'e1', result: wrong1() }, { type: 'outbox_size', size: 0 });
    expect(selectView(s)).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e1' }), canSubmit: true });
    s = next(answer(s, 'k3', submitResult({ attemptNo: 2 })));
    expect(selectView(s)).toMatchObject({ kind: 'summary', canComplete: true });
  });

  it('blocks completion while the outbox holds items of other runs', () => {
    let s = start({ cursor: 4 });
    for (let i = 0; i < 4; i++) s = next(answer(s, `k${i}`));
    expect(canComplete(apply(s, { type: 'outbox_size', size: 2 }))).toBe(false);
    expect(canComplete(s)).toBe(true);
  });

  it('re-serves an exercise whose queued answer the server rejected', () => {
    let s = start({ cursor: 4 });
    s = next(answerOffline(s, 'k1'));
    for (let i = 0; i < 3; i++) s = next(answer(s, `m${i}`));
    s = apply(s, { type: 'sync_failed', key: 'k1', exerciseId: 'e1' });
    expect(selectView(s)).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e1' }) });
  });
});

describe('playerMachine — resume', () => {
  const attempts = [
    { exercise_id: 'e1', attempt_no: 2, verdict: 'incorrect', is_correct: false, revealed: true, feedback_json: { display_answer: 'Hello' } },
    { exercise_id: 'e2', attempt_no: 1, verdict: 'incorrect', is_correct: false, revealed: false, feedback_json: { feedback_vi: 'Thiếu be' } },
  ];

  it('resumes at the saved cursor with the stored verdict and feedback', () => {
    const s = start({ cursor: 5, queue: ['e1', 'e2', 'e3', 'e4', 'e1'], attempts });
    const v = selectView(s);
    expect(v).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e2' }), exerciseCount: 5, canSubmit: true });
    expect(v.feedback).toMatchObject({ verdict: 'incorrect', feedback: expect.objectContaining({ feedbackVi: 'Thiếu be' }) });
    expect(s.entries.at(-1)).toEqual({ exerciseId: 'e1', retry: true, submitted: false });
    expect(s.exercises.e1?.final).toBe(true);
  });

  it('marks redo entries already passed as submitted', () => {
    const s = start({ cursor: 9, queue: ['e1', 'e2', 'e3', 'e4', 'e1'], attempts: attempts.slice(0, 1) });
    expect(s.entries[4]?.submitted).toBe(true);
  });

  it('merges pending outbox items so their exercises show as waiting, not unanswered', () => {
    const s = start({ cursor: 5, attempts }, { pending: [{ idempotencyKey: 'k9', exerciseId: 'e2' }], outboxSize: 1 });
    expect(selectView(s)).toMatchObject({ pendingSync: true, feedback: null, canAdvance: true, canSubmit: false });
    expect(s.outboxSize).toBe(1);
    expect(canComplete(s)).toBe(false);
  });

  it('adds redo entries when resuming at the summary with unfinished exercises', () => {
    const s = start({ cursor: 8, attempts: [...attempts, ...['e3', 'e4'].map((id) => ({ exercise_id: id, attempt_no: 1, verdict: 'correct', is_correct: true, revealed: false }))] });
    expect(selectView(s)).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e2' }) });
    expect(s.entries).toHaveLength(5);
  });

  it('drops queue ids the lesson no longer has and clamps the cursor', () => {
    const s = start({ cursor: 50, queue: ['e1', 'gone', 'e2'] });
    expect(s.entries.map((e) => e.exerciseId)).toEqual(['e1', 'e2', 'e1', 'e2']);
    expect(selectView(s).exercise?.id).toBe('e1');
  });

  it('opens a completed run on the next-review step', () => {
    const s = start({ status: 'completed', cursor: 8 });
    expect(selectView(s).kind).toBe('next_review');
    expect(s.completion.status).toBe('completed');
  });

  it('round-trips through a run snapshot', () => {
    let s = start({ cursor: 4 });
    s = next(answer(s, 'k1', submitResult({ verdict: 'almost', score: 0.8 })));
    const restored = initPlayer({ lesson, run: toRunSnapshot(s) });
    expect(restored.cursor).toBe(5);
    expect(restored.exercises.e1).toEqual(s.exercises.e1);
    expect(restored.entries).toEqual(s.entries);
  });
});

describe('playerMachine — completion', () => {
  it('records a failed completion and allows another try', () => {
    let s = start({ cursor: 4 });
    for (let i = 0; i < 4; i++) s = next(answer(s, `k${i}`));
    s = apply(s, { type: 'complete_start' });
    expect(canComplete(s)).toBe(false);
    s = apply(s, { type: 'complete_failed', code: 'attempts_incomplete' });
    expect(s.completion).toEqual({ status: 'error', result: null, error: 'attempts_incomplete' });
    expect(canComplete(s)).toBe(true);
  });
});
