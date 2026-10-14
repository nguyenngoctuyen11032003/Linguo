import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { DEFAULT_RUBRIC, gradeExamAnswer, gradeResponse, sessionPlanSchema, type ExerciseResponse, type GradeInput } from '@linguo/shared';
// Spec 11 admin payloads: the same contract-checked fixtures as the unit tests.
import { auditEntryFixture, overviewFixture, sourceFixture } from '../../src/features/admin/admin-fixtures';
import { aiUsageFixture, analyticsFixture, contentListFixture, exerciseDetailFixture } from '../../src/features/admin/content-fixtures';
// Spec 10 notification payloads: the unit-test fixtures, typed by the shared contract.
import type { AppNotification, NotificationPrefs } from '@linguo/shared';
import { DEFAULT_PREFS as DEFAULT_NOTIFICATION_PREFS } from '../../src/features/notifications/notification-fixtures';

export const SUPABASE_URL = 'https://e2e.invalid';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
const STORAGE_KEY = 'sb-e2e-auth-token'; // supabase-js: sb-<first host label>-auth-token

interface FixtureLevel {
  levelCode: string;
  ordinal: number;
  cumulativeHours: number;
}
const ESTIMATE_FIXTURES = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../packages/shared/src/learning/estimate.fixtures.json', import.meta.url)), 'utf8'),
) as { referenceHours: Record<string, FixtureLevel[]> };

const REFERENCE_ROWS = Object.entries(ESTIMATE_FIXTURES.referenceHours).flatMap(([language, levels]) =>
  levels.map((l) => ({ language_code: language, level_code: l.levelCode, ordinal: l.ordinal, cumulative_hours: l.cumulativeHours, reviewed: false })),
);

const ESTIMATE = {
  hours_needed: 185,
  weeks_min: 43,
  weeks_mid: 53,
  weeks_max: 69,
  feasibility: 'no_deadline',
  suggested_minutes_per_day: null,
  suggested_date: null,
  assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
};

export function pathRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'path-en',
    user_id: USER_ID,
    language_code: 'en',
    start_point: 'some',
    goal_type: 'daily_communication',
    current_level: 'a2',
    target_level: 'b1',
    weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
    target_date: null,
    status: 'active',
    estimate: ESTIMATE,
    created_at: '2026-10-13T01:00:00Z',
    updated_at: '2026-10-13T01:00:00Z',
    ...overrides,
  };
}

// ---- lesson backend: the demo bundle from supabase/seed.sql, graded with the shared grader ----------------

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SEED_SQL = readFileSync(fileURLToPath(new URL('../../../../supabase/seed.sql', import.meta.url)), 'utf8');
const BUNDLE = JSON.parse(SEED_SQL.slice(SEED_SQL.indexOf('$bundle$') + 8, SEED_SQL.lastIndexOf('$bundle$'))) as Record<'programs' | 'units' | 'lessons' | 'lesson_prerequisites' | 'learning_items' | 'lesson_items' | 'exercises', Row[]>;
const STAGE_ORDER: Record<string, number> = { recognition: 0, recall: 1, application: 2 };

export const DEMO_LESSONS = {
  enHello: lessonByKey('en:lesson:hello'),
  enIAm: lessonByKey('en:lesson:i-am'),
  koVowels: lessonByKey('ko:lesson:vowels'),
};

function lessonByKey(key: string): Row {
  const lesson = BUNDLE.lessons.find((l) => l.key === key);
  if (!lesson) throw new Error(`demo lesson ${key} missing from supabase/seed.sql`);
  return lesson;
}

/** Bundle exercises of a lesson in play order (stage, then order_index), with their private answer keys. */
export function lessonExercises(lessonId: string): Row[] {
  return BUNDLE.exercises
    .filter((e) => e.lesson_id === lessonId && e.status === 'published')
    .sort((a, b) => (STAGE_ORDER[a.stage] ?? 0) - (STAGE_ORDER[b.stage] ?? 0) || a.order_index - b.order_index);
}

/** A response the shared grader marks correct, so specs can answer any exercise right. */
export function correctResponse(exercise: Row): Record<string, unknown> {
  const key = exercise.key_data.answer_key;
  switch (exercise.exercise_type) {
    case 'mcq':
    case 'listen':
      return { option_id: key.correct_option_id };
    case 'word_bank':
      return { token_ids: key.orders[0] };
    case 'fill_blank':
      return { blanks: Object.fromEntries(Object.entries(key.blanks as Record<string, string[]>).map(([id, list]) => [id, list[0]])) };
    default:
      return { text: key.accepted[0] };
  }
}

function rpcError(message: string) {
  return { status: 400, json: { code: 'P0001', message, details: null, hint: null } };
}

interface MockRun {
  id: string;
  pathId: string;
  lessonId: string;
  status: 'in_progress' | 'completed';
  cursor: number;
  queue: string[];
  next_review_at: string | null;
  summary: Row | null;
}

interface MockAttempt {
  key: string;
  payloadHash: string;
  runId: string;
  exerciseId: string;
  stage: string;
  confidence: number | null;
  afterReveal: boolean;
  createdAt: string;
  result: Row; // submitResultSchema without `replayed`
}

/** Stateful in-memory stand-in for the lesson RPCs of spec 2 §6.3, mirroring the SQL rules. */
function createLessonBackend(paths: Array<Record<string, unknown>>) {
  const runs: MockRun[] = [];
  const attempts: MockAttempt[] = [];
  let submitCalls = 0;

  const publishedLessons = () => BUNDLE.lessons.filter((l) => l.status === 'published');
  const unitOf = (lesson: Row) => BUNDLE.units.find((u) => u.id === lesson.unit_id)!;
  const programOf = (lesson: Row) => BUNDLE.programs.find((p) => p.id === unitOf(lesson).program_id)!;
  const prerequisitesOf = (lessonId: string) =>
    BUNDLE.lesson_prerequisites.filter((p) => p.lesson_id === lessonId).map((p) => p.prerequisite_lesson_id as string).sort();
  const runFor = (pathId: string, lessonId: string, status: MockRun['status']) =>
    runs.filter((r) => r.pathId === pathId && r.lessonId === lessonId && r.status === status).at(-1);
  const publicRun = (r: MockRun) => ({ id: r.id, status: r.status, cursor: r.cursor, queue: r.queue, next_review_at: r.next_review_at, summary: r.summary });

  function lessonForPath(lessonId: string, pathId: string): Row | { error: string } {
    const path = paths.find((p) => p.id === pathId && p.status !== 'archived');
    if (!path) return { error: 'path_not_found' };
    const lesson = publishedLessons().find((l) => l.id === lessonId);
    if (!lesson) return { error: 'lesson_not_found' };
    if (lesson.language_code !== path.language_code) return { error: 'lesson_not_in_path' };
    return lesson;
  }

  function pathLessons(pathId: string) {
    const path = paths.find((p) => p.id === pathId);
    if (!path) return [];
    return publishedLessons()
      .filter((l) => l.language_code === path.language_code)
      .map((l) => ({ lesson: l, unit: unitOf(l), program: programOf(l) }))
      .sort((a, b) => a.program.order_index - b.program.order_index || a.unit.order_index - b.unit.order_index || a.lesson.order_index - b.lesson.order_index)
      .map(({ lesson, unit, program }) => {
        const prerequisiteIds = prerequisitesOf(lesson.id);
        return {
          lesson_id: lesson.id,
          lesson_key: lesson.key,
          program_id: program.id,
          program_title: program.title,
          unit_id: unit.id,
          unit_title: unit.title,
          unit_order: unit.order_index,
          lesson_order: lesson.order_index,
          title: lesson.title,
          level_code: lesson.level_code,
          estimated_minutes: lesson.estimated_minutes,
          is_demo: lesson.is_demo,
          prerequisite_ids: prerequisiteIds,
          prerequisites_met: prerequisiteIds.every((id) => runFor(pathId, id, 'completed')),
          run_status: runFor(pathId, lesson.id, 'in_progress') ? 'in_progress' : runFor(pathId, lesson.id, 'completed') ? 'completed' : 'not_started',
        };
      });
  }

  function getLesson(lesson: Row, pathId: string) {
    const run = runFor(pathId, lesson.id, 'in_progress') ?? runFor(pathId, lesson.id, 'completed') ?? null;
    const unit = unitOf(lesson);
    const items = BUNDLE.lesson_items
      .filter((li) => li.lesson_id === lesson.id)
      .sort((a, b) => a.position - b.position)
      .map((li) => {
        const item = BUNDLE.learning_items.find((i) => i.id === li.item_id)!;
        return { id: item.id, key: item.key, item_type: item.item_type, front: item.front, back: item.back, audio_path: item.audio_path, role: li.role, position: li.position };
      });
    return {
      lesson: {
        id: lesson.id,
        key: lesson.key,
        language_code: lesson.language_code,
        level_code: lesson.level_code,
        title: lesson.title,
        objectives: lesson.objectives,
        body: lesson.body,
        estimated_minutes: lesson.estimated_minutes,
        skills: lesson.skills,
        content_version: 1,
        is_demo: lesson.is_demo,
        unit_title: unit.title,
        program_title: programOf(lesson).title,
      },
      items,
      // Public prompts only: key_data never leaves the "server".
      exercises: lessonExercises(lesson.id).map((e) => ({
        id: e.id,
        key: e.key,
        version: 1,
        order_index: e.order_index,
        type: e.exercise_type,
        stage: e.stage,
        answer_lang: e.answer_lang,
        item_id: e.item_id,
        difficulty: e.difficulty,
        prompt: e.prompt,
      })),
      run: run && publicRun(run),
      attempts: run
        ? attempts
            .filter((a) => a.runId === run.id)
            .map((a) => ({ ...a.result, exercise_id: a.exerciseId, after_reveal: a.afterReveal, created_at: a.createdAt }))
        : [],
    };
  }

  function startLesson(lesson: Row, pathId: string) {
    const open = runFor(pathId, lesson.id, 'in_progress');
    if (open) return publicRun(open);
    const run: MockRun = {
      id: randomUUID(),
      pathId,
      lessonId: lesson.id,
      status: 'in_progress',
      cursor: 0,
      queue: lessonExercises(lesson.id).map((e) => e.id as string),
      next_review_at: null,
      summary: null,
    };
    runs.push(run);
    return publicRun(run);
  }

  function submit(b: Row) {
    submitCalls += 1;
    const payloadHash = `${String(b.p_exercise_id)}|${JSON.stringify(b.p_response)}`;
    const previous = attempts.find((a) => a.key === b.p_idempotency_key);
    if (previous) {
      return previous.payloadHash === payloadHash ? { json: { ...previous.result, replayed: true } } : rpcError('idempotency_conflict');
    }
    const run = runs.find((r) => r.id === b.p_run_id);
    if (!run) return rpcError('run_not_found');
    if (run.status !== 'in_progress') return rpcError('run_not_active');
    const exercise = lessonExercises(run.lessonId).find((e) => e.id === b.p_exercise_id);
    if (!exercise) return rpcError('exercise_not_in_lesson');
    if (b.p_exercise_version !== 1) return rpcError('exercise_version_mismatch');

    const keyData = exercise.key_data;
    const input: GradeInput = {
      type: exercise.exercise_type,
      answer: keyData.answer_key,
      rubric: { ...DEFAULT_RUBRIC, ...keyData.rubric },
      knownWrong: keyData.known_wrong ?? [],
      lang: exercise.answer_lang,
    };
    const response = b.p_response as ExerciseResponse;
    const grade = gradeResponse(input, response);
    const gaveUp = JSON.stringify(response) === '{"give_up":true}';
    const earlier = attempts.filter((a) => a.runId === run.id && a.exerciseId === exercise.id);
    const attemptNo = earlier.length + 1;
    const afterReveal = earlier.some((a) => a.result.revealed);
    const revealed = grade.verdict !== 'incorrect' || attemptNo >= 2 || gaveUp;
    const requeued = !afterReveal && grade.verdict === 'incorrect' && revealed;
    const result = {
      attempt_id: randomUUID(),
      attempt_no: attemptNo,
      verdict: grade.verdict,
      is_correct: grade.verdict !== 'incorrect',
      score: grade.score,
      error_tags: grade.errorTags,
      feedback_vi: grade.feedbackVi,
      revealed,
      display_answer: revealed ? keyData.display_answer : null,
      explanation: revealed ? keyData.explanation : null,
      final: grade.verdict !== 'incorrect' || revealed,
      requeued,
    };
    attempts.push({
      key: String(b.p_idempotency_key),
      payloadHash,
      runId: run.id,
      exerciseId: exercise.id,
      stage: exercise.stage,
      confidence: (b.p_confidence as number | null) ?? null,
      afterReveal,
      createdAt: new Date().toISOString(),
      result,
    });
    if (requeued) run.queue = [...run.queue, exercise.id];
    return { json: { ...result, replayed: false } };
  }

  function complete(runId: unknown) {
    const run = runs.find((r) => r.id === runId);
    if (!run) return rpcError('run_not_found');
    if (run.status === 'completed') return { json: run.summary };
    const own = attempts.filter((a) => a.runId === run.id);
    const resolved = (id: string) => own.some((a) => a.exerciseId === id && (a.result.verdict !== 'incorrect' || a.result.revealed));
    const recheckMissing = own.some(
      (a) => a.result.verdict === 'incorrect' && a.result.revealed && !a.afterReveal && !own.some((o) => o.exerciseId === a.exerciseId && o.afterReveal),
    );
    if (!run.queue.every(resolved) || recheckMissing) return rpcError('attempts_incomplete');
    const firsts = own.filter((a) => a.result.attempt_no === 1);
    const accuracy = (stage: string) => {
      const list = firsts.filter((a) => a.stage === stage);
      return list.length ? Math.round((list.filter((a) => a.result.is_correct).length / list.length) * 10000) / 10000 : null;
    };
    const signals = own.filter((a) => !a.afterReveal);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const summary = {
      accuracy_by_stage: { recognition: accuracy('recognition'), recall: accuracy('recall'), application: accuracy('application') },
      almost_count: signals.filter((a) => a.result.verdict === 'almost').length,
      confident_wrong: signals.filter((a) => a.confidence === 3 && a.result.verdict === 'incorrect').length,
      unsure_right: signals.filter((a) => a.confidence === 1 && a.result.is_correct).length,
      // Midnight in Asia/Ho_Chi_Minh (UTC+7), like learning_user_today + 1.
      next_review_at: `${tomorrow.toISOString().slice(0, 10)}T00:00:00+07:00`,
      completed_at: new Date().toISOString(),
    };
    Object.assign(run, { status: 'completed', summary, next_review_at: summary.next_review_at });
    return { json: summary };
  }

  /** Returns a fulfil spec for lesson RPC paths, or null when the path is not a lesson RPC. */
  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/path_lessons':
        return { json: pathLessons(String(b.p_path_id)) };
      case '/rest/v1/rpc/get_lesson':
      case '/rest/v1/rpc/start_lesson': {
        const lesson = lessonForPath(String(b.p_lesson_id), String(b.p_path_id));
        if ('error' in lesson) return rpcError(String(lesson.error));
        return { json: pathname.endsWith('get_lesson') ? getLesson(lesson, String(b.p_path_id)) : startLesson(lesson, String(b.p_path_id)) };
      }
      case '/rest/v1/rpc/save_lesson_cursor': {
        const run = runs.find((r) => r.id === b.p_run_id);
        if (!run) return rpcError('run_not_found');
        if (run.status !== 'in_progress') return rpcError('run_not_active');
        run.cursor = Math.max(run.cursor, Number(b.p_cursor));
        return { status: 204, json: null };
      }
      case '/rest/v1/rpc/submit_exercise':
        return submit(b);
      case '/rest/v1/rpc/complete_lesson':
        return complete(b.p_run_id);
    }
    return null;
  }

  return { handle, submitCalls: () => submitCalls };
}

