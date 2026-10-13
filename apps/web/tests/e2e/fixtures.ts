import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { DEFAULT_RUBRIC, gradeResponse, sessionPlanSchema, type ExerciseResponse, type GradeInput } from '@linguo/shared';

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

function aiData(task: string, mode: AiMockMode): Record<string, unknown> {
  const html = mode === 'html';
  switch (task) {
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
        data: aiData(task, mode),
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

interface MockOptions {
  /** AI tutor function and RPCs (spec 5). */
  ai?: AiMockOptions;
  displayName?: string;
  /** Placement test backend (spec 4). */
  diagnostic?: DiagnosticMockOptions;
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
        if (method === 'GET') return route.fulfill({ json: { theme: 'system', reduce_motion: false, ai_notice_ack_at: ai.ackAt() } });
        return route.fulfill({ json: [{ user_id: USER_ID }] });
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
          sessions.handle(url.pathname, body()))
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

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}
