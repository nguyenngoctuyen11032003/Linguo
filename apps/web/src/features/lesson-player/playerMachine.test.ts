import type { LessonPayload } from '@linguo/shared';
import { describe, expect, it } from 'vitest';
import { EX1, EX2, attempt, payload, result, run } from './lesson-fixtures';
import {
  attemptsFor,
  buildSteps,
  exerciseStateFor,
  initialPlayerState,
  playerReducer,
  unresolvedSteps,
  type PlayerState,
} from './playerMachine';

const COMPLETE = {
  accuracy_by_stage: { recognition: 1, recall: null, application: null },
  almost_count: 0,
  confident_wrong: 0,
  unsure_right: 0,
  next_review_at: '2026-10-14T00:00:00+07:00',
  completed_at: '2026-10-13T08:00:00Z',
};

function loaded(overrides: Partial<LessonPayload> = {}, stepIndex = 0): PlayerState {
  const p = payload(overrides);
  return playerReducer(initialPlayerState, { type: 'loaded', payload: p, run: p.run!, stepIndex });
}

describe('buildSteps', () => {
  it('orders content steps, one exercise per queue entry, then summary and next review', () => {
    expect(buildSteps(payload(), [EX1, EX2])).toEqual([
      { kind: 'objective' },
      { kind: 'explain' },
      { kind: 'examples' },
      { kind: 'mistake' },
      { kind: 'exercise', exerciseId: EX1, stage: 'recognition', recheck: false, queueIndex: 0 },
      { kind: 'exercise', exerciseId: EX2, stage: 'recall', recheck: false, queueIndex: 1 },
      { kind: 'summary' },
      { kind: 'next_review' },
    ]);
  });

  it('marks queue entries past the lesson exercises as re-checks', () => {
    const steps = buildSteps(payload(), [EX1, EX2, EX1]);
    expect(steps.filter((s) => s.kind === 'exercise').at(-1)).toEqual({
      kind: 'exercise',
      exerciseId: EX1,
      stage: 'recognition',
      recheck: true,
      queueIndex: 2,
    });
  });

  it('marks re-checks by repeated id even when the published exercises changed since the run started', () => {
    // EX2 was unpublished after the run started: index 1 >= exercises.length but it is not a re-check.
    const onlyEx1 = payload({ exercises: payload().exercises.filter((e) => e.id === EX1) });
    expect(buildSteps(onlyEx1, [EX1, EX2, EX1]).flatMap((s) => (s.kind === 'exercise' ? [[s.queueIndex, s.recheck]] : []))).toEqual([
      [0, false],
      [2, true],
    ]);
    // A third exercise was published after the run started: the appended re-check at index 2 is still a re-check.
    const ex3 = { ...payload().exercises[0]!, id: '50000000-0000-4000-8000-000000000003' };
    const more = payload({ exercises: [...payload().exercises, ex3] });
    expect(buildSteps(more, [EX1, EX2, EX1]).filter((s) => s.kind === 'exercise').at(-1)).toMatchObject({ queueIndex: 2, recheck: true });
  });

  it('skips content steps whose blocks are missing', () => {
    const base = payload();
    const p = payload({ lesson: { ...base.lesson, objectives: [], body: [{ type: 'deep_explain', text: { vi: 'Sâu' } }] } });
    expect(buildSteps(p, [EX1]).map((s) => s.kind)).toEqual(['explain', 'exercise', 'summary', 'next_review']);
  });

  it('keeps the objective step when only lesson objectives exist', () => {
    const base = payload();
    const p = payload({ lesson: { ...base.lesson, body: [] } });
    expect(buildSteps(p, []).map((s) => s.kind)).toEqual(['objective', 'summary', 'next_review']);
  });

  it('skips queue ids that are not lesson exercises', () => {
    const steps = buildSteps(payload(), [EX1, '50000000-0000-4000-8000-0000000000ff']);
    expect(steps.filter((s) => s.kind === 'exercise')).toHaveLength(1);
  });
});

