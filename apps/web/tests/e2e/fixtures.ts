import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { DEFAULT_RUBRIC, gradeResponse, type ExerciseResponse, type GradeInput } from '@linguo/shared';

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

interface MockOptions {
  displayName?: string;
  /** Learning path rows; defaults to one English path so existing app tests keep their home screen. */
  paths?: Array<Record<string, unknown>>;
  /** Review cards (spec 3); defaults to 4 cards due today on every path. */
  reviews?: ReviewMockOptions;
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
        if (method === 'GET') return route.fulfill({ json: { theme: 'system', reduce_motion: false } });
        return route.fulfill({ json: [{ user_id: USER_ID }] });
      case '/rest/v1/learning_paths':
        return route.fulfill({ json: paths.filter((p) => p.status !== 'archived') });
      case '/rest/v1/level_reference_hours':
        return route.fulfill({ json: REFERENCE_ROWS });
      case '/rest/v1/rpc/create_learning_path': {
        const b = body();
        const row = pathRow({
          id: `path-${String(b.p_language)}`,
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
    const lessonReply = url.pathname.startsWith('/rest/v1/rpc/') ? (lessons.handle(url.pathname, body()) ?? reviews.handle(url.pathname, body())) : null;
    if (lessonReply) {
      if (lessonReply.status === 204) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: lessonReply.status ?? 200, json: lessonReply.json });
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { message: `not mocked: ${method} ${url.pathname}` } });
  });
  return { submitCalls: lessons.submitCalls, reviewGrades: reviews.grades, postponeCalls: reviews.postponeCalls };
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
