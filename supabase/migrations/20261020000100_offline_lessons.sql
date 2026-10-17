-- Linguo offline learning (stream B): lesson content packs with answer keys, offline-safe start_lesson and
-- complete_lesson.
--
-- Product decision: a learner can do lessons with no network. The device downloads the lessons of the learner's
-- own path together with their answer keys (offline_lesson_packs), grades locally for an immediate verdict and
-- queues every answer. The server stays authoritative: replayed attempts are re-graded by submit_exercise, local
-- verdicts never grant XP, streak or day credit. Keys of exams and the diagnostic are never shipped (those live in
-- other tables); the keys here are only those of published lessons of a path the caller owns, in the path's
-- language and inside the path's lesson list (path_lessons). give_up already reveals an answer, so the extra
-- exposure is marginal.
--
-- 1. offline_lesson_manifest(path): what changed (cheap diff for the client's pack cache). Security invoker.
-- 2. offline_lesson_packs(path, lesson ids): up to 20 lessons per call, public lesson payload (identical to
--    get_lesson) plus the current answer keys. Security definer, 60 calls per hour per learner.
-- 3. start_lesson(lesson, path, run id, client_at): the client may mint the run id offline; idempotent on that id,
--    returns the existing open run when one exists (the client remaps), started_at honours client_at only within
--    the last 12 hours (the same window submit_exercise uses for answers) and never from the future.
-- 4. complete_lesson(run, client_at): completed_at follows the conservative rule of
--    20261016000800_progress_vocab_hardening.sql: client_at counts only when it is not before the run's latest
--    stored attempt (effective time) or the run start, not older than 12 hours and not in the future; otherwise the
--    server time is used. The XP / streak day of the lesson follows completed_at.
-- The old 2-argument start_lesson and 1-argument complete_lesson are dropped (PostgREST would see an ambiguous
-- overload for calls that omit the new arguments); calls with only the old arguments keep working through the
-- defaults. Every other line of both functions is the definition they had before.

-- ---------------------------------------------------------------------------
-- Rate-limit bookkeeping (like push_subscription_saves): one row per offline_lesson_packs call, purged per user
-- after a day, no learner content.
-- ---------------------------------------------------------------------------
create table public.offline_pack_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index offline_pack_requests_user_requested_idx on public.offline_pack_requests (user_id, requested_at desc);
comment on table public.offline_pack_requests is 'offline_lesson_packs calls, for its rate limit; kept 1 day.';
alter table public.offline_pack_requests enable row level security;
revoke all on public.offline_pack_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manifest
-- ---------------------------------------------------------------------------

-- One row per lesson of the path's lesson list (the same rows as path_lessons). A pack is stale when any of
-- content_version, content_hash, exercise_versions_hash or items_hash differs from what the device stored.
-- Security invoker: RLS makes another learner's path return no rows.
create or replace function public.offline_lesson_manifest(p_path_id uuid)
returns table (
  lesson_id uuid,
  content_version integer,
  content_hash text,
  exercise_versions_hash text,
  items_hash text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pl.lesson_id,
    l.content_version::integer,
    l.content_hash::text,
    md5(coalesce((
      select string_agg(e.id::text || ':' || e.version::text, ',' order by e.id)
      from public.exercises e
      where e.lesson_id = l.id and e.status = 'published'
    ), '')),
    md5(coalesce((
      select string_agg(i.id::text || ':' || i.content_hash || ':' || li.position::text || ':' || li.role, ',' order by li.position, i.id)
      from public.lesson_items li
      join public.learning_items i on i.id = li.item_id and i.status = 'published'
      where li.lesson_id = l.id
    ), ''))
  from public.path_lessons(p_path_id) pl
  join public.lessons l on l.id = pl.lesson_id;
$$;

-- ---------------------------------------------------------------------------
-- Packs
-- ---------------------------------------------------------------------------

-- {lesson, items, exercises} exactly as get_lesson builds them (lessonPayloadSchema without run/attempts). Internal.
create or replace function public.offline_lesson_public_json(p_lesson_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_lesson jsonb;
  v_items jsonb;
  v_exercises jsonb;
begin
  select jsonb_build_object(
      'id', l.id,
      'key', l.key,
      'language_code', l.language_code,
      'level_code', l.level_code,
      'title', l.title,
      'objectives', l.objectives,
      'body', l.body,
      'estimated_minutes', l.estimated_minutes,
      'skills', to_jsonb(l.skills),
      'content_version', l.content_version,
      'is_demo', l.is_demo,
      'unit_title', u.title,
      'program_title', pr.title
    )
    into v_lesson
  from public.lessons l
  join public.units u on u.id = l.unit_id
  join public.programs pr on pr.id = u.program_id
  where l.id = p_lesson_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'key', i.key,
      'item_type', i.item_type,
      'front', i.front,
      'back', i.back,
      'audio_path', i.audio_path,
      'role', li.role,
      'position', li.position
    ) order by li.position, i.key), '[]'::jsonb)
    into v_items
  from public.lesson_items li
  join public.learning_items i on i.id = li.item_id
  where li.lesson_id = p_lesson_id and i.status = 'published';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'key', e.key,
      'version', e.version,
      'order_index', e.order_index,
      'type', e.exercise_type,
      'stage', e.stage,
      'answer_lang', e.answer_lang,
      'item_id', e.item_id,
      'difficulty', e.difficulty,
      'prompt', e.prompt
    ) order by array_position(array['recognition', 'recall', 'application']::text[], e.stage), e.order_index), '[]'::jsonb)
    into v_exercises
  from public.exercises e
  where e.lesson_id = p_lesson_id and e.status = 'published';

  return jsonb_build_object('lesson', v_lesson, 'items', v_items, 'exercises', v_exercises);