describe('playerReducer', () => {
  it('loads steps from the run queue and clamps the step index', () => {
    const state = loaded({}, 99);
    expect(state.steps).toHaveLength(8);
    expect(state.stepIndex).toBe(7);
    expect(playerReducer(state, { type: 'goto', index: -3 }).stepIndex).toBe(0);
    expect(playerReducer(state, { type: 'goto', index: 4 }).stepIndex).toBe(4);
  });

  it('restores pending outbox entries on load', () => {
    const p = payload();
    const state = playerReducer(initialPlayerState, {
      type: 'loaded',
      payload: p,
      run: p.run!,
      stepIndex: 4,
      pending: [{ exerciseId: EX1, queueIndex: 0 }],
    });
    expect(exerciseStateFor(state, EX1, 0).status).toBe('pending_sync');
  });

  it('tracks submitting → graded', () => {
    let state = loaded();
    state = playerReducer(state, { type: 'submitting', exerciseId: EX1, queueIndex: 0 });
    expect(exerciseStateFor(state, EX1, 0)).toEqual({ status: 'submitting', attempts: 0, lastResult: null });
    const graded = result({ verdict: 'incorrect', is_correct: false, score: 0, final: false, display_answer: null });
    state = playerReducer(state, { type: 'graded', exerciseId: EX1, queueIndex: 0, result: graded });
    expect(exerciseStateFor(state, EX1, 0)).toEqual({ status: 'graded', attempts: 1, lastResult: graded });
    // A replayed copy of the same attempt is not counted twice.
    state = playerReducer(state, { type: 'graded', exerciseId: EX1, queueIndex: 0, result: { ...graded, replayed: true } });
    expect(exerciseStateFor(state, EX1, 0).attempts).toBe(1);
  });

  it('tracks pending → idle on a server failure', () => {
    let state = loaded();
    state = playerReducer(state, { type: 'pending', exerciseId: EX2, queueIndex: 1 });
    expect(exerciseStateFor(state, EX2, 1).status).toBe('pending_sync');
    state = playerReducer(state, { type: 'failed', exerciseId: EX2, queueIndex: 1 });
    expect(exerciseStateFor(state, EX2, 1)).toEqual({ status: 'idle', attempts: 0, lastResult: null });
  });

  it('appends a re-check step when a result is requeued, only once', () => {
    let state = loaded({}, 5);
    const revealed = result({ verdict: 'incorrect', is_correct: false, revealed: true, final: true, requeued: true });
    state = playerReducer(state, { type: 'graded', exerciseId: EX2, queueIndex: 1, result: revealed });
    expect(state.run!.queue).toEqual([EX1, EX2, EX2]);
    expect(state.steps).toHaveLength(9);
    expect(state.steps[6]).toEqual({ kind: 'exercise', exerciseId: EX2, stage: 'recall', recheck: true, queueIndex: 2 });
    expect(state.stepIndex).toBe(5);
    state = playerReducer(state, { type: 'graded', exerciseId: EX2, queueIndex: 1, result: { ...revealed, attempt_id: '90000000-0000-4000-8000-0000000009ff', replayed: true } });
    expect(state.run!.queue).toEqual([EX1, EX2, EX2]);
  });

  it('replaces the queue on queueChanged', () => {
    const state = playerReducer(loaded(), { type: 'queueChanged', queue: [EX1] });
    expect(state.steps.filter((s) => s.kind === 'exercise')).toHaveLength(1);
  });

  it('records completion', () => {
    const state = playerReducer(loaded(), { type: 'completed', result: COMPLETE });
    expect(state.completeResult).toEqual(COMPLETE);
    expect(state.run).toMatchObject({ status: 'completed', next_review_at: COMPLETE.next_review_at });
  });
});

describe('outbox sync', () => {
  it('clears only pending entries that left the outbox', () => {
    let state = loaded();
    state = playerReducer(state, { type: 'pending', exerciseId: EX1, queueIndex: 0 });
    state = playerReducer(state, { type: 'submitting', exerciseId: EX2, queueIndex: 1 });
    state = playerReducer(state, {
      type: 'outboxCleared',
      entries: [
        { exerciseId: EX1, queueIndex: 0 },
        { exerciseId: EX2, queueIndex: 1 },
      ],
    });
    expect(state.local).toEqual({ [`${EX2}#1`]: 'submitting' });
  });

  it('merges refetched attempts with local ones and keeps the longer queue', () => {
    let state = loaded();
    const local = result({ verdict: 'incorrect', is_correct: false, revealed: true, requeued: true });
    state = playerReducer(state, { type: 'graded', exerciseId: EX1, queueIndex: 0, result: local });
    const server = attempt(EX2);
    state = playerReducer(state, { type: 'attemptsSynced', attempts: [server], queue: [EX1, EX2] });
    expect(state.attempts.map((a) => a.attempt_id)).toEqual([server.attempt_id, local.attempt_id]);
    expect(state.run?.queue).toEqual([EX1, EX2, EX1]);
    expect(exerciseStateFor(state, EX2, 1).status).toBe('graded');
  });
});

