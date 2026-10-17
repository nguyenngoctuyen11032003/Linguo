import { describe, expect, it } from 'vitest';
import fixtures from './grading.fixtures.json';
import type { AnswerLang, ExerciseResponse, ExerciseType } from './exercises';
import {
  advanceLocalCursor,
  applyLocalAttempt,
  completeLocalRun,
  LocalRunError,
  localRunToPayload,
  nextLocalMidnight,
  packQueue,
  startLocalRun,
  summarizeLocalRun,
  syncLocalRunToPack,
  unresolvedExerciseIds,
  type LocalRun,
} from './localRun';
import { lessonPayloadSchema, type OfflineKey, type OfflinePack, type PublicExercise } from './rpc';

const uuid = (n: number, prefix = 'e') => `${prefix.repeat(8).slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LESSON = uuid(1, 'a');
const PATH = uuid(2, 'b');
const RUN = uuid(3, 'c');
const SCORES = { correct: 1, almost: 0.8, incorrect: 0 } as const;

const exercise = (n: number, type: ExerciseType, stage: PublicExercise['stage'], order: number, lang: AnswerLang = 'en'): PublicExercise => ({
  id: uuid(n),
  key: `ex:${n}`,
  version: 1,
  order_index: order,
  type,
  stage,
  answer_lang: lang,
  item_id: null,
  difficulty: 1,
  prompt: {},
});
const key = (ex: PublicExercise, answer_key: Record<string, unknown>, extra: Partial<OfflineKey> = {}): OfflineKey => ({
  exercise_id: ex.id,
  version: ex.version,
  answer_key,
  rubric: {},
  known_wrong: [],
  explanation: { vi: `Giải thích ${ex.key}` },
  display_answer: `Đáp án ${ex.key}`,
  created_at: '2026-10-01T00:00:00.000Z',
  ...extra,
});

// The same lesson as supabase/tests/lesson_runs.test.sql: mcq (recognition), fill (recall), translate (application).
const MCQ = exercise(31, 'mcq', 'recognition', 3);
const FILL = exercise(32, 'fill_blank', 'recall', 2);
const TR = exercise(33, 'translate', 'application', 1);
const KEYS: Record<string, OfflineKey> = {
  [MCQ.id]: key(MCQ, { correct_option_id: 'o1' }, { display_answer: 'Hello', explanation: { vi: 'Hello là lời chào.' } }),
  [FILL.id]: key(FILL, { blanks: { b1: ['meet'] } }),
  [TR.id]: key(TR, { accepted: ['Hello', 'Hi', 'Hello there'] }, { rubric: { typo_tolerance: 1 } }),
};
const PACK: OfflinePack = {
  lesson: {
    id: LESSON,
    key: 'en:lesson:l1',
    language_code: 'en',
    level_code: 'pre_a1',
    title: { vi: 'Chào hỏi' },
    objectives: [{ vi: 'Chào' }],
    body: [{ type: 'objective', text: { vi: 'Chào hỏi' } }],
    estimated_minutes: 5,
    skills: ['vocabulary'],
    content_version: 1,
    is_demo: false,
    unit_title: { vi: 'Đơn vị' },
    program_title: { vi: 'Chương trình' },
  },
  items: [],
  // Authored order is reversed, as in the SQL test: the queue must follow the stage order.
  exercises: [TR, FILL, MCQ],
  content_version: 1,
  keys: Object.values(KEYS),
};
const PUBLISHED = new Set(PACK.exercises.map((e) => e.id));
const T0 = '2026-10-17T08:00:00.000Z';

let counter = 100;
function answer(run: LocalRun, ex: PublicExercise, response: ExerciseResponse, confidence: 1 | 2 | 3 | null = 2) {
  return applyLocalAttempt(run, {
    exercise: ex,
    key: KEYS[ex.id]!,
    response,
    confidence,
    idempotencyKey: uuid(counter++, 'd'),
    clientAt: T0,
  });
}
const fresh = () => startLocalRun({ id: RUN, pathId: PATH, pack: PACK, now: T0 });

describe('applyLocalAttempt: parity with grading.fixtures.json (the server grades the same cases)', () => {
  let ran = 0;
  for (const c of fixtures.grade) {
    it(c.name, () => {
      const ex = { ...exercise(900, c.type as ExerciseType, 'recall', 1, c.lang as AnswerLang) };
      const k = key(ex, c.answer, { rubric: ('rubric' in c ? c.rubric : {}) as Record<string, unknown>, known_wrong: ('known_wrong' in c ? c.known_wrong : []) as OfflineKey['known_wrong'] });
      const run: LocalRun = { ...fresh(), queue: [ex.id] };
      let out;
      try {
        out = applyLocalAttempt(run, { exercise: ex, key: k, response: c.response as ExerciseResponse, confidence: null, idempotencyKey: uuid(1, 'f'), clientAt: T0 });
      } catch (error) {
        // A response the server refuses as invalid_response before grading (lesson_response_valid) is not a grading case.
        expect(error).toBeInstanceOf(LocalRunError);
        expect((error as LocalRunError).code).toBe('invalid_response');
        return;
      }
      ran += 1;
      const verdict = c.expected.verdict as 'correct' | 'almost' | 'incorrect';
      expect(out.result.verdict).toBe(verdict);
      expect(out.result.score).toBe(SCORES[verdict]);
      expect(out.result.error_tags).toEqual(c.expected.error_tags);
      expect(out.result.feedback_vi).toBe(c.expected.feedback_vi);
      expect(out.result.is_correct).toBe(verdict !== 'incorrect');
    });
  }
  it('graded the large majority of the fixtures (not skipped as invalid)', () => {
    expect(ran).toBeGreaterThan(fixtures.grade.length * 0.8);
  });
});

describe('applyLocalAttempt: run rules (mirrors supabase/tests/lesson_runs.test.sql)', () => {
  it('queues the exercises by stage, not by authored order', () => {
    expect(packQueue(PACK)).toEqual([MCQ.id, FILL.id, TR.id]);
    expect(fresh().queue).toEqual([MCQ.id, FILL.id, TR.id]);
  });

  it('first wrong answer reveals nothing', () => {
    const { result } = answer(fresh(), MCQ, { option_id: 'o2' });
    expect({ ...result, attempt_id: undefined }).toEqual({
      attempt_id: undefined,
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
    });
  });

  it('second wrong answer reveals and re-queues; the re-check is attempt 3, after the reveal, not re-queued', () => {
    let run = fresh();
    run = answer(run, MCQ, { option_id: 'o2' }).run;
    const second = answer(run, MCQ, { option_id: 'o2' });
    expect(second.result).toMatchObject({ attempt_no: 2, revealed: true, final: true, requeued: true, display_answer: 'Hello', explanation: { vi: 'Hello là lời chào.' } });
    expect(second.run.queue).toEqual([MCQ.id, FILL.id, TR.id, MCQ.id]);
    const third = answer(second.run, MCQ, { option_id: 'o1' });
    expect(third.result).toMatchObject({ attempt_no: 3, verdict: 'correct', requeued: false });
    expect(third.attempt.after_reveal).toBe(true);
    expect(third.run.queue).toHaveLength(4);
  });

  it('give-up on the first attempt reveals and re-queues', () => {
    const { result, run } = answer(fresh(), MCQ, { give_up: true });
    expect(result).toMatchObject({ attempt_no: 1, verdict: 'incorrect', score: 0, revealed: true, final: true, requeued: true, display_answer: 'Hello' });
    expect(run.attempts[0]!.gave_up).toBe(true);
  });

  it('almost reveals without a re-check', () => {
    const { result, run } = answer(fresh(), TR, { text: 'Hallo' });
    expect(result).toMatchObject({ verdict: 'almost', score: 0.8, revealed: true, final: true, requeued: false });
    expect(run.queue).toHaveLength(3);
  });

  it('correct answer reveals the display answer', () => {
    expect(answer(fresh(), TR, { text: 'hello!' }).result).toMatchObject({ verdict: 'correct', display_answer: `Đáp án ${TR.key}` });
  });

  it('replaying the same key returns the stored result and stores nothing; another payload conflicts', () => {
    const first = answer(fresh(), MCQ, { option_id: 'o2' });
    const again = applyLocalAttempt(first.run, {
      exercise: MCQ,
      key: KEYS[MCQ.id]!,
      response: { option_id: 'o2' },
      confidence: 2,
      idempotencyKey: first.attempt.idempotency_key,
      clientAt: T0,
    });
    expect(again.result).toEqual({ ...first.result, replayed: true });
    expect(again.run.attempts).toHaveLength(1);
    expect(() =>
      applyLocalAttempt(first.run, { exercise: MCQ, key: KEYS[MCQ.id]!, response: { option_id: 'o1' }, confidence: 2, idempotencyKey: first.attempt.idempotency_key, clientAt: T0 }),
    ).toThrow(expect.objectContaining({ code: 'idempotency_conflict' }));
  });

  it('refuses the same errors as the server', () => {
    const run = fresh();
    const other = exercise(77, 'mcq', 'recognition', 9);
    expect(() => answer(run, MCQ, { text: 'x' } as unknown as ExerciseResponse)).toThrow(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => answer(run, TR, { text: 'x'.repeat(301) })).toThrow(expect.objectContaining({ code: 'invalid_response' }));
    expect(() => applyLocalAttempt(run, { exercise: other, key: key(other, { correct_option_id: 'o1' }), response: { option_id: 'o1' }, confidence: null, idempotencyKey: uuid(5, 'f'), clientAt: T0 })).toThrow(
      expect.objectContaining({ code: 'exercise_not_in_lesson' }),
    );
    expect(() => applyLocalAttempt(run, { exercise: MCQ, key: { ...KEYS[MCQ.id]!, version: 2 }, response: { option_id: 'o1' }, confidence: null, idempotencyKey: uuid(6, 'f'), clientAt: T0 })).toThrow(
      expect.objectContaining({ code: 'exercise_version_mismatch' }),
    );
    const done = { ...run, status: 'completed' as const };
    expect(() => answer(done, MCQ, { option_id: 'o1' })).toThrow(expect.objectContaining({ code: 'run_not_active' }));
  });
});

describe('summarizeLocalRun (complete_lesson)', () => {
  const NOW = new Date('2026-10-17T10:00:00.000Z');
  const opts = { publishedIds: PUBLISHED, now: NOW, timeZone: 'Asia/Ho_Chi_Minh' };

  /** The scenario of lesson_runs.test.sql: mcq wrong twice then re-checked, fill and translate correct. */
  function scenario() {
    let run = fresh();
    run = answer(run, MCQ, { option_id: 'o2' }).run;
    run = answer(run, MCQ, { option_id: 'o2' }).run;
    run = answer(run, FILL, { blanks: { b1: 'Meet' } }).run;
    run = answer(run, TR, { text: 'hello!' }).run;
    return run;
  }

  it('cannot complete before the re-check', () => {
    expect(unresolvedExerciseIds(scenario(), PUBLISHED)).toEqual([MCQ.id]);
    expect(summarizeLocalRun(scenario(), opts)).toEqual({ ok: false, error: 'attempts_incomplete' });
  });

  it('cannot complete with an unanswered exercise', () => {
    expect(summarizeLocalRun(fresh(), opts)).toEqual({ ok: false, error: 'attempts_incomplete' });
    const half = answer(fresh(), MCQ, { option_id: 'o2' }).run;
    // A single wrong answer is not final.
    expect(unresolvedExerciseIds(half, PUBLISHED)).toContain(MCQ.id);
  });

  it('accuracy over first attempts, counters and next review at local midnight', () => {
    const run = answer(scenario(), MCQ, { option_id: 'o1' }).run;
    const out = summarizeLocalRun(run, opts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary.accuracy_by_stage).toEqual({ recognition: 0, recall: 1, application: 1 });
    expect(out.summary).toMatchObject({ almost_count: 0, confident_wrong: 0, unsure_right: 0 });
    // 10:00Z = 17:00 on 2026-10-17 in Ho Chi Minh; the next local midnight is 2026-10-18 00:00 (+07) = 17:00Z.
    expect(out.summary.next_review_at).toBe('2026-10-17T17:00:00.000Z');
    expect(out.summary.completed_at).toBe(NOW.toISOString());
    const completed = completeLocalRun(run, out.summary);
    expect(completed).toMatchObject({ status: 'completed', completed_at: NOW.toISOString(), next_review_at: '2026-10-17T17:00:00.000Z' });
    // Idempotent.
    expect(summarizeLocalRun(completed, opts)).toEqual({ ok: true, summary: out.summary });
    expect(completeLocalRun(completed, out.summary)).toBe(completed);
  });

  it('counts almost / confident wrong / unsure right before the reveal only', () => {
    let run = fresh();
    run = answer(run, MCQ, { option_id: 'o2' }, 3).run; // confident wrong
    run = answer(run, MCQ, { option_id: 'o1' }, 1).run; // second attempt, correct, unsure
    run = answer(run, FILL, { blanks: { b1: 'meet' } }, 1).run; // unsure right
    run = answer(run, TR, { text: 'Hallo' }, 2).run; // almost
    const out = summarizeLocalRun(run, opts);
    expect(out.ok && out.summary).toMatchObject({ almost_count: 1, confident_wrong: 1, unsure_right: 2 });
    // accuracy: recognition first attempt wrong, recall right, application almost counts as correct.
    expect(out.ok && out.summary.accuracy_by_stage).toEqual({ recognition: 0, recall: 1, application: 1 });
  });

  it('a stage without attempts has null accuracy', () => {
    const only: LocalRun = { ...fresh(), queue: [FILL.id] };
    const run = answer(only, FILL, { blanks: { b1: 'meet' } }).run;
    const out = summarizeLocalRun(run, { ...opts, publishedIds: new Set([FILL.id]) });
    expect(out.ok && out.summary.accuracy_by_stage).toEqual({ recognition: null, recall: 1, application: null });
  });
});

describe('nextLocalMidnight', () => {
  it('handles zones ahead of and behind UTC and DST', () => {
    expect(nextLocalMidnight(new Date('2026-10-17T10:00:00Z'), 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-10-17T17:00:00.000Z');
    expect(nextLocalMidnight(new Date('2026-10-17T20:00:00Z'), 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-10-18T17:00:00.000Z');
    expect(nextLocalMidnight(new Date('2026-10-17T10:00:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-10-18T07:00:00.000Z');
    // Europe/Berlin leaves summer time on 2026-10-25 02:00 local: the midnight after Oct 24 is still +02:00, after Oct 25 it is +01:00.
    expect(nextLocalMidnight(new Date('2026-10-24T12:00:00Z'), 'Europe/Berlin').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(nextLocalMidnight(new Date('2026-10-25T12:00:00Z'), 'Europe/Berlin').toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

describe('payload, cursor and content-version remap', () => {
  it('builds a lessonPayloadSchema-valid payload; unrevealed attempts carry no answer fields', () => {
    const run = answer(fresh(), MCQ, { option_id: 'o2' }).run;
    const payload = localRunToPayload(PACK, run);
    expect(lessonPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.run).toMatchObject({ id: RUN, status: 'in_progress', cursor: 0, queue: [MCQ.id, FILL.id, TR.id], next_review_at: null, summary: null });
    expect(payload.attempts[0]).toMatchObject({ display_answer: null, explanation: null, exercise_id: MCQ.id });
  });

  it('the cursor only moves forward', () => {
    const run = advanceLocalCursor(fresh(), 3);
    expect(advanceLocalCursor(run, 1).cursor).toBe(3);
    expect(advanceLocalCursor(run, 5).cursor).toBe(5);
  });

  it('drops retired exercises (re-check duplicates too), keeps order and appends new ones by stage', () => {
    let run = answer(fresh(), MCQ, { give_up: true }).run; // queue: mcq fill tr mcq
    expect(run.queue).toEqual([MCQ.id, FILL.id, TR.id, MCQ.id]);
    const fresh1 = exercise(40, 'mcq', 'recognition', 1);
    const fresh2 = exercise(41, 'translate', 'application', 5);
    const next: Pick<OfflinePack, 'lesson' | 'exercises'> = {
      lesson: { ...PACK.lesson, content_version: 2 },
      // MCQ retired.
      exercises: [FILL, TR, fresh2, fresh1],
    };
    run = syncLocalRunToPack(run, next);
    expect(run.content_version).toBe(2);
    expect(run.queue).toEqual([FILL.id, TR.id, fresh1.id, fresh2.id]);
    expect(run.attempts).toHaveLength(1);
    // Same version / completed: unchanged.
    expect(syncLocalRunToPack(run, next)).toBe(run);
    const done = { ...run, status: 'completed' as const, content_version: 1 };
    expect(syncLocalRunToPack(done, next)).toBe(done);
  });
});