end;
$$;

-- Packs of up to 20 lessons of a path the caller owns: {packs: [{lesson, items, exercises, content_version,
-- keys: [{exercise_id, version, answer_key, rubric, known_wrong, explanation, display_answer, created_at}]}],
-- missing: [lesson ids not (or no longer) in the path's lesson list]}. keys hold the CURRENT key version of every
-- published exercise (the one equal to the exercise's version). Errors: not_authenticated, path_not_found,
-- invalid_lessons (null array), too_many_lessons (> 20 ids), rate_limited (60 calls per hour).
create or replace function public.offline_lesson_packs(p_path_id uuid, p_lesson_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_ids uuid[];
  v_valid uuid[];
  v_recent integer;
  v_packs jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_lesson_ids is null then
    raise exception using errcode = 'P0001', message = 'invalid_lessons';
  end if;
  if cardinality(p_lesson_ids) > 20 then
    raise exception using errcode = 'P0001', message = 'too_many_lessons';
  end if;
  perform 1 from public.learning_paths p where p.id = p_path_id and p.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offline_packs:' || v_uid::text, 0));
  delete from public.offline_pack_requests x where x.user_id = v_uid and x.requested_at < v_now - interval '1 day';
  select count(*)::integer into v_recent
  from public.offline_pack_requests x
  where x.user_id = v_uid and x.requested_at > v_now - interval '1 hour';
  if v_recent >= 60 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  insert into public.offline_pack_requests (user_id, requested_at) values (v_uid, v_now);

  v_ids := array(select distinct x from unnest(p_lesson_ids) as x where x is not null);
  -- Only lessons of this path's own lesson list (published, in the path's language, level range and goal).
  v_valid := coalesce(array(
    select pl.lesson_id from public.path_lessons(p_path_id) pl where pl.lesson_id = any (v_ids)
  ), '{}'::uuid[]);

  select coalesce(jsonb_agg(
      public.offline_lesson_public_json(l.id)
      || jsonb_build_object(
        'content_version', l.content_version,
        'keys', coalesce((
          select jsonb_agg(jsonb_build_object(
              'exercise_id', e.id,
              'version', k.version,
              'answer_key', k.answer_key,
              'rubric', k.rubric,
              'known_wrong', k.known_wrong,
              'explanation', k.explanation,
              'display_answer', k.display_answer,
              'created_at', k.created_at
            ) order by e.id)
          from public.exercises e
          join content_private.exercise_keys k on k.exercise_id = e.id and k.version = e.version
          where e.lesson_id = l.id and e.status = 'published'
        ), '[]'::jsonb))
      order by l.id), '[]'::jsonb)
    into v_packs
  from public.lessons l
  where l.id = any (v_valid);

  return jsonb_build_object(
    'packs', v_packs,
    'missing', to_jsonb(array(select x from unnest(v_ids) as x where not (x = any (v_valid))))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- start_lesson with a client-minted run id
-- ---------------------------------------------------------------------------

drop function public.start_lesson(uuid, uuid);

-- Returns the run of this lesson on this path, or starts one.
--   * p_run_id is the id the client minted offline. A run with that id of the caller (any status) is returned
--     as is (a replayed start); the same id on another learner's run, lesson or path raises run_id_conflict.
--   * Else the open run of (learner, path, lesson) is returned even when its id differs from p_run_id: the client
--     remaps its queued entries to the returned id.
--   * Else a run is inserted with id = p_run_id (or a generated one) and started_at = p_client_at when that is
--     within the last 12 hours and not in the future, otherwise the server time.
create or replace function public.start_lesson(
  p_lesson_id uuid, p_path_id uuid, p_run_id uuid default null, p_client_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_lesson public.lessons;
  v_run public.lesson_runs;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  v_lesson := public.lesson_for_path(v_uid, p_lesson_id, p_path_id);

  if p_run_id is not null then
    select r.* into v_run from public.lesson_runs r where r.id = p_run_id;
    if found then
      if v_run.user_id <> v_uid or v_run.lesson_id <> v_lesson.id or v_run.learning_path_id <> p_path_id then
        raise exception using errcode = 'P0001', message = 'run_id_conflict';
      end if;
      if v_run.status = 'in_progress' and v_run.content_version <> v_lesson.content_version then
        v_run := public.lesson_run_sync(v_run.id, v_lesson.id, v_lesson.content_version);
      end if;
      return public.lesson_run_json(v_run.id, v_run.status, v_run.cursor, v_run.queue, v_run.next_review_at, v_run.summary_json);
    end if;
  end if;

  select r.* into v_run
  from public.lesson_runs r
  where r.user_id = v_uid and r.learning_path_id = p_path_id and r.lesson_id = v_lesson.id and r.status = 'in_progress';
  if found then
    if v_run.content_version <> v_lesson.content_version then
      v_run := public.lesson_run_sync(v_run.id, v_lesson.id, v_lesson.content_version);
    end if;
    return public.lesson_run_json(v_run.id, v_run.status, v_run.cursor, v_run.queue, v_run.next_review_at, v_run.summary_json);
  end if;

  insert into public.lesson_runs (id, user_id, learning_path_id, lesson_id, content_version, queue, started_at)
  values (
    coalesce(p_run_id, gen_random_uuid()), v_uid, p_path_id, v_lesson.id, v_lesson.content_version,
    coalesce((
      select array_agg(e.id order by array_position(array['recognition', 'recall', 'application']::text[], e.stage), e.order_index)
      from public.exercises e
      where e.lesson_id = v_lesson.id and e.status = 'published'
    ), '{}'::uuid[]),
    case when p_client_at is not null and p_client_at >= v_now - interval '12 hours' then least(p_client_at, v_now) else v_now end
  )
  returning * into v_run;
  return public.lesson_run_json(v_run.id, v_run.status, v_run.cursor, v_run.queue, v_run.next_review_at, v_run.summary_json);
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_lesson with a client time
-- ---------------------------------------------------------------------------

drop function public.complete_lesson(uuid);

-- Closes the run once every exercise is resolved and every re-check is answered; idempotent.
-- Identical to 20261014000330_reviews_grade.sql (items enrolled as review cards in the same transaction) except
-- for completed_at: p_client_at is used only when it is not before the run's latest stored attempt (client_at, else
-- created_at; the run start when there is none), not more than 12 hours old and not in the future. The summary's
-- completed_at is the same value. next_review_at keeps the server's learner-local "tomorrow".
create or replace function public.complete_lesson(p_run_id uuid, p_client_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_run public.lesson_runs;
  v_accuracy jsonb;
  v_almost integer;
  v_confident_wrong integer;
  v_unsure_right integer;
  v_tz text;
  v_next timestamptz;
  v_now timestamptz := now();
  v_last_at timestamptz;
  v_at timestamptz;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select r.* into v_run from public.lesson_runs r where r.id = p_run_id and r.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'run_not_found';
  end if;
  if v_run.status = 'completed' then
    return v_run.summary_json;
  end if;

  -- Only queue entries whose exercise is still published are required: an exercise archived after the run
  -- started can no longer be answered (submit_exercise refuses it) and must not keep the run open forever.
  if exists (
       select 1 from (select distinct q.e from unnest(v_run.queue) as q(e)) as d
       join public.exercises e on e.id = d.e and e.status = 'published'
       where not exists (
         select 1 from public.attempts a
         where a.lesson_run_id = v_run.id and a.exercise_id = d.e and (a.verdict <> 'incorrect' or a.revealed)
       )
     )
     or exists (
       select 1 from public.attempts a
       join public.exercises e on e.id = a.exercise_id and e.status = 'published'
       where a.lesson_run_id = v_run.id and a.verdict = 'incorrect' and a.revealed and not a.after_reveal
         and a.exercise_id = any (v_run.queue)
         and not exists (
           select 1 from public.attempts b
           where b.lesson_run_id = v_run.id and b.exercise_id = a.exercise_id and b.after_reveal
         )
     ) then
    raise exception using errcode = 'P0001', message = 'attempts_incomplete';
  end if;

  -- Accuracy over first attempts per stage (share of correct or almost; null when the stage has none).
  select jsonb_build_object(
      'recognition', round(avg(case when a.is_correct then 1 else 0 end) filter (where a.stage = 'recognition'), 4),
      'recall', round(avg(case when a.is_correct then 1 else 0 end) filter (where a.stage = 'recall'), 4),
      'application', round(avg(case when a.is_correct then 1 else 0 end) filter (where a.stage = 'application'), 4)
    )
    into v_accuracy
  from public.attempts a
  where a.lesson_run_id = v_run.id and a.attempt_no = 1;

  -- Signals count every attempt made before the answer was revealed.
  select count(*) filter (where a.verdict = 'almost'),
         count(*) filter (where a.confidence = 3 and a.verdict = 'incorrect'),
         count(*) filter (where a.confidence = 1 and a.is_correct)
    into v_almost, v_confident_wrong, v_unsure_right
  from public.attempts a
  where a.lesson_run_id = v_run.id and not a.after_reveal;

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_next := ((public.learning_user_today(v_uid) + 1)::timestamp) at time zone coalesce(v_tz, 'Asia/Ho_Chi_Minh');

  -- Conservative completion time (see the header).
  select max(coalesce(a.client_at, a.created_at)) into v_last_at from public.attempts a where a.lesson_run_id = v_run.id;
  v_at := case
    when p_client_at is not null
      and p_client_at >= coalesce(v_last_at, v_run.started_at)
      and p_client_at >= v_now - interval '12 hours'
      then least(p_client_at, v_now)
    else v_now
  end;

  v_summary := jsonb_build_object(
    'accuracy_by_stage', v_accuracy,
    'almost_count', v_almost,
    'confident_wrong', v_confident_wrong,
    'unsure_right', v_unsure_right,
    'next_review_at', v_next,
    'completed_at', v_at
  );

  update public.lesson_runs
  set status = 'completed', completed_at = v_at, next_review_at = v_next, summary_json = v_summary
  where id = v_run.id;
  perform public.srs_enroll_lesson(v_uid, v_run.learning_path_id, v_run.lesson_id);
  return v_summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.offline_lesson_public_json(uuid) from public, anon, authenticated;
revoke all on function public.offline_lesson_manifest(uuid) from public, anon;
revoke all on function public.offline_lesson_packs(uuid, uuid[]) from public, anon;
revoke all on function public.start_lesson(uuid, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.complete_lesson(uuid, timestamptz) from public, anon;
grant execute on function public.offline_lesson_manifest(uuid) to authenticated;
grant execute on function public.offline_lesson_packs(uuid, uuid[]) to authenticated;
grant execute on function public.start_lesson(uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.complete_lesson(uuid, timestamptz) to authenticated;