describe('exerciseStateFor', () => {
  it('derives graded state from loaded attempts', () => {
    const a1 = attempt(EX1, { verdict: 'incorrect', is_correct: false, final: false });
    const a2 = attempt(EX1, { attempt_no: 2 });
    const state = loaded({ attempts: [a1, a2] });
    const ui = exerciseStateFor(state, EX1, 0);
    expect(ui.status).toBe('graded');
    expect(ui.attempts).toBe(2);
    expect(ui.lastResult).toMatchObject({ attempt_id: a2.attempt_id, replayed: false });
    expect(ui.lastResult).not.toHaveProperty('exercise_id');
    expect(exerciseStateFor(state, EX2, 1)).toEqual({ status: 'idle', attempts: 0, lastResult: null });
  });

  it('splits attempts between the first pass and the re-check entry', () => {
    const first = attempt(EX1, { verdict: 'incorrect', is_correct: false, final: false });
    const reveal = attempt(EX1, { attempt_no: 2, verdict: 'incorrect', is_correct: false, revealed: true, final: true, requeued: true });
    const recheck = attempt(EX1, { attempt_no: 3, after_reveal: true });
    const state = loaded({ run: run({ queue: [EX1, EX2, EX1] }), attempts: [first, reveal, recheck] });
    expect(attemptsFor(state, EX1, 0).map((a) => a.attempt_no)).toEqual([1, 2]);
    expect(attemptsFor(state, EX1, 2).map((a) => a.attempt_no)).toEqual([3]);
    expect(exerciseStateFor(state, EX1, 0).lastResult).toMatchObject({ revealed: true });
    expect(exerciseStateFor(state, EX1, 2)).toMatchObject({ status: 'graded', attempts: 1 });
  });

  it('starts a re-check entry idle and marks a locally graded re-check as after_reveal', () => {
    const reveal = attempt(EX1, { verdict: 'incorrect', is_correct: false, revealed: true, final: true, requeued: true });
    let state = loaded({ run: run({ queue: [EX1, EX2, EX1] }), attempts: [reveal] });
    expect(exerciseStateFor(state, EX1, 2)).toEqual({ status: 'idle', attempts: 0, lastResult: null });
    state = playerReducer(state, { type: 'graded', exerciseId: EX1, queueIndex: 2, result: result() });
    expect(exerciseStateFor(state, EX1, 2)).toMatchObject({ status: 'graded', attempts: 1 });
    expect(exerciseStateFor(state, EX1, 0).attempts).toBe(1);
  });
});

describe('unresolvedSteps', () => {
  it('lists exercise steps without a final result, skipping entries in flight', () => {
    const wrong = attempt(EX2, { verdict: 'incorrect', is_correct: false, score: 0, final: false });
    let state = loaded({ attempts: [wrong] });
    expect(unresolvedSteps(state)).toEqual([4, 5]);
    state = playerReducer(state, { type: 'pending', exerciseId: EX1, queueIndex: 0 });
    expect(unresolvedSteps(state)).toEqual([5]);
    state = playerReducer(state, { type: 'graded', exerciseId: EX2, queueIndex: 1, result: result() });
    expect(unresolvedSteps(state)).toEqual([]);
  });

  it('keeps a re-check entry unresolved until it has its own final attempt', () => {
    const revealed = attempt(EX1, { verdict: 'incorrect', is_correct: false, score: 0, revealed: true, final: true, requeued: true });
    const state = loaded({ run: run({ queue: [EX1, EX2, EX1] }), attempts: [revealed, attempt(EX2)] });
    expect(unresolvedSteps(state)).toEqual([6]);
  });
});
