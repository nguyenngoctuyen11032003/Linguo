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

interface MockOptions {
  displayName?: string;
  /** Learning path rows; defaults to one English path so existing app tests keep their home screen. */
  paths?: Array<Record<string, unknown>>;
}

/**
 * Answer every Supabase request so tests never touch a real backend. Paths, the current id and lesson runs are
 * stateful. Returns counters for assertions.
 */
export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const paths = (opts.paths ?? [pathRow()]).map((p) => ({ ...p }));
  let currentId = (paths[0]?.id as string | undefined) ?? null;
  const lessons = createLessonBackend(paths);

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
    const lessonReply = url.pathname.startsWith('/rest/v1/rpc/') ? lessons.handle(url.pathname, body()) : null;
    if (lessonReply) {
      if (lessonReply.status === 204) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: lessonReply.status ?? 200, json: lessonReply.json });
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { message: `not mocked: ${method} ${url.pathname}` } });
  });
  return { submitCalls: lessons.submitCalls };
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