// ---- review backend: FSRS cards over the seed learning items (spec 3 §4), scheduling faked -----------------

export interface ReviewMockOptions {
  /** Cards due today (default 4): seed items introduced by the path's lessons, alternating recognize/recall. */
  due?: number;
  /** New cards "+10 thẻ nữa" can add after the session (default: the next 10 seed items). */
  extra?: number;
  /** Daily cap reported in the totals (default 45). */
  cap?: number;
  /** Report recovery mode with this many cards left for the coming days. */
  recoveryBacklog?: number;
}

interface MockCard {
  id: string;
  pathId: string;
  item: Row;
  direction: 'recognize' | 'recall';
  state: 'new' | 'learning' | 'review' | 'relearning';
  dueToday: boolean;
  /** In the "+10 thẻ nữa" pool until a p_extra fetch adds it to today. */
  pooled: boolean;
  gradedToday: boolean;
  postponedToday: boolean;
}

export interface MockGrade {
  key: string;
  cardId: string;
  rating: number;
  confidence: number | null;
  replayed: boolean;
}

const REVIEW_MINUTES = { again: 1, hard: 10, good: 1440, easy: 4 * 1440 } as const;
const DAY_MS = 86_400_000;

/** YYYY-MM-DD in Asia/Ho_Chi_Minh (UTC+7, no DST), the mocked profile time zone. */
function localDate(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** Learning items introduced by the published lessons of a language, in lesson order, without repeats. */
function introducedItems(language: string): Row[] {
  const lessons = BUNDLE.lessons
    .filter((l) => l.status === 'published' && l.language_code === language)
    .map((l) => ({ lesson: l, unit: BUNDLE.units.find((u) => u.id === l.unit_id)! }))
    .sort((a, b) => a.unit.order_index - b.unit.order_index || a.lesson.order_index - b.lesson.order_index);
  const seen = new Set<string>();
  const items: Row[] = [];
  for (const { lesson } of lessons) {
    const links = BUNDLE.lesson_items.filter((x) => x.lesson_id === lesson.id && x.role === 'introduce').sort((a, b) => a.position - b.position);
    for (const li of links) {
      if (seen.has(li.item_id)) continue;
      seen.add(li.item_id);
      items.push(BUNDLE.learning_items.find((i) => i.id === li.item_id)!);
    }
  }
  return items;
}

/** Stateful stand-in for get_review_queue / grade_review / postpone_reviews / review_summary. */
function createReviewBackend(paths: Array<Record<string, unknown>>, opts: ReviewMockOptions = {}) {
  const dueCount = opts.due ?? 4;
  const cap = opts.cap ?? 45;
  const cards: MockCard[] = [];
  for (const path of paths) {
    const items = introducedItems(String(path.language_code));
    items.slice(0, dueCount + (opts.extra ?? 10)).forEach((item, i) => {
      const pooled = i >= dueCount;
      cards.push({
        id: randomUUID(),
        pathId: String(path.id),
        item,
        direction: i % 2 === 0 ? 'recognize' : 'recall',
        state: pooled || i % 3 === 0 ? 'new' : 'review',
        dueToday: !pooled,
        pooled,
        gradedToday: false,
        postponedToday: false,
      });
    });
  }
  const grades: MockGrade[] = [];
  const gradeResults = new Map<string, { hash: string; result: Row }>();
  const postpones = new Map<string, Row>();
  const postponeCalls: Array<string[] | null> = [];

  const due = (pathId: string) => cards.filter((c) => c.pathId === pathId && c.dueToday);
  const reviewedToday = (pathId: string) => cards.filter((c) => c.pathId === pathId && c.gradedToday).length;
  const remainingToday = (pathId: string) => Math.min(due(pathId).length, Math.max(0, cap - reviewedToday(pathId)));
  const pathOf = (pathId: string) => paths.find((p) => p.id === pathId);

  function cardJson(c: MockCard) {
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
    return {
      card_id: c.id,
      item_id: c.item.id,
      direction: c.direction,
      state: c.state,
      is_new: c.state === 'new',
      due_at: new Date().toISOString(),
      postpone_count: c.postponedToday ? 1 : 0,
      item: {
        language_code: c.item.language_code,
        item_type: c.item.item_type,
        front: c.item.front,
        back: c.item.back,
        audio_path: c.item.audio_path ?? null,
      },
      previews: Object.fromEntries(Object.entries(REVIEW_MINUTES).map(([k, m]) => [k, { interval_minutes: m, due_at: at(m) }])),
    };
  }

  function queue(b: Row) {
    const pathId = String(b.p_path_id);
    const path = pathOf(pathId);
    if (!path) return rpcError('path_not_found');
    if (path.status !== 'active') return rpcError('path_not_active');
    let limit = Math.min(Number(b.p_limit ?? 20), Math.max(0, cap - reviewedToday(pathId)));
    if (b.p_extra) {
      for (const c of cards.filter((x) => x.pathId === pathId && x.pooled).slice(0, 10)) Object.assign(c, { pooled: false, dueToday: true });
      limit += 10;
    }
    // One direction per learning item in a single fetch.
    const seenItems = new Set<string>();
    const served = due(pathId)
      .filter((c) => !seenItems.has(c.item.id) && Boolean(seenItems.add(c.item.id)))
      .slice(0, limit);
    const dueTotal = due(pathId).length;
    return {
      json: {
        cards: served.map(cardJson),
        totals: {
          due_total: dueTotal,
          served: served.length,
          backlog_remaining: opts.recoveryBacklog ?? Math.max(0, dueTotal - served.length),
          new_available: Math.min(10, cards.filter((c) => c.pathId === pathId && c.pooled).length),
          daily_cap: cap,
          reviewed_today: reviewedToday(pathId),
          recovery_mode: opts.recoveryBacklog !== undefined,
        },
      },
    };
  }

  function grade(b: Row) {
    const key = String(b.p_idempotency_key);
    const confidence = (b.p_confidence as number | null) ?? null;
    const hash = `${String(b.p_card_id)}|${String(b.p_rating)}|${String(confidence)}`;
    const previous = gradeResults.get(key);
    if (previous) {
      if (previous.hash !== hash) return rpcError('idempotency_conflict');
      grades.push({ key, cardId: String(b.p_card_id), rating: Number(b.p_rating), confidence, replayed: true });
      return { json: { ...previous.result, replayed: true } };
    }
    const card = cards.find((c) => c.id === b.p_card_id);
    if (!card) return rpcError('card_not_found');
    const rating = Number(b.p_rating);
    if (![1, 2, 3, 4].includes(rating)) return rpcError('invalid_rating');
    // srs_adjust_rating: hints cap at Hard; a right answer with confidence 1 counts as Hard.
    const effective = Number(b.p_hint_count) > 0 ? Math.min(rating, 2) : rating >= 3 && confidence === 1 ? 2 : rating;
    const minutes = Object.values(REVIEW_MINUTES)[effective - 1]!;
    card.state = effective === 1 ? (card.state === 'review' ? 'relearning' : 'learning') : effective === 2 && card.state === 'new' ? 'learning' : 'review';
    Object.assign(card, { gradedToday: true, dueToday: false });
    const result = {
      card_id: card.id,
      log_id: randomUUID(),
      state: card.state,
      due_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      interval_minutes: minutes,
      rating_effective: effective,
      item_status: card.state,
      newly_mastered: false,
    };
    gradeResults.set(key, { hash, result });
    grades.push({ key, cardId: card.id, rating, confidence, replayed: false });
    return { json: { ...result, replayed: false } };
  }

  function postpone(b: Row) {
    const key = String(b.p_idempotency_key);
    const previous = postpones.get(key);
    if (previous) return { json: { ...previous, replayed: true } };
    const pathId = String(b.p_path_id);
    if (!pathOf(pathId)) return rpcError('path_not_found');
    const ids = Array.isArray(b.p_card_ids) ? (b.p_card_ids as string[]) : null;
    postponeCalls.push(ids);
    const targets = ids ? cards.filter((c) => c.pathId === pathId && ids.includes(c.id)) : due(pathId);
    let postponed = 0;
    let skipped = 0;
    for (const c of targets) {
      if (c.postponedToday || !c.dueToday) {
        skipped += 1;
        continue;
      }
      Object.assign(c, { postponedToday: true, dueToday: false });
      postponed += 1;
    }
    const result = { postponed, skipped };
    postpones.set(key, result);
    return { json: { ...result, replayed: false } };
  }

  function summary(b: Row) {
    const pathId = String(b.p_path_id);
    if (!pathOf(pathId)) return rpcError('path_not_found');
    const tomorrow = cards.filter((c) => c.pathId === pathId && (c.postponedToday || c.gradedToday)).length;
    return {
      json: {
        reviewed_today: reviewedToday(pathId),
        remaining_today: remainingToday(pathId),
        forecast: Array.from({ length: 7 }, (_, i) => ({
          date: localDate(i),
          count: i === 0 ? remainingToday(pathId) : i === 1 ? tomorrow : 0,
        })),
        retention_30d: null,
        retention_sample: 0,
        mastered_total: 0,
        mastered_this_week: 0,
        recovery_mode: opts.recoveryBacklog !== undefined,
      },
    };
  }

  /** Returns a fulfil spec for review RPC paths, or null when the path is not a review RPC. */
  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/get_review_queue':
        return queue(b);
      case '/rest/v1/rpc/grade_review':
        return grade(b);
      case '/rest/v1/rpc/postpone_reviews':
        return postpone(b);
      case '/rest/v1/rpc/review_summary':
        return summary(b);
    }
    return null;
  }

  return { handle, grades: () => [...grades], postponeCalls: () => [...postponeCalls] };
}

// ---- diagnostic backend: spec 4 §4 RPCs over a tiny English bank, scored with a simple staircase -----------------

const DIAG_SKILLS = ['vocabulary', 'grammar', 'reading'] as const;
type DiagSkill = (typeof DIAG_SKILLS)[number];
const DIAG_MAX: Record<DiagSkill, number> = { vocabulary: 4, grammar: 4, reading: 3 };
const DIAG_TOTAL_MAX = { full: 11, foundation: 6 } as const;
const DIAG_COOLDOWN_DAYS = 14;
const DIAG_REASONS = ['no_time', 'too_hard', 'not_my_goal', 'other'];

export interface DiagnosticBankItem {
  id: string;
  skill: DiagSkill;
  /** Level ordinal 0..6 (pre_a1..c2); the item difficulty is ordinal + 0.5. */
  level: number;
  item_type: 'mcq' | 'cloze_choice' | 'reading_mcq';
  stem: string;
  stem_lang: 'en' | 'vi';
  passage: string | null;
  options: Array<{ id: string; text: string }>;
  /** Private: never sent to the browser. */
  answer: string;
}

const diagId = (n: number) => `d1a90000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const VOCAB: Array<[string, string, string[]]> = [
  ['Chọn nghĩa của "apple"', 'quả táo', ['con mèo', 'cái bàn', 'màu xanh']],
  ['Chọn nghĩa của "kitchen"', 'nhà bếp', ['phòng ngủ', 'khu vườn', 'cửa sổ']],
  ['Chọn nghĩa của "borrow"', 'mượn', ['bán', 'đánh rơi', 'sửa chữa']],
  ['Chọn nghĩa của "reliable"', 'đáng tin cậy', ['ồn ào', 'đắt đỏ', 'mệt mỏi']],
  ['Chọn nghĩa của "to postpone"', 'hoãn lại', ['phóng đại', 'bày tỏ', 'thăng chức']],
  ['Chọn nghĩa của "meticulous"', 'tỉ mỉ', ['hời hợt', 'liều lĩnh', 'thờ ơ']],
  ['Chọn nghĩa của "ubiquitous"', 'có mặt khắp nơi', ['hiếm hoi', 'mơ hồ', 'lỗi thời']],
];
const GRAMMAR: Array<[string, string, string[]]> = [
  ['She ___ a student.', 'is', ['am', 'are', 'be']],
  ['I ___ coffee every morning.', 'drink', ['drinks', 'drinking', 'drank to']],
  ['We ___ to Da Nang last summer.', 'went', ['go', 'have gone', 'going']],
  ['If it rains, we ___ at home.', 'will stay', ['stayed', 'would stayed', 'staying']],
  ['The report ___ by Friday.', 'must be finished', ['must finish', 'must finished', 'must be finish']],
  ['Had I known, I ___ earlier.', 'would have left', ['will leave', 'had leave', 'would leave to']],
  ['Not until the results came out ___ the scale of the problem.', 'did we realise', ['we realised', 'we did realise', 'realised we']],
];
const READING: Array<[string, string, string, string[]]> = [
  ['Tom has a dog. The dog is black. It likes to run in the park.', 'What colour is the dog?', 'Black', ['White', 'Brown', 'Grey']],
  ['The library opens at 9 a.m. on weekdays and at 10 a.m. on Saturdays. It is closed on Sundays.', 'When does the library open on Saturday?', 'At 10 a.m.', ['At 9 a.m.', 'It is closed', 'At noon']],
  ['Remote work saves commuting time, but some employees report feeling isolated from their teams.', 'What problem do some remote workers mention?', 'Feeling isolated', ['Long commutes', 'Low salaries', 'Too many meetings']],
  ['Although the policy was intended to cut emissions, critics argue it merely shifted pollution to neighbouring regions.', 'What do critics say about the policy?', 'It moved pollution elsewhere', ['It cut emissions sharply', 'It had no critics', 'It raised taxes']],
];

export const DIAGNOSTIC_BANK: DiagnosticBankItem[] = (() => {
  const bank: DiagnosticBankItem[] = [];
  let n = 0;
  const add = (skill: DiagSkill, level: number, item_type: DiagnosticBankItem['item_type'], stem: string, stem_lang: 'en' | 'vi', passage: string | null, right: string, wrong: string[]) => {
    n += 1;
    // Rotate the right answer so its position carries no signal.
    const texts = [...wrong];
    texts.splice(n % (wrong.length + 1), 0, right);
    const options = texts.map((text, i) => ({ id: `o${i + 1}`, text }));
    bank.push({ id: diagId(n), skill, level, item_type, stem, stem_lang, passage, options, answer: options.find((o) => o.text === right)!.id });
  };
  VOCAB.forEach(([stem, right, wrong], level) => add('vocabulary', level, 'mcq', stem, 'vi', null, right, wrong));
  GRAMMAR.forEach(([stem, right, wrong], level) => add('grammar', level, 'cloze_choice', stem, 'en', null, right, wrong));
  READING.forEach(([passage, stem, right, wrong], i) => add('reading', i + 1, 'reading_mcq', stem, 'en', passage, right, wrong));
  return bank;
})();

/** Text of the right option for a bank item (specs answer through the UI; the key never crosses the network). */
export function diagnosticCorrectText(itemId: string): string {
  const item = DIAGNOSTIC_BANK.find((i) => i.id === itemId);
  if (!item) throw new Error(`unknown diagnostic item ${itemId}`);
  return item.options.find((o) => o.id === item.answer)!.text;
}

interface DiagResponse {
  itemId: string;
  skill: DiagSkill;
  choice: string | null;
  correct: boolean;
}

interface DiagAttempt {
  id: string;
  pathId: string;
  mode: 'full' | 'foundation';
  status: 'in_progress' | 'completed' | 'abandoned';
  skill: DiagSkill | null;
  /** Staircase position per skill (level ordinal). */
  stair: Record<DiagSkill, number>;
  currentItemId: string | null;
  responses: DiagResponse[];
  skipped: Partial<Record<DiagSkill, string>>;
  report: Row | null;
  completedAt: string | null;
  appliedAt: string | null;
}

export interface DiagnosticMockOptions {
  /** Seed a completed attempt per path id, finished at the given ISO time (cooldown runs 14 days from it). */
  completedAt?: Record<string, string>;
}

/** Stateful stand-in for diagnostic_status / start / answer / skip / finish / accept (spec 4 §4). */
function createDiagnosticBackend(paths: Array<Record<string, unknown>>, opts: DiagnosticMockOptions = {}) {
  const attempts: DiagAttempt[] = [];
  const levels = (lang: unknown) => (lang === 'ko' ? ['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6'] : ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
  const pathOf = (pathId: unknown) => paths.find((p) => p.id === pathId && p.status !== 'archived');
  const latest = (pathId: string) => attempts.filter((a) => a.pathId === pathId).at(-1);
  const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
  const newStair = (n: number): Record<DiagSkill, number> => ({ vocabulary: n, grammar: n, reading: n });

  for (const [pathId, completedAt] of Object.entries(opts.completedAt ?? {})) {
    const report = { completed_at: completedAt };
    attempts.push({ id: randomUUID(), pathId, mode: 'full', status: 'completed', skill: null, stair: newStair(1), currentItemId: null, responses: [], skipped: {}, report, completedAt, appliedAt: null });
  }

  const answered = (a: DiagAttempt, skill: DiagSkill) => a.responses.filter((r) => r.skill === skill).length;
  const skillDone = (a: DiagAttempt, skill: DiagSkill) => skill in a.skipped || answered(a, skill) >= DIAG_MAX[skill] || !candidates(a, skill).length;
  function candidates(a: DiagAttempt, skill: DiagSkill) {
    const seen = new Set(a.responses.map((r) => r.itemId));
    return DIAGNOSTIC_BANK.filter((i) => i.skill === skill && !seen.has(i.id) && (a.mode === 'full' || i.level <= 1));
  }

  /** Moves to the next item: same skill until its stop rule, then the next skill; null when the test is over. */
  function advance(a: DiagAttempt) {
    a.currentItemId = null;
    if (a.responses.length >= DIAG_TOTAL_MAX[a.mode]) {
      a.skill = null;
      return;
    }
    a.skill = DIAG_SKILLS.find((s) => !skillDone(a, s)) ?? null;
    if (!a.skill) return;
    const target = a.stair[a.skill];
    const pool = candidates(a, a.skill).sort((x, y) => Math.abs(x.level - target) - Math.abs(y.level - target) || x.id.localeCompare(y.id));
    a.currentItemId = pool[0]?.id ?? null;
  }

  function publicItem(id: string | null) {
    const item = DIAGNOSTIC_BANK.find((i) => i.id === id);
    if (!item) return null;
    return {
      id: item.id,
      skill: item.skill,
      item_type: item.item_type,
      prompt: { stem: item.stem, stem_lang: item.stem_lang, passage: item.passage, options: item.options.map((o) => ({ id: o.id, text: o.text, lang: item.stem_lang === 'vi' ? 'vi' : 'en' })) },
    };
  }

  function step(a: DiagAttempt, resumed = false) {
    const done = a.status !== 'in_progress' || a.currentItemId === null;
    return {
      attempt_id: a.id,
      mode: a.mode,
      item: done ? null : publicItem(a.currentItemId),
      progress: {
        skills: DIAG_SKILLS.map((s) => ({
          skill: s,
          status: s in a.skipped ? 'skipped' : a.skill === s ? 'active' : skillDone(a, s) ? 'done' : 'pending',
          fill: Math.min(1, answered(a, s) / DIAG_MAX[s]),
        })),
        near_end: a.responses.length >= DIAG_TOTAL_MAX[a.mode] - 2,
      },
      done,
      resumed,
    };
  }

  function status(b: Row) {
    const pathId = String(b.p_path_id);
    if (!pathOf(pathId)) return rpcError('path_not_found');
    const a = latest(pathId);
    // Cooldown runs per mode; status describes the full test, which a foundation check does not block.
    const lastFull = attempts.filter((x) => x.pathId === pathId && x.mode === 'full' && x.completedAt).at(-1);
    const retakeAfter = lastFull ? addDays(lastFull.completedAt!, DIAG_COOLDOWN_DAYS) : null;
    return {
      json: {
        attempt_id: a?.id ?? null,
        status: a?.status ?? 'none',
        completed_at: a?.completedAt ?? null,
        applied_at: a?.appliedAt ?? null,
        retake_after: retakeAfter,
        can_start: a?.status === 'in_progress' || !retakeAfter || Date.now() >= Date.parse(retakeAfter),
      },
    };
  }

  function start(b: Row) {
    const path = pathOf(b.p_path_id);
    if (!path) return rpcError('path_not_found');
    const pathId = String(path.id);
    if (b.p_mode !== undefined && b.p_mode !== 'full' && b.p_mode !== 'foundation') return rpcError('invalid_mode');
    if (path.language_code !== 'en') return rpcError('bank_unavailable');
    const open = attempts.find((a) => a.pathId === pathId && a.status === 'in_progress');
    if (open) return { json: step(open, true) };
    const mode = b.p_mode === 'foundation' ? 'foundation' : 'full';
    const done = attempts.filter((a) => a.pathId === pathId && a.mode === mode && a.completedAt).at(-1);
    if (done && Date.now() < Date.parse(addDays(done.completedAt!, DIAG_COOLDOWN_DAYS))) return rpcError('diagnostic_cooldown');
    const begin = mode === 'foundation' ? 0 : Math.max(0, levels(path.language_code).indexOf(String(path.current_level)));
    const a: DiagAttempt = {
      id: randomUUID(),
      pathId,
      mode,
      status: 'in_progress',
      skill: 'vocabulary',
      stair: newStair(begin),
      currentItemId: null,
      responses: [],
      skipped: {},
      report: null,
      completedAt: null,
      appliedAt: null,
    };
    attempts.push(a);
    advance(a);
    return { json: step(a) };
  }

  const activeAttempt = (id: unknown): DiagAttempt | { error: ReturnType<typeof rpcError> } => {
    const a = attempts.find((x) => x.id === id);
    if (!a) return { error: rpcError('attempt_not_found') };
    if (a.status !== 'in_progress') return { error: rpcError('attempt_not_active') };
    return a;
  };

  function answer(b: Row) {
    const a = activeAttempt(b.p_attempt_id);
    if ('error' in a) return a.error;
    if (a.responses.some((r) => r.itemId === b.p_item_id)) return rpcError('already_answered');
    if (b.p_item_id !== a.currentItemId) return rpcError('item_mismatch');
    const item = DIAGNOSTIC_BANK.find((i) => i.id === a.currentItemId)!;
    const choice = (b.p_choice as string | null | undefined) ?? null;
    if (choice !== null && !item.options.some((o) => o.id === choice)) return rpcError('invalid_choice');
    const correct = choice === item.answer;
    a.responses.push({ itemId: item.id, skill: item.skill, choice, correct });
    a.stair[item.skill] = Math.min(6, Math.max(0, a.stair[item.skill] + (correct ? 1 : -1)));
    advance(a);
    return { json: step(a) };
  }

  function skip(b: Row) {
    const a = activeAttempt(b.p_attempt_id);
    if ('error' in a) return a.error;
    const skill = b.p_skill as DiagSkill;
    if (!DIAG_SKILLS.includes(skill)) return rpcError('invalid_skill');
    if (!DIAG_REASONS.includes(String(b.p_reason))) return rpcError('invalid_reason');
    a.skipped[skill] = String(b.p_reason);
    advance(a);
    return { json: step(a) };
  }

  function buildReport(a: DiagAttempt, path: Row) {
    const codes = levels(path.language_code);
    const skills = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'].map((skill) => {
      const own = a.responses.filter((r) => r.skill === skill);
      const base = { skill, level_code: null, range: null, confidence: null, sample_size: own.length, reason: null };
      if (skill === 'listening' || skill === 'writing' || skill === 'speaking') {
        return { ...base, status: 'not_supported', reason: skill === 'listening' ? 'no_audio' : 'not_inferred' };
      }
      if (skill in a.skipped) return { ...base, status: 'skipped', reason: a.skipped[skill as DiagSkill] ?? null };
      if (own.length < 3) return { ...base, status: 'insufficient' };
      // Staircase estimate: the highest level answered correctly (0 when none).
      const level = Math.max(0, ...own.filter((r) => r.correct).map((r) => DIAGNOSTIC_BANK.find((i) => i.id === r.itemId)!.level));
      return {
        ...base,
        status: 'estimated',
        level_code: codes[level],
        range: { low: codes[Math.max(0, level - 1)], high: codes[Math.min(6, level + 1)] },
        confidence: own.length >= 4 ? 'medium' : 'low',
      };
    });
    const confident = skills.filter((s) => s.status === 'estimated' && s.confidence !== 'low').map((s) => codes.indexOf(String(s.level_code))).sort((x, y) => x - y);
    const suggested = confident.length >= 2 ? confident[Math.floor((confident.length - 1) / 2)]! : null;
    const current = codes.indexOf(String(path.current_level));
    const firstApplied = !attempts.some((x) => x.pathId === a.pathId && x.appliedAt);
    const capped = suggested === null ? null : Math.min(suggested, current + (firstApplied ? 2 : 1));
    return {
      attempt_id: a.id,
      learning_path_id: a.pathId,
      language_code: path.language_code,
      mode: a.mode,
      completed_at: a.completedAt,
      skills,
      current_level: path.current_level,
      suggested_level: suggested === null ? null : codes[suggested],
      capped_level: capped === null ? null : codes[capped],
      early_stop: false,
      rapid_answer_share: 0,
      bank_unreviewed: true,
      applied_at: a.appliedAt,
      retake_after: addDays(a.completedAt!, DIAG_COOLDOWN_DAYS),
    };
  }

  function finish(b: Row) {
    const a = attempts.find((x) => x.id === b.p_attempt_id);
    if (!a) return rpcError('attempt_not_found');
    const path = pathOf(a.pathId);
    if (!path) return rpcError('path_not_found');
    if (a.status === 'in_progress') {
      Object.assign(a, { status: 'completed', completedAt: new Date().toISOString(), currentItemId: null, skill: null });
      a.report = buildReport(a, path);
    }
    if (!a.report) return rpcError('attempt_not_completed');
    return { json: { ...a.report, applied_at: a.appliedAt } };
  }

  function accept(b: Row) {
    const a = attempts.find((x) => x.id === b.p_attempt_id);
    if (!a) return rpcError('attempt_not_found');
    if (a.status !== 'completed' || !a.report) return rpcError('attempt_not_completed');
    if (a.appliedAt) return rpcError('already_applied');
    const path = pathOf(a.pathId);
    if (!path) return rpcError('path_not_found');
    const codes = levels(path.language_code);
    const previous = String(path.current_level);
    const capped = a.report.capped_level as string | null;
    const result = (outcome: string, newLevel: string) => ({
      json: { learning_path_id: path.id, previous_level: previous, new_level: newLevel, outcome, estimate: outcome === 'applied' ? path.estimate : null },
    });
    if (!capped) return result('no_suggestion', previous);
    if (capped === previous) return result('unchanged', previous);
    if (codes.indexOf(capped) >= codes.indexOf(String(path.target_level))) return result('needs_target_update', previous);
    Object.assign(path, { current_level: capped, updated_at: new Date().toISOString() });
    a.appliedAt = new Date().toISOString();
    return result('applied', capped);
  }

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/diagnostic_status':
        return status(b);
      case '/rest/v1/rpc/start_diagnostic':
        return start(b);
      case '/rest/v1/rpc/answer_diagnostic':
        return answer(b);
      case '/rest/v1/rpc/skip_diagnostic_skill':
        return skip(b);
      case '/rest/v1/rpc/finish_diagnostic':
        return finish(b);
      case '/rest/v1/rpc/accept_diagnostic_placement':
        return accept(b);
    }
    return null;
  }

  return { handle, attempts: () => attempts.map((a) => ({ ...a, responses: [...a.responses] })) };
}

// ---- AI tutor backend: the ai-tutor Edge Function and the spec 5 RPCs (quota, notice, report) ---------------------

/** How the mocked ai-tutor function answers: per-task success, an error, or a success carrying HTML/script text. */
export type AiMockMode = 'ok' | 'quota_exceeded' | 'ai_unavailable' | 'html';

export interface AiMockOptions {
  mode?: AiMockMode;
  /** user_preferences.ai_notice_ack_at at start (default null: the notice shows on first use). */
  ackAt?: string | null;
  /** Calls used today (default 3 of 20). */
  used?: number;
  limit?: number;
}

/** Text the HTML mode puts in explanation_md: must render as literal characters, never as elements. */
export const AI_HTML_PAYLOAD = '<img src=x onerror="window.__aiXss=1"><script>window.__aiXss=1</script><b id="ai-injected">bold</b>';

function aiResetsAt(): string {
  // Next midnight in Asia/Ho_Chi_Minh (UTC+7), like learning_user_today + 1.
  return `${localDate(1)}T00:00:00+07:00`;
}

function aiData(task: string, mode: AiMockMode, request: Row = {}): Record<string, unknown> {
  const html = mode === 'html';
  switch (task) {
    case 'review_writing': {
      // Spec 9 X6: one entry per rubric criterion, never above its max_points.
      const rubric = (Array.isArray(request.rubric) ? request.rubric : []) as Row[];
      return {
        criteria: rubric.map((r) => ({
          key: r.key,
          points: Math.max(0, Number(r.max_points) - 1),
          comment_vi: html ? AI_HTML_PAYLOAD : `Tiêu chí ${String(r.label_vi)}: làm khá tốt, còn một lỗi nhỏ.`,
        })),
        overall_vi: 'Bài viết đủ ý chính; chú ý chính tả và dấu câu.',
        corrected_version: request.language === 'ko' ? '안녕하세요. 저는 란이에요.' : "Hi Alex, let's watch a film on Saturday at 6 outside the cinema. See you, Lan",
      };
    }
    case 'analyze_error':
      return {
        verdict: 'incorrect',
        error_type: 'Chia động từ',
        explanation_md: html ? AI_HTML_PAYLOAD : 'Với **I** ta dùng *am*, không dùng *is*.',
        corrected: 'I am a student.',
        tip_vi: 'Nhớ cặp I – am.',
      };
    case 'generate_practice':
      return {
        items: [
          {
            question: 'She ___ a teacher.',
            options: ['am', 'is', 'are'],
            answer: 'is',
            explanation_vi: 'She đi với is.',
          },
        ],
      };
    default:
      return {
        summary: 'Lời chào trong tiếng Anh',
        explanation_md: html ? AI_HTML_PAYLOAD : 'Dùng **Hello** để chào trong mọi tình huống.\n\n- Hi: thân mật\n- Good morning: buổi sáng',
        examples: [{ target: 'Hello, Lan!', vi: 'Chào Lan!' }],
        common_mistakes: ['Dùng "Good night" để chào khi gặp mặt.'],
        confidence: 'high',
        uncertainty: null,
      };
  }
}

/** Stateful stand-in for POST functions/v1/ai-tutor and the ai_quota_status / ack_ai_notice / ai_report RPCs. */
function createAiBackend(opts: AiMockOptions = {}) {
  let mode: AiMockMode = opts.mode ?? 'ok';
  let ackAt: string | null = opts.ackAt ?? null;
  let used = opts.used ?? 3;
  const limit = opts.limit ?? 20;
  const requests: Row[] = [];
  const reports: Row[] = [];
  let ackCalls = 0;
  const quota = () => ({ used, limit, resets_at: aiResetsAt() });

  function tutor(b: Row): { status: number; json: unknown } {
    requests.push(b);
    if (mode === 'quota_exceeded') {
      used = limit;
      return { status: 429, json: { error: 'quota_exceeded', message: 'Daily AI limit reached', retry_after_sec: null, quota: quota() } };
    }
    if (mode === 'ai_unavailable') {
      return { status: 503, json: { error: 'ai_unavailable', message: 'AI temporarily unavailable', retry_after_sec: 60, quota: null } };
    }
    used = Math.min(limit, used + 1);
    const task = String(b.task ?? 'explain_concept');
    return {
      status: 200,
      json: {
        task,
        prompt_version: `${task}@1`,
        data: aiData(task, mode, b),
        cached: false,
        ai_generated: true,
        response_id: randomUUID(),
        quota: quota(),
      },
    };
  }

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/functions/v1/ai-tutor':
        return tutor(b);
      case '/rest/v1/rpc/ai_quota_status':
        return { json: quota() };
      case '/rest/v1/rpc/ack_ai_notice':
        ackCalls += 1;
        ackAt ??= new Date().toISOString();
        return { json: ackAt };
      case '/rest/v1/rpc/ai_report': {
        if (!['wrong', 'unclear', 'unsafe', 'other'].includes(String(b.p_reason))) return rpcError('invalid_reason');
        reports.push(b);
        return { json: randomUUID() };
      }
    }
    return null;
  }

  return {
    handle,
    ackAt: () => ackAt,
    controls: {
      setMode: (next: AiMockMode) => {
        mode = next;
      },
      requests: () => requests.map((r) => ({ ...r })),
      reports: () => reports.map((r) => ({ ...r })),
      ackCalls: () => ackCalls,
    },
  };
}

// ==== BEGIN session page planner mocks (spec 6, task P3: /app/phien-hoc) ==========================================
// Stateful get_session_inputs / save_session_plan / get_today_session / update_session_item / reorder_session /
// finish_session / session_recap. Only active when mockSupabase gets a `planner` option; it must come before the
// P4 session mocks in the RPC chain so the session page specs get one consistent store.

export interface PlannerMockOptions {
  /** Today's session already on the server (planned/in_progress/completed). Ids are filled in when missing. */
  session?: Row | null;
  /** Rows served by session_recap. */
  recap?: Row[];
  /** Today's goal in minutes (default: the path's weekly_minutes for today). */
  goalMinutes?: number;
}

/** Stateful stand-in for get_session_inputs / save_session_plan / get_today_session / … / session_recap. */
function createPlannerBackend(paths: Array<Record<string, unknown>>, options: PlannerMockOptions | undefined) {
  const opts = options ?? {};
  const sessions: Row[] = [];
  const calls: Array<[string, Row]> = [];
  const isOpen = (s: Row) => s.status === 'planned' || s.status === 'in_progress';
  const today = () => localDate();
  const pathOf = (id: unknown) => paths.find((p) => p.id === id && p.status !== 'archived');
  const goal = (path: Record<string, unknown>) => {
    if (opts.goalMinutes !== undefined) return opts.goalMinutes;
    const weekly = (path.weekly_minutes as number[] | undefined) ?? [];
    const monday0 = (new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7;
    return weekly[monday0] ?? 0;
  };
  const studiedSeconds = (pathId: unknown) =>
    sessions
      .filter((s) => s.path_id === pathId && s.local_date === today())
      .reduce((sum, s) => sum + (s.plan.activities as Row[]).reduce((n, a) => n + Number(a.seconds_spent), 0), 0);

  if (opts.session && paths[0]) {
    sessions.push({
      id: randomUUID(),
      path_id: paths[0].id,
      local_date: today(),
      status: 'planned',
      minutes_planned: opts.session.plan?.minutes ?? 30,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      ...opts.session,
    });
  }

  const latest = (pathId: unknown) =>
    sessions.filter((s) => s.path_id === pathId && s.local_date === today() && s.status !== 'abandoned').at(-1) ?? null;
  const copy = (s: Row) => structuredClone(s);

  function inputs(path: Record<string, unknown>) {
    const lessons = BUNDLE.lessons
      .filter((l) => l.status === 'published' && l.language_code === path.language_code)
      .map((l) => ({ lesson: l, unit: BUNDLE.units.find((u) => u.id === l.unit_id)! }))
      .sort((a, b) => a.unit.order_index - b.unit.order_index || a.lesson.order_index - b.lesson.order_index)
      .slice(0, 5);
    return {
      path_id: path.id,
      language_code: path.language_code,
      local_date: today(),
      daily_goal_minutes: goal(path),
      studied_seconds_today: studiedSeconds(path.id),
      due_count: 4,
      overdue_count: 1,
      new_card_count: 2,
      next_lessons: lessons.map(({ lesson, unit }) => ({
        lesson_id: lesson.id,
        title_vi: lesson.title.vi,
        estimated_minutes: lesson.estimated_minutes,
        skills: lesson.skills,
        run_status: 'not_started',
        unit_order: unit.order_index,
        lesson_order: lesson.order_index,
      })),
      skills: [{ skill: 'grammar', level_code: String(path.current_level), confidence: 'low', recent_accuracy: 0.58 }],
      days_since_last_study: 1,
    };
  }

  function save(b: Row) {
    const path = pathOf(b.p_path_id);
    if (!path) return rpcError('path_not_found');
    if (path.status === 'paused') return rpcError('path_not_active');
    const parsed = sessionPlanSchema.safeParse(b.p_plan);
    if (!parsed.success) return rpcError('invalid_plan');
    // Like the SQL: lesson/practice need a lesson, review/recap have none, review_limit only on a review.
    const shapeOk = parsed.data.activities.every((a) =>
      (a.kind === 'lesson' || a.kind === 'practice' ? a.lesson_id !== null : a.lesson_id === null) && (a.kind === 'review' || a.review_limit === null),
    );
    if (!shapeOk) return rpcError('invalid_plan');
    const open = sessions.find((s) => s.path_id === path.id && s.local_date === today() && isOpen(s));
    if (open && !b.p_replace) return { json: copy(open) };
    if (open) open.status = 'abandoned';
    const row: Row = {
      id: randomUUID(),
      path_id: path.id,
      local_date: today(),
      status: 'planned',
      minutes_planned: parsed.data.minutes,
      plan: parsed.data,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
    };
    sessions.push(row);
    return { json: copy(row) };
  }

  function openSession(id: unknown): { session: Row; refused: null } | { session: null; refused: { status: number; json: unknown } } {
    const s = sessions.find((x) => x.id === id);
    if (!s) return { session: null, refused: rpcError('session_not_found') };
    if (!isOpen(s)) return { session: null, refused: rpcError('session_closed') };
    return { session: s, refused: null };
  }

  function update(b: Row) {
    const { session: s, refused } = openSession(b.p_session_id);
    if (!s) return refused;
    const item = (s.plan.activities as Row[]).find((a) => a.id === b.p_item_id);
    if (!item) return rpcError('item_not_found');
    item.status = b.p_status;
    item.seconds_spent = Number(item.seconds_spent) + Math.min(7200, Math.max(0, Number(b.p_seconds)));
    if (s.status === 'planned') Object.assign(s, { status: 'in_progress', started_at: new Date().toISOString() });
    if ((s.plan.activities as Row[]).every((a) => a.status !== 'pending')) Object.assign(s, { status: 'completed', completed_at: new Date().toISOString() });
    return { json: copy(s) };
  }

  function reorder(b: Row) {
    const { session: s, refused } = openSession(b.p_session_id);
    if (!s) return refused;
    const order = b.p_order as string[];
    const activities = s.plan.activities as Row[];
    const ids = activities.map((a) => a.id as string);
    if (order.length !== ids.length || [...order].sort().join() !== [...ids].sort().join()) return rpcError('invalid_order');
    s.plan.activities = order.map((id) => activities.find((a) => a.id === id)!);
    return { json: copy(s) };
  }

  function finish(b: Row) {
    const same = sessions.find((x) => x.id === b.p_session_id && x.status === b.p_status);
    if (same) return { json: copy(same) }; // idempotent like the SQL
    const { session: s, refused } = openSession(b.p_session_id);
    if (!s) return refused;
    Object.assign(s, { status: b.p_status, completed_at: new Date().toISOString() });
    return { json: copy(s) };
  }

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    if (!options) return null;
    const name = pathname.replace('/rest/v1/rpc/', '');
    switch (pathname) {
      case '/rest/v1/rpc/get_session_inputs': {
        calls.push([name, b]);
        const path = pathOf(b.p_path_id);
        if (!path) return rpcError('path_not_found');
        return path.status === 'paused' ? rpcError('path_not_active') : { json: inputs(path) };
      }
      case '/rest/v1/rpc/save_session_plan':
        calls.push([name, b]);
        return save(b);
      case '/rest/v1/rpc/get_today_session': {
        calls.push([name, b]);
        const path = pathOf(b.p_path_id);
        if (!path) return rpcError('path_not_found');
        const s = latest(path.id);
        return { json: { session: s ? copy(s) : null, studied_seconds_today: studiedSeconds(path.id), daily_goal_minutes: goal(path) } };
      }
      case '/rest/v1/rpc/update_session_item':
        calls.push([name, b]);
        return update(b);
      case '/rest/v1/rpc/reorder_session':
        calls.push([name, b]);
        return reorder(b);
      case '/rest/v1/rpc/finish_session':
        calls.push([name, b]);
        return finish(b);
      case '/rest/v1/rpc/session_recap': {
        calls.push([name, b]);
        const s = sessions.find((x) => x.id === b.p_session_id);
        return s ? { json: opts.recap ?? [] } : rpcError('session_not_found');
      }
    }
    return null;
  }

  return {
    handle,
    controls: {
      calls: (name?: string) => calls.filter(([n]) => !name || n === name).map(([n, b]) => [n, structuredClone(b)] as [string, Row]),
      sessions: () => sessions.map(copy),
    },
  };
}

// ==== END session page planner mocks =============================================================================

// ==== BEGIN session planner mocks (spec 6, task P4: home TodayCard + lesson/review return) =====================
// get_today_session and update_session_item only. The session page's own RPCs (get_session_inputs,
// save_session_plan, reorder_session, finish_session) are expected to join this block when it lands.

export const SESSION_ID = '5e551011-0000-4000-8000-000000000001';

export interface SessionMockOptions {
  /** The study session get_today_session returns (default none). Its activities are updated in place. */
  session?: Row | null;
  /** Default 30. */
  dailyGoalMinutes?: number;
  /** Default 0. */
  studiedSecondsToday?: number;
  /** Answer like PostgREST when the function is not deployed (404 PGRST202). */
  missing?: boolean;
}

export interface MockSessionItemUpdate {
  sessionId: string;
  itemId: string;
  status: string;
  seconds: number;
}

/** A study session row as get_today_session returns it; activities default to a review, a lesson and a practice. */
export function studySessionRow(overrides: Row = {}, activities?: Row[]): Row {
  const activity = (a: Row): Row => ({ lesson_id: null, review_limit: null, priority: 50, status: 'pending', seconds_spent: 0, ...a });
  return {
    id: SESSION_ID,
    path_id: '5e551011-0000-4000-8000-0000000000aa',
    local_date: localDate(),
    status: 'in_progress',
    minutes_planned: 30,
    plan: {
      minutes: 30,
      activities: (
        activities ?? [
          { id: 'a1', kind: 'review', minutes: 6, review_limit: 2, title_vi: 'Ôn thẻ đến hạn', reason_vi: 'Có 4 thẻ đến hạn hôm nay.', priority: 90 },
          { id: 'a2', kind: 'lesson', minutes: 10, lesson_id: DEMO_LESSONS.enHello.id, title_vi: 'Xin chào!', reason_vi: 'Bài tiếp theo trong lộ trình.', priority: 70 },
          { id: 'a3', kind: 'practice', minutes: 10, lesson_id: DEMO_LESSONS.enHello.id, title_vi: 'Nghe', reason_vi: 'Kỹ năng nghe đang yếu nhất.', priority: 60 },
        ]
      ).map(activity),
      focus_vi: 'Ưu tiên ôn tập: 4 thẻ đến hạn',
      backlog_mode: false,
    },
    created_at: '2026-10-13T01:00:00Z',
    started_at: '2026-10-13T01:05:00Z',
    completed_at: null,
    ...overrides,
  };
}

function createSessionBackend(opts: SessionMockOptions = {}) {
  const session: Row | null = opts.session ? structuredClone(opts.session) : null;
  const updates: MockSessionItemUpdate[] = [];
  let studied = opts.studiedSecondsToday ?? 0;
  const missing = { status: 404, json: { code: 'PGRST202', message: 'Could not find the function', details: null, hint: null } };

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/get_today_session':
        if (opts.missing) return missing;
        return { json: { session, studied_seconds_today: studied, daily_goal_minutes: opts.dailyGoalMinutes ?? 30 } };
      case '/rest/v1/rpc/update_session_item': {
        if (opts.missing) return missing;
        if (!session || b.p_session_id !== session.id) return rpcError('session_not_found');
        const item = (session.plan.activities as Row[]).find((a) => a.id === b.p_item_id);
        if (!item) return rpcError('item_not_found');
        const seconds = Math.min(7200, Math.max(0, Number(b.p_seconds)));
        updates.push({ sessionId: String(b.p_session_id), itemId: String(b.p_item_id), status: String(b.p_status), seconds });
        Object.assign(item, { status: b.p_status, seconds_spent: item.seconds_spent + seconds });
        studied += seconds;
        return { status: 204, json: null };
      }
    }
    return null;
  }

  return { handle, updates: () => [...updates] };
}
// ==== END session planner mocks ==================================================================================

// ==== exam practice mocks (spec 9, X5) ===========================================================================

const EXAM_BUNDLE = JSON.parse(SEED_SQL.slice(SEED_SQL.indexOf('$exam$') + 6, SEED_SQL.lastIndexOf('$exam$'))) as { forms: Row[] };
const EXAM_SECTION_ORDER = ['listening', 'reading', 'writing'] as const;
const EXAM_FAMILY_ORDER = ['topik_i', 'topik_ii', 'cefr'] as const;
const EXAM_GRACE_MS = 30_000;

/** A demo exam form of supabase/seed.sql by key, e.g. `ko:exam:topik-i-mock-1`, with its questions and keys. */
export function examForm(key: string): Row {
  const form = EXAM_BUNDLE.forms.find((f) => f.key === key);
  if (!form) throw new Error(`demo exam form ${key} missing from supabase/seed.sql`);
  return form;
}

export interface ExamMockOptions {
  /** Overrides the length of a timed full mock (default: the form's time limits). */
  deadlineSeconds?: number;
}

interface MockExamAttempt {
  id: string;
  pathId: string;
  form: Row;
  mode: 'full' | 'section' | 'question_type';
  section: string | null;
  questionType: string | null;
  questionIds: string[];
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  result: Row | null;
  answers: Map<string, { answer: string | null; flagged: boolean; key: string; payload: string }>;
}

export interface MockExamSave {
  attemptId: string;
  questionId: string;
  answer: string | null;
  flagged: boolean;
}

/** Stateful in-memory stand-in for the exam RPCs of spec 9 §3, graded with the shared grader like submit_exam. */
function createExamBackend(paths: Array<Record<string, unknown>>, opts: ExamMockOptions = {}) {
  const attempts: MockExamAttempt[] = [];
  const saves: MockExamSave[] = [];
  const allQuestions = () => EXAM_BUNDLE.forms.flatMap((f) => (f.questions as Row[]).map((q) => ({ form: f, q })));
  const questionById = (id: string) => allQuestions().find((x) => x.q.id === id)!.q;
  const sectionRank = (s: string) => EXAM_SECTION_ORDER.indexOf(s as (typeof EXAM_SECTION_ORDER)[number]);
  const overdue = (a: MockExamAttempt) => a.deadlineAt !== null && Date.now() > Date.parse(a.deadlineAt) + EXAM_GRACE_MS;

  const structureWarning = (goal: unknown, family: string) =>
    goal === 'topik_ii' && family === 'topik_i'
      ? 'Đề này theo cấu trúc TOPIK I, khác mục tiêu TOPIK II của lộ trình. Kết quả chỉ để tham khảo.'
      : goal === 'topik_i' && family === 'topik_ii'
        ? 'Đề này theo cấu trúc TOPIK II, khác mục tiêu TOPIK I của lộ trình. Kết quả chỉ để tham khảo.'
        : goal === 'cefr' && family !== 'cefr'
          ? 'Đề này không theo khung CEFR, khác mục tiêu CEFR của lộ trình. Kết quả chỉ để tham khảo.'
          : null;

  const servedPrompt = (q: Row) => {
    const prompt: Row = { ...q.prompt, audio_asset_id: q.prompt.audio_asset_id ?? null };
    if (q.script && !prompt.audio_asset_id) prompt.tts_text = q.script;
    return prompt;
  };

  function attemptJson(a: MockExamAttempt): Row {
    const path = paths.find((p) => p.id === a.pathId);
    return {
      attempt_id: a.id,
      form_id: a.form.id,
      form_title_vi: a.form.title_vi,
      family: a.form.family,
      mode: a.mode,
      section: a.section,
      question_type: a.questionType,
      status: a.status,
      started_at: a.startedAt,
      deadline_at: a.deadlineAt,
      server_now: new Date().toISOString(),
      questions: a.questionIds.map((id, i) => {
        const q = questionById(id);
        const saved = a.answers.get(id);
        return {
          question_id: id,
          seq: i + 1,
          section: q.section,
          kind: q.kind,
          question_type: q.question_type,
          points: q.points,
          prompt: servedPrompt(q),
          answer: saved?.answer ?? null,
          flagged: saved?.flagged ?? false,
        };
      }),
      structure_warning_vi: structureWarning(path?.goal_type, a.form.family),
    };
  }

  /** Port of public.exam_build_result. */
  function buildResult(a: MockExamAttempt, status: 'submitted' | 'expired'): Row {
    const form = a.form;
    const topikFull = (form.family === 'topik_i' || form.family === 'topik_ii') && a.mode === 'full';
    const review = a.questionIds.map((id, i) => {
      const q = questionById(id);
      const answer = a.answers.get(id)?.answer ?? null;
      const prompt = servedPrompt(q);
      if (q.script) prompt.script = q.script;
      return {
        question_id: id,
        seq: i + 1,
        section: q.section,
        kind: q.kind,
        question_type: q.question_type,
        points: q.points,
        prompt,
        answer,
        is_correct: gradeExamAnswer(q.kind, answer, q.answer),
        correct_answer: q.kind === 'mcq' ? q.answer : q.kind === 'short_text' ? q.answer[0] : null,
        explanation: q.explanation,
        rubric: q.rubric ?? null,
        sample_answer: q.sample_answer ?? null,
      };
    });
    const sections = EXAM_SECTION_ORDER.filter((s) => review.some((r) => r.section === s)).map((section) => {
      const rows = review.filter((r) => r.section === section);
      const points = rows.reduce((n, r) => n + (r.is_correct ? r.points : 0), 0);
      const max = rows.reduce((n, r) => n + (r.kind !== 'essay' ? r.points : 0), 0);
      const essay = rows.reduce((n, r) => n + (r.kind === 'essay' ? r.points : 0), 0);
      const sectionMax = form.scoring.section_max?.[section];
      const scaled = topikFull && typeof sectionMax === 'number' ? Math.round((max + essay > 0 ? points / (max + essay) : 0) * sectionMax * 10) / 10 : null;
      return { section, points, max, correct: rows.filter((r) => r.is_correct).length, total: rows.filter((r) => r.kind !== 'essay').length, scaled, essay };
    });
    const byType = [...new Set(review.filter((r) => r.kind !== 'essay').map((r) => `${r.section}|${r.question_type}`))]
      .map((k) => k.split('|') as [string, string])
      .sort((x, y) => sectionRank(x[0]) - sectionRank(y[0]) || x[1].localeCompare(y[1]))
      .map(([section, type]) => {
        const rows = review.filter((r) => r.kind !== 'essay' && r.question_type === type && r.section === section);
        return {
          question_type: type,
          section,
          points: rows.reduce((n, r) => n + (r.is_correct ? r.points : 0), 0),
          max: rows.reduce((n, r) => n + r.points, 0),
          correct: rows.filter((r) => r.is_correct).length,
          total: rows.length,
        };
      });
    let estimated: Row | null = null;
    if (topikFull && form.scoring.bands.length > 0) {
      const scaledTotal = Math.round(sections.reduce((n, s) => n + (s.scaled ?? 0), 0) * 10) / 10;
      const band = [...form.scoring.bands].sort((x: Row, y: Row) => y.min_total - x.min_total).find((b: Row) => b.min_total <= scaledTotal);
      const hasEssay = sections.some((s) => s.essay > 0);
      estimated = {
        level_code: band?.level_code ?? null,
        scaled_total: scaledTotal,
        label_vi: `${band ? '' : 'Chưa đạt bậc thấp nhất. '}Quy đổi tham khảo, không phải kết quả chính thức.${hasEssay ? ' Phần viết luận chưa tính điểm.' : ''}`,
      };
    }
    const cefr =
      form.family === 'cefr' && a.mode !== 'question_type' && typeof form.scoring.pass_ratio === 'number'
        ? sections.filter((s) => s.max > 0).map((s) => ({ section: s.section, level_code: form.level_to, reached: s.points / s.max >= form.scoring.pass_ratio }))
        : null;
    return {
      attempt_id: a.id,
      form_id: form.id,
      form_title_vi: form.title_vi,
      family: form.family,
      mode: a.mode,
      status,
      started_at: a.startedAt,
      submitted_at: new Date().toISOString(),
      total: sections.reduce((n, s) => n + s.points, 0),
      max: sections.reduce((n, s) => n + s.max, 0),
      by_section: sections.map(({ essay: _essay, ...s }) => s), // eslint-disable-line @typescript-eslint/no-unused-vars
      by_question_type: byType,
      estimated_level: estimated,
      cefr_sections: cefr,
      scoring_verified: form.scoring.verified,
      scoring_source_vi: form.scoring.source_note_vi,
      review,
    };
  }

  function close(a: MockExamAttempt, status: 'submitted' | 'expired'): Row {
    if (a.status === 'in_progress') {
      a.result = buildResult(a, status);
      a.status = status;
      a.submittedAt = a.result.submitted_at;
    }
    return a.result!;
  }

  const own = (id: unknown) => attempts.find((a) => a.id === id);

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/list_exam_forms':
        return {
          json: EXAM_BUNDLE.forms
            .filter((f) => f.language_code === b.p_language)
            .sort((x, y) => EXAM_FAMILY_ORDER.indexOf(x.family) - EXAM_FAMILY_ORDER.indexOf(y.family) || x.key.localeCompare(y.key))
            .map((f) => {
              const qs = f.questions as Row[];
              const last = attempts
                .filter((a) => a.form.id === f.id && a.status !== 'in_progress')
                .sort((x, y) => String(y.submittedAt).localeCompare(String(x.submittedAt)))[0];
              return {
                form_id: f.id,
                key: f.key,
                language_code: f.language_code,
                family: f.family,
                title_vi: f.title_vi,
                description_vi: f.description_vi,
                level_from: f.level_from,
                level_to: f.level_to,
                is_demo: f.is_demo,
                sections: EXAM_SECTION_ORDER.filter((s) => qs.some((q) => q.section === s)).map((s) => ({
                  section: s,
                  question_count: qs.filter((q) => q.section === s).length,
                  minutes: f.time_limits[s] ?? null,
                })),
                question_types: [...new Set(qs.map((q) => `${q.section}|${q.question_type}`))]
                  .map((k) => k.split('|') as [string, string])
                  .sort((x, y) => sectionRank(x[0]) - sectionRank(y[0]) || x[1].localeCompare(y[1]))
                  .map(([section, type]) => ({ question_type: type, section, count: qs.filter((q) => q.question_type === type).length })),
                scoring_verified: f.scoring.verified,
                last_attempt: last ? { attempt_id: last.id, submitted_at: last.submittedAt, total: last.result!.total, max: last.result!.max } : null,
              };
            }),
        };
      case '/rest/v1/rpc/start_exam': {
        const path = paths.find((p) => p.id === b.p_path_id && p.status !== 'archived');
        if (!path) return rpcError('path_not_found');
        const form = EXAM_BUNDLE.forms.find((f) => f.id === b.p_form_id);
        if (!form) return rpcError('form_not_found');
        if (form.language_code !== path.language_code) return rpcError('language_mismatch');
        const mode = b.p_mode as MockExamAttempt['mode'];
        if (
          !['full', 'section', 'question_type'].includes(mode) ||
          (mode === 'section' && !EXAM_SECTION_ORDER.includes(b.p_section)) ||
          (mode === 'question_type' && !b.p_question_type)
        ) {
          return rpcError('invalid_mode');
        }
        const questionType = mode === 'question_type' ? String(b.p_question_type) : null;
        const open = attempts.find((a) => a.pathId === path.id && a.status === 'in_progress');
        if (open) {
          if (!overdue(open) && open.form.id === form.id && open.mode === mode && (mode !== 'section' || open.section === b.p_section) && open.questionType === questionType) {
            return { json: attemptJson(open) };
          }
          close(open, 'expired');
        }
        let ids: string[];
        if (mode === 'question_type') {
          ids = allQuestions()
            .filter((x) => x.form.family === form.family && x.form.language_code === form.language_code && x.q.question_type === questionType)
            .slice(0, 10)
            .map((x) => x.q.id);
        } else {
          ids = (form.questions as Row[])
            .filter((q) => mode === 'full' || q.section === b.p_section)
            .sort((x, y) => sectionRank(x.section) - sectionRank(y.section) || x.seq - y.seq)
            .map((q) => q.id);
        }
        if (ids.length === 0) return rpcError('invalid_mode');
        const sections = new Set(ids.map((id) => questionById(id).section as string));
        const minutes = mode === 'full' ? [...sections].reduce((n, s) => n + (form.time_limits[s] ?? 0), 0) : 0;
        const now = Date.now();
        const lengthMs = opts.deadlineSeconds !== undefined ? opts.deadlineSeconds * 1000 : minutes * 60_000;
        const attempt: MockExamAttempt = {
          id: randomUUID(),
          pathId: String(path.id),
          form,
          mode,
          section: mode === 'section' ? String(b.p_section) : mode === 'question_type' ? questionById(ids[0]!).section : null,
          questionType,
          questionIds: ids,
          status: 'in_progress',
          startedAt: new Date(now).toISOString(),
          deadlineAt: minutes > 0 ? new Date(now + lengthMs).toISOString() : null,
          submittedAt: null,
          result: null,
          answers: new Map(),
        };
        attempts.push(attempt);
        return { json: attemptJson(attempt) };
      }
      case '/rest/v1/rpc/get_exam_attempt': {
        const a = own(b.p_attempt_id);
        if (!a) return rpcError('attempt_not_found');
        if (a.status !== 'in_progress') return { json: a.result };
        if (overdue(a)) return { json: close(a, 'expired') };
        return { json: attemptJson(a) };
      }
      case '/rest/v1/rpc/save_exam_answer': {
        const a = own(b.p_attempt_id);
        if (!a) return rpcError('attempt_not_found');
        const answer = b.p_answer === '' ? null : ((b.p_answer as string | null) ?? null);
        const flagged = Boolean(b.p_flagged);
        const payload = JSON.stringify([b.p_question_id, answer, flagged]);
        const now = new Date().toISOString();
        const prev = [...a.answers.values()].find((x) => x.key === b.p_idempotency_key);
        if (prev) {
          if (prev.payload === payload) return { json: { saved: true, status: a.status, server_now: now, replayed: true } };
          return rpcError('idempotency_conflict');
        }
        if (a.status === 'submitted') return rpcError('attempt_closed');
        if (a.status === 'in_progress' && overdue(a)) close(a, 'expired');
        if (a.status === 'expired') return { json: { saved: false, status: 'expired', server_now: now, replayed: false } };
        if (!a.questionIds.includes(String(b.p_question_id))) return rpcError('question_not_in_attempt');
        a.answers.set(String(b.p_question_id), { answer, flagged, key: String(b.p_idempotency_key), payload });
        saves.push({ attemptId: a.id, questionId: String(b.p_question_id), answer, flagged });
        return { json: { saved: true, status: 'in_progress', server_now: now, replayed: false } };
      }
      case '/rest/v1/rpc/submit_exam': {
        const a = own(b.p_attempt_id);
        if (!a) return rpcError('attempt_not_found');
        if (a.status !== 'in_progress') return { json: a.result };
        return { json: close(a, overdue(a) ? 'expired' : 'submitted') };
      }
      case '/rest/v1/rpc/exam_history': {
        if (!paths.some((p) => p.id === b.p_path_id)) return rpcError('path_not_found');
        const limit = Math.min(Math.max(Number(b.p_limit ?? 20), 1), 100);
        return {
          json: attempts
            .filter((a) => a.pathId === b.p_path_id)
            .sort((x, y) => y.startedAt.localeCompare(x.startedAt))
            .slice(0, limit)
            .map((a) => ({
              attempt_id: a.id,
              form_title_vi: a.form.title_vi,
              family: a.form.family,
              mode: a.mode,
              section: a.section,
              status: a.status,
              started_at: a.startedAt,
              submitted_at: a.submittedAt,
              total: a.result?.total ?? null,
              max: a.result?.max ?? null,
              estimated_level_code: a.result?.estimated_level?.level_code ?? null,
              scoring_verified: a.form.scoring.verified,
            })),
        };
      }
    }
    return null;
  }

  return {
    handle,
    controls: {
      saves: () => [...saves],
      attempts: () => attempts.map((a) => ({ id: a.id, mode: a.mode, status: a.status, questionIds: [...a.questionIds] })),
    },
  };
}
// ==== END exam practice mocks ====================================================================================

// ==== BEGIN progress + analytics mocks (spec 8, task G4) ==========================================================
// get_progress_dashboard, track_events and the user_preferences columns show_motivation / analytics_opt_out.

/** A learning path id the progress contract accepts (path_id is validated as a UUID). */
export const PROGRESS_PATH_ID = '30000000-0000-4000-8000-0000000000e1';

export interface ProgressMockOptions {
  /** Initial user_preferences.show_motivation (default true). */
  showMotivation?: boolean;
  /** Initial user_preferences.analytics_opt_out (default false). */
  analyticsOptOut?: boolean;
  /** Badges reported in `new_badges` by the first dashboard call only (like the RPC awarding them once). */
  newBadges?: string[];
  /** Days without any activity: the "no data yet" state. */
  empty?: boolean;
}

/** A get_progress_dashboard payload for `range` days ending today (Asia/Ho_Chi_Minh), Sundays as rest days. */
export function progressDashboardRow(pathId: string, range: number, opts: { empty?: boolean; motivation?: Row | null } = {}): Row {
  const days = Array.from({ length: range }, (_, i) => {
    const date = localDate(i - (range - 1));
    const rest = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    const minutes = opts.empty || rest ? 0 : 8 + ((i * 7) % 25);
    return {
      date,
      minutes,
      xp: minutes * 2,
      lessons: minutes > 20 ? 1 : 0,
      reviews: minutes > 0 ? 10 : 0,
      answers: minutes,
      goal_minutes: rest ? 0 : 30,
      active: minutes >= 5,
    };
  });
  const sum = (key: 'minutes' | 'lessons' | 'reviews') => days.reduce((n, d) => n + d[key], 0);
  const week = days.slice(-7);
  const accuracy = (attempts: number, value: number) => ({ attempts, accuracy: attempts >= 10 ? value : null });
  const skills = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'].map((skill, i) => ({
    skill,
    ...(opts.empty ? accuracy(0, 0) : accuracy([42, 25, 12, 4, 0, 0][i]!, [0.82, 0.64, 0.75, 0, 0, 0][i]!)),
    prev_attempts: opts.empty ? 0 : 20,
    prev_accuracy: opts.empty || i > 2 ? null : 0.7,
  }));
  const types = ['mcq', 'fill_blank', 'word_bank', 'translate', 'listen'].map((exercise_type, i) => ({
    exercise_type,
    ...(opts.empty ? accuracy(0, 0) : accuracy([30, 14, 9, 11, 0][i]!, [0.9, 0.71, 0, 0.55, 0][i]!)),
    prev_attempts: opts.empty ? 0 : 10,
    prev_accuracy: opts.empty || i === 2 || i === 4 ? null : 0.7,
  }));
  return {
    path_id: pathId,
    range_days: range,
    today: localDate(),
    days,
    totals: {
      today_minutes: days[days.length - 1]!.minutes,
      week_minutes: week.reduce((n, d) => n + d.minutes, 0),
      week_goal_minutes: week.reduce((n, d) => n + d.goal_minutes, 0),
      range_minutes: sum('minutes'),
      lessons_completed: sum('lessons'),
      reviews_done: sum('reviews'),
      application_done: opts.empty ? 0 : 6,
    },
    skills,
    exercise_types: types,
    estimates: [
      { skill: 'vocabulary', level_code: 'a2', confidence: 'medium', source: 'diagnostic', sample_size: 18, assessed_at: '2026-10-01T09:15:00Z' },
      { skill: 'grammar', level_code: 'a2', confidence: 'self_reported', source: 'self_report', sample_size: 0, assessed_at: '2026-09-15T07:00:00Z' },
    ],
    mistakes: opts.empty
      ? []
      : [
          {
            prompt: 'She ___ to school every day.',
            lesson_id: DEMO_LESSONS.enHello.id,
            lesson_title: 'Xin chào!',
            wrong_count: 3,
            last_wrong_at: '2026-10-12T10:00:00Z',
          },
        ],
    motivation: opts.motivation === undefined ? null : opts.motivation,
  };
}

function createProgressBackend(opts: ProgressMockOptions = {}) {
  const prefs = { show_motivation: opts.showMotivation ?? true, analytics_opt_out: opts.analyticsOptOut ?? false };
  let pendingBadges = [...(opts.newBadges ?? [])];
  const dashboardCalls: Array<{ pathId: string; range: number }> = [];
  const events: Row[] = [];

  function motivation(): Row | null {
    if (!prefs.show_motivation) return null;
    const fresh = pendingBadges;
    pendingBadges = [];
    return {
      xp_total: 1240,
      xp_week: 180,
      streak_current: 6,
      streak_best: 11,
      grace_left: 1,
      weekly_challenge: { target_days: 5, done_days: 2, completed: false, completed_weeks: 3 },
      badges: [
        { key: 'first_lesson', earned_at: '2026-09-20T08:00:00Z' },
        { key: 'streak_7', earned_at: '2026-10-05T12:30:00Z' },
        ...fresh.map((key) => ({ key, earned_at: new Date().toISOString() })),
      ],
      new_badges: fresh,
    };
  }

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/get_progress_dashboard': {
        const range = Number(b.p_range_days);
        if (![7, 14, 28].includes(range)) return rpcError('invalid_range');
        dashboardCalls.push({ pathId: String(b.p_path_id), range });
        return { json: progressDashboardRow(String(b.p_path_id), range, { empty: opts.empty, motivation: motivation() }) };
      }
      case '/rest/v1/rpc/track_events': {
        const batch = Array.isArray(b.p_events) ? (b.p_events as Row[]) : [];
        // Every event the client sends is recorded, so a test can check that an opted-out client sends none.
        // The client ignores the count, so 0 (what the RPC answers for an opted-out user) is a safe default.
        events.push(...batch);
        return { json: 0 };
      }
    }
    return null;
  }

  return {
    handle,
    prefs,
    /** Applies a PATCH on user_preferences to the stateful columns. */
    patchPrefs(body: Row) {
      if (typeof body.show_motivation === 'boolean') prefs.show_motivation = body.show_motivation;
      if (typeof body.analytics_opt_out === 'boolean') prefs.analytics_opt_out = body.analytics_opt_out;
    },
    controls: {
      dashboardCalls: () => [...dashboardCalls],
      events: () => events.map((e) => ({ ...e })),
      prefs: () => ({ ...prefs }),
    },
  };
}
// ==== END progress + analytics mocks =============================================================================

// ==== content reports + admin mocks (spec 11) ====================================================================

export type MockStaffRole = 'editor' | 'reviewer' | 'admin';

export interface AdminMockOptions {
  /** staff_role(): null (default) for an ordinary learner. */
  staffRole?: MockStaffRole | null;
  /** Reports already filed before the test (rows shaped like MockReport; missing fields get defaults). */
  reports?: Array<Partial<MockReport> & Pick<MockReport, 'target_kind' | 'target_id'>>;
}

export interface MockReport {
  id: string;
  target_kind: string;
  target_id: string;
  target_label: string | null;
  reason: string;
  note: string | null;
  status: string;
  resolution_note: string | null;
  content_version: number | null;
  created_at: string;
  resolved_at: string | null;
}

const REPORT_KINDS = ['exercise', 'learning_item', 'lesson', 'assessment_item', 'exam_question'];
const REPORT_REASON_KEYS = ['wrong_answer', 'unclear', 'typo', 'audio', 'translation', 'offensive', 'other'];
const REPORT_RESOLVE = ['triaged', 'fixed', 'rejected', 'duplicate'];

/** What report_content stores as the label: lesson title, item headword or exercise prompt excerpt (≤ 80). */
function reportTargetLabel(kind: string, id: string): string | null {
  if (kind === 'lesson') return (BUNDLE.lessons.find((l) => l.id === id)?.title?.vi as string | undefined) ?? null;
  if (kind === 'learning_item') return (BUNDLE.learning_items.find((i) => i.id === id)?.front?.text as string | undefined) ?? null;
  if (kind === 'exercise') {
    const prompt = BUNDLE.exercises.find((e) => e.id === id)?.prompt as Row | undefined;
    const text = prompt?.stem ?? prompt?.instruction ?? prompt?.source_text ?? prompt?.template ?? prompt?.fallback_text;
    return typeof text === 'string' ? text.slice(0, 80) : null;
  }
  return null;
}

function createAdminBackend(opts: AdminMockOptions = {}) {
  const role = opts.staffRole ?? null;
  const reports: MockReport[] = (opts.reports ?? []).map((r) => ({
    id: randomUUID(),
    target_label: reportTargetLabel(r.target_kind, r.target_id),
    reason: 'wrong_answer',
    note: null,
    status: 'open',
    resolution_note: null,
    content_version: 1,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    resolved_at: null,
    ...r,
  }));
  const audit: Row[] = [auditEntryFixture()];
  /** admin_* RPCs that reached the "server" (a learner must never trigger one). */
  const adminCalls: string[] = [];

  function listReports(b: Row) {
    const filtered = reports.filter((r) => (b.p_status == null || r.status === b.p_status) && (b.p_kind == null || r.target_kind === b.p_kind));
    const groups = new Map<string, MockReport[]>();
    for (const r of filtered) groups.set(`${r.target_kind}:${r.target_id}`, [...(groups.get(`${r.target_kind}:${r.target_id}`) ?? []), r]);
    const all = [...groups.values()].map((list) => {
      const sorted = [...list].sort((a, c) => c.created_at.localeCompare(a.created_at));
      const reasons: Record<string, number> = {};
      for (const r of list) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      return {
        target_kind: sorted[0]!.target_kind,
        target_id: sorted[0]!.target_id,
        target_label: sorted[0]!.target_label,
        report_count: list.length,
        reasons,
        latest_at: sorted[0]!.created_at,
        reports: sorted.map(({ id, reason, note, status, content_version, created_at }) => ({ id, reason, note, status, content_version, created_at })),
      };
    });
    const offset = Number(b.p_offset ?? 0);
    return { groups: all.slice(offset, offset + Number(b.p_limit ?? 20)), total_groups: all.length };
  }

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    const name = pathname.replace('/rest/v1/rpc/', '');
    if (name.startsWith('admin_')) {
      adminCalls.push(name);
      if (!role) return rpcError('staff_forbidden');
    }
    switch (name) {
      case 'staff_role':
        return { json: role };
      case 'report_content': {
        if (!REPORT_KINDS.includes(String(b.p_target_kind))) return rpcError('invalid_target');
        if (!REPORT_REASON_KEYS.includes(String(b.p_reason))) return rpcError('invalid_reason');
        const dayAgo = Date.now() - DAY_MS;
        const duplicate = reports.some((r) => r.target_kind === b.p_target_kind && r.target_id === b.p_target_id && Date.parse(r.created_at) > dayAgo);
        const report: MockReport = {
          id: randomUUID(),
          target_kind: String(b.p_target_kind),
          target_id: String(b.p_target_id),
          target_label: reportTargetLabel(String(b.p_target_kind), String(b.p_target_id)),
          reason: String(b.p_reason),
          note: (b.p_note as string | null) ?? null,
          status: 'open',
          resolution_note: null,
          content_version: 1,
          created_at: new Date().toISOString(),
          resolved_at: null,
        };
        reports.push(report);
        return { json: { report_id: report.id, status: duplicate ? 'duplicate' : 'open' } };
      }
      case 'list_my_reports':
        return {
          json: [...reports]
            .sort((a, c) => c.created_at.localeCompare(a.created_at))
            .slice(0, Number(b.p_limit ?? 50))
            .map((r) => ({ ...r, content_version: undefined })),
        };
      case 'admin_content_overview':
        return { json: overviewFixture({ open_report_count: reports.filter((r) => r.status === 'open').length }) };
      case 'admin_list_reports':
        return { json: listReports(b) };
      case 'admin_resolve_report': {
        if (!REPORT_RESOLVE.includes(String(b.p_status))) return rpcError('invalid_report_status');
        const ids = new Set((b.p_report_ids as string[] | undefined) ?? []);
        let updated = 0;
        for (const r of reports) {
          if (!ids.has(r.id)) continue;
          Object.assign(r, { status: b.p_status, resolution_note: b.p_resolution_note ?? null, resolved_at: b.p_status === 'triaged' ? null : new Date().toISOString() });
          updated++;
          audit.unshift(auditEntryFixture({ id: randomUUID(), actor_role: role, target_id: r.id, detail: { status: b.p_status }, created_at: new Date().toISOString() }));
        }
        return { json: { updated } };
      }
      case 'admin_list_content':
        return { json: contentListFixture(3) };
      case 'admin_get_content':
        return { json: exerciseDetailFixture({ id: String(b.p_id) }) };
      case 'admin_set_status':
        return { json: { status: b.p_status } };
      case 'admin_list_sources':
        return { json: [sourceFixture()] };
      case 'admin_analytics':
        return { json: analyticsFixture(Number(b.p_days ?? 7)) };
      case 'admin_ai_usage':
        return { json: aiUsageFixture(Number(b.p_days ?? 7)) };
      case 'admin_audit_log_recent':
        return role === 'admin' ? { json: audit.slice(0, Number(b.p_limit ?? 100)) } : rpcError('staff_forbidden');
    }
    return null;
  }

  return {
    handle,
    controls: {
      reports: () => reports.map((r) => ({ ...r })),
      adminCalls: () => [...adminCalls],
    },
  };
}
// ==== END content reports + admin mocks ==========================================================================

// ==== reminders + notifications mocks (spec 10, I2) ==============================================================
// Always on (like progress): an empty inbox and default prefs, so the bell and the Home weekly card never hit a 404.

export interface NotificationMockOptions {
  /** Inbox rows, newest first; build them with makeNotification()/weeklyNotification() from notification-fixtures. */
  items?: AppNotification[];
  prefs?: Partial<NotificationPrefs>;
}

export interface MockNotificationMark {
  id: string;
  action: string;
}

function createNotificationBackend(opts: NotificationMockOptions = {}) {
  const items = (opts.items ?? []).map((n) => ({ ...n }));
  let prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...opts.prefs };
  const marks: MockNotificationMark[] = [];
  const prefPatches: Row[] = [];
  const pushCalls: string[] = [];

  function handle(pathname: string, b: Row): { status?: number; json: unknown } | null {
    switch (pathname) {
      case '/rest/v1/rpc/get_notification_prefs':
        // Postgres `time` columns come back with seconds; the service trims them to HH:MM.
        return { json: { ...prefs, remind_at: `${prefs.remind_at}:00`, quiet_start: `${prefs.quiet_start}:00`, quiet_end: `${prefs.quiet_end}:00` } };
      case '/rest/v1/rpc/set_notification_prefs': {
        const { reset_backoff: reset, ...patch } = (b.p ?? {}) as Row;
        prefPatches.push({ ...(b.p as Row) });
        prefs = { ...prefs, ...patch, ...(reset ? { backoff_level: 0, ignored_streak: 0 } : {}) };
        return { json: prefs };
      }
      case '/rest/v1/rpc/list_notifications': {
        const limit = Number(b.p_limit ?? 20);
        const older = b.p_before ? items.filter((n) => n.created_at < String(b.p_before)) : items;
        return { json: { items: older.slice(0, limit), has_more: older.length > limit } };
      }
      case '/rest/v1/rpc/unread_notification_count':
        return { json: items.filter((n) => !n.read_at).length };
      case '/rest/v1/rpc/mark_notification': {
        const row = items.find((n) => n.id === b.p_id);
        if (!row) return rpcError('notification_not_found');
        if (b.p_action !== 'read' && b.p_action !== 'clicked') return rpcError('invalid_action');
        const now = new Date().toISOString();
        row.read_at ??= now;
        if (b.p_action === 'clicked') row.clicked_at ??= now;
        marks.push({ id: String(b.p_id), action: String(b.p_action) });
        return { status: 204, json: null };
      }
      case '/rest/v1/rpc/save_push_subscription':
        pushCalls.push('save');
        prefs = { ...prefs, push_enabled: true };
        return { status: 204, json: null };
      case '/rest/v1/rpc/delete_push_subscription':
        pushCalls.push('delete');
        return { status: 204, json: null };
    }
    return null;
  }

  return {
    handle,
    controls: {
      marks: () => [...marks],
      prefPatches: () => prefPatches.map((p) => ({ ...p })),
      prefs: () => ({ ...prefs }),
      pushCalls: () => [...pushCalls],
    },
  };
}
// ==== END reminders + notifications mocks ========================================================================

interface MockOptions {
  /** Content reports and the staff admin RPCs (spec 11); staff_role() is null unless set. */
  admin?: AdminMockOptions;
  /** AI tutor function and RPCs (spec 5). */
  ai?: AiMockOptions;
  displayName?: string;
  /** Reminder prefs, inbox and push RPCs (spec 10). Always mocked: empty inbox and default prefs unless set. */
  notifications?: NotificationMockOptions;
  /** Placement test backend (spec 4). */
  diagnostic?: DiagnosticMockOptions;
  /** Exam practice RPCs (spec 9). */
  exam?: ExamMockOptions;
  /** `uuid`: create_learning_path returns a UUID id like the real RPC (default `path-<lang>`). */
  pathIds?: 'slug' | 'uuid';
  /** Learning path rows; defaults to one English path so existing app tests keep their home screen. */
  paths?: Array<Record<string, unknown>>;
  /** Review cards (spec 3); defaults to 4 cards due today on every path. */
  reviews?: ReviewMockOptions;
  /** Session page planner RPCs (spec 6, P3); off unless set. */
  planner?: PlannerMockOptions;
  /** Study session planner (spec 6, P4): get_today_session / update_session_item. */
  session?: SessionMockOptions;
  /** Progress dashboard, analytics and motivation preferences (spec 8). Always mocked; track_events answers 0. */
  progress?: ProgressMockOptions;
}

/**
 * Answer every Supabase request so tests never touch a real backend. Paths, the current id and lesson runs are
 * stateful. Returns counters for assertions.
 */
export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const paths = (opts.paths ?? [pathRow()]).map((p) => ({ ...p }));
  let currentId = (paths[0]?.id as string | undefined) ?? null;
  const lessons = createLessonBackend(paths);
  const reviews = createReviewBackend(paths, opts.reviews);
  const diagnostic = createDiagnosticBackend(paths, opts.diagnostic);
  const ai = createAiBackend(opts.ai);
  const planner = createPlannerBackend(paths, opts.planner); // spec 6, P3
  const sessions = createSessionBackend(opts.session);
  const exams = createExamBackend(paths, opts.exam); // spec 9
  const progress = createProgressBackend(opts.progress); // spec 8, G4
  const admin = createAdminBackend(opts.admin); // spec 11
  const notifications = createNotificationBackend(opts.notifications); // spec 10

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const body = () => (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    switch (url.pathname) {
      case '/rest/v1/profiles':
        if (method === 'GET') {
          return route.fulfill({
            json: { id: USER_ID, display_name: opts.displayName ?? 'Minh Anh', timezone: 'Asia/Ho_Chi_Minh', current_learning_path_id: currentId },
          });
        }
        return route.fulfill({ json: [{ id: USER_ID }] });
      case '/rest/v1/user_preferences':
        if (method === 'GET') {
          return route.fulfill({ json: { theme: 'system', reduce_motion: false, ai_notice_ack_at: ai.ackAt(), ...progress.prefs } });
        }
        if (method === 'PATCH') progress.patchPrefs(body());
        return route.fulfill({ json: [{ user_id: USER_ID, ...progress.prefs }] });
      case '/rest/v1/learning_paths':
        return route.fulfill({ json: paths.filter((p) => p.status !== 'archived') });
      case '/rest/v1/level_reference_hours':
        return route.fulfill({ json: REFERENCE_ROWS });
      case '/rest/v1/rpc/create_learning_path': {
        const b = body();
        const row = pathRow({
          id: opts.pathIds === 'uuid' ? randomUUID() : `path-${String(b.p_language)}`,
          language_code: b.p_language,
          start_point: b.p_start_point,
          goal_type: b.p_goal_type,
          current_level: b.p_current_level,
          target_level: b.p_target_level,
          weekly_minutes: b.p_weekly_minutes,
          target_date: b.p_target_date ?? null,
          created_at: new Date().toISOString(),
        });
        paths.push(row);
        currentId = row.id as string;
        return route.fulfill({ json: row });
      }
      case '/rest/v1/rpc/set_current_learning_path':
        currentId = String(body().p_id);
        return route.fulfill({ status: 204, body: '' });
      case '/rest/v1/rpc/set_learning_path_status': {
        const b = body();
        const row = paths.find((p) => p.id === b.p_id);
        if (!row) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'path_not_found' } });
        row.status = b.p_status;
        if (b.p_status === 'archived' && currentId === row.id) {
          // Mirror the RPC: next open path, active first, then paused, then most recently updated.
          const rank = (p: Record<string, unknown>) => (p.status === 'active' ? 0 : p.status === 'paused' ? 1 : 2);
          const stamp = (p: Record<string, unknown>) => String(p.updated_at ?? p.created_at);
          const next = paths.filter((p) => p.status !== 'archived').sort((a, c) => rank(a) - rank(c) || stamp(c).localeCompare(stamp(a)))[0];
          currentId = (next?.id as string | undefined) ?? null;
        }
        return route.fulfill({ json: row });
      }
      case '/rest/v1/rpc/update_learning_path_plan': {
        const b = body();
        const row = paths.find((p) => p.id === b.p_id);
        if (!row) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'path_not_found' } });
        Object.assign(row, { goal_type: b.p_goal_type, target_level: b.p_target_level, weekly_minutes: b.p_weekly_minutes, target_date: b.p_target_date ?? null });
        return route.fulfill({ json: row });
      }
    }
    const lessonReply =
      url.pathname.startsWith('/rest/v1/rpc/') || url.pathname.startsWith('/functions/v1/')
        ? (lessons.handle(url.pathname, body()) ??
          reviews.handle(url.pathname, body()) ??
          diagnostic.handle(url.pathname, body()) ??
          ai.handle(url.pathname, body()) ??
          planner.handle(url.pathname, body()) ??
          sessions.handle(url.pathname, body()) ??
          exams.handle(url.pathname, body()) ??
          progress.handle(url.pathname, body()) ??
          admin.handle(url.pathname, body()) ??
          notifications.handle(url.pathname, body()))
        : null;
    if (lessonReply) {
      if (lessonReply.status === 204) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: lessonReply.status ?? 200, json: lessonReply.json });
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { message: `not mocked: ${method} ${url.pathname}` } });
  });
  return {
    submitCalls: lessons.submitCalls,
    reviewGrades: reviews.grades,
    postponeCalls: reviews.postponeCalls,
    diagnosticAttempts: diagnostic.attempts,
    ai: ai.controls,
    planner: planner.controls,
    sessionUpdates: sessions.updates,
    exam: exams.controls,
    progress: progress.controls,
    admin: admin.controls,
    notifications: notifications.controls,
    paths: () => paths.map((p) => ({ ...p })),
  };
}

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

/** Seed a valid-looking session in localStorage before the app boots. */
export async function signIn(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'minhanh@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { display_name: 'Minh Anh' },
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: fakeJwt({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', email: user.email, exp: now + 3600 }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user,
  };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(session)] as const);
}

/**
 * Waits until no finite Web Animation / CSS transition is running (infinite ones, such as spinners, are
 * skipped). Polls instead of awaiting `animation.finished` (WebKit can leave that pending for an animation whose
 * element was removed) and needs three idle checks in a row, so animations started a moment later by a scroll
 * or an IntersectionObserver are seen. Pair with `reducedMotion: 'reduce'`: Motion's JS-driven transforms are
 * not Web Animations.
 */
export async function settleAnimations(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __idleChecks: number }).__idleChecks = 0;
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __idleChecks: number };
      const running = document
        .getAnimations()
        .some((a) => a.playState === 'running' && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)));
      w.__idleChecks = running ? 0 : (w.__idleChecks ?? 0) + 1;
      return w.__idleChecks >= 3;
    },
    undefined,
    { polling: 50 },
  );
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}
