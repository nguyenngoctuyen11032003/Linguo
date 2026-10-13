-- Linguo spec 3 §2, §4: card enrolment, grading and mastery.
-- Cards are created by complete_lesson (srs_enroll_lesson) and graded only through grade_review; FSRS
-- math lives in 20261014000310_reviews_fsrs.sql (srs_next, srs_adjust_rating). Clients read cards, logs
-- and mastery through RLS (20261014000300_reviews.sql) and never write them directly.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Creates the review cards of a completed lesson: both directions of every published item the lesson
-- introduces (reused items are not enrolled again), state new, due at the start of the learner's next local
-- day — the lesson summary's next_review_at. Existing cards are left untouched. Returns the cards created.
create or replace function public.srs_enroll_lesson(p_user uuid, p_path uuid, p_lesson uuid)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_tz text;
  v_due timestamptz;
  v_n integer;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_user;
  v_due := ((public.learning_user_today(p_user) + 1)::timestamp) at time zone coalesce(v_tz, 'Asia/Ho_Chi_Minh');

  insert into public.review_cards (
    user_id, learning_path_id, learning_item_id, direction, fsrs_state, step, reps, lapses, scheduled_days,
    due_at, postpone_count
  )
  select p_user, p_path, li.item_id, d.direction, 'new', 0, 0, 0, 0, v_due, 0
  from public.lesson_items li
  join public.learning_items i on i.id = li.item_id and i.status = 'published'
  cross join (values (1, 'recognize'), (2, 'recall')) as d(ord, direction)
  where li.lesson_id = p_lesson and li.role = 'introduce'
  order by li.position, d.ord
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Recomputes the mastery of one item (spec §2) and returns true when it has just become mastered.
-- Only grades after the item's latest Again (any direction) count, so an Again drops mastered_at and the
-- item has to earn it again. Mastered = at least mastery_min_successes successes (effective rating >= 3,
-- no hint) on at least mastery_min_days distinct local days, at least one of them in the recall direction,
-- recall card stability >= mastery_min_recall_stability days, and the latest success not low-confidence.
-- Thresholds come from srs_config.mastery_* (spec defaults 3/3/21 if the row is missing).
create or replace function public.srs_update_mastery(p_user uuid, p_path uuid, p_item uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_min_successes integer;
  v_min_days integer;
  v_min_stability double precision;
  v_last_again timestamptz;
  v_successes integer;
  v_days integer;
  v_has_recall boolean;
  v_last_confidence smallint;
  v_recall_stability double precision;
  v_ok boolean;
  v_prev timestamptz;
  v_found boolean;
  v_new timestamptz;
begin
  select c.mastery_min_successes, c.mastery_min_days, c.mastery_min_recall_stability
    into v_min_successes, v_min_days, v_min_stability
  from public.srs_config c;
  v_min_successes := coalesce(v_min_successes, 3);
  v_min_days := coalesce(v_min_days, 3);
  v_min_stability := coalesce(v_min_stability, 21);

  select max(l.created_at) into v_last_again
  from public.review_logs l
  join public.review_cards c on c.id = l.card_id
  where l.user_id = p_user and l.learning_path_id = p_path and c.learning_item_id = p_item
    and l.kind = 'grade' and l.rating_effective = 1;

  select count(*)::integer, count(distinct l.local_day)::integer, coalesce(bool_or(c.direction = 'recall'), false)
    into v_successes, v_days, v_has_recall
  from public.review_logs l
  join public.review_cards c on c.id = l.card_id
  where l.user_id = p_user and l.learning_path_id = p_path and c.learning_item_id = p_item
    and l.kind = 'grade' and l.rating_effective >= 3 and coalesce(l.hint_count, 0) = 0
    and (v_last_again is null or l.created_at > v_last_again);

  select l.confidence into v_last_confidence
  from public.review_logs l
  join public.review_cards c on c.id = l.card_id
  where l.user_id = p_user and l.learning_path_id = p_path and c.learning_item_id = p_item
    and l.kind = 'grade' and l.rating_effective >= 3 and coalesce(l.hint_count, 0) = 0
    and (v_last_again is null or l.created_at > v_last_again)
  order by l.created_at desc, l.local_day desc
  limit 1;

  select c.stability into v_recall_stability
  from public.review_cards c
  where c.user_id = p_user and c.learning_path_id = p_path and c.learning_item_id = p_item and c.direction = 'recall';

  v_ok := v_successes >= v_min_successes
    and v_days >= v_min_days
    and v_has_recall
    and coalesce(v_recall_stability, 0) >= v_min_stability
    and v_last_confidence is distinct from 1;

  select m.mastered_at, true into v_prev, v_found
  from public.review_item_mastery m
  where m.user_id = p_user and m.learning_path_id = p_path and m.learning_item_id = p_item
  for update;

  v_new := case when v_ok then coalesce(v_prev, now()) end;
  if v_found then
    if v_new is distinct from v_prev then
      update public.review_item_mastery
      set mastered_at = v_new, updated_at = now()
      where user_id = p_user and learning_path_id = p_path and learning_item_id = p_item;
    end if;
  else
    insert into public.review_item_mastery (user_id, learning_path_id, learning_item_id, mastered_at, updated_at)
    values (p_user, p_path, p_item, v_new, now())
    on conflict (user_id, learning_path_id, learning_item_id)
    do update set mastered_at = excluded.mastered_at, updated_at = excluded.updated_at;
  end if;

  return v_prev is null and v_new is not null;
end;
$$;

-- Snapshot of a card's scheduling state, stored in review_logs.state_before/state_after.
create or replace function public.srs_card_state_json(
  p_state text, p_step smallint, p_stability double precision, p_difficulty double precision, p_reps integer,
  p_lapses integer, p_scheduled_days integer, p_due_at timestamptz, p_last_review_at timestamptz
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'state', p_state,
    'step', p_step,
    'stability', p_stability,
    'difficulty', p_difficulty,
    'reps', p_reps,
    'lapses', p_lapses,
    'scheduled_days', p_scheduled_days,
    'due_at', p_due_at,
    'last_review_at', p_last_review_at
  );
$$;

-- ---------------------------------------------------------------------------
-- grade_review (public)
-- ---------------------------------------------------------------------------

-- Grades one card at the server's now() (p_client_at is only stored). Returns reviewGradeResultSchema.
create or replace function public.grade_review(
  p_card_id uuid, p_rating smallint, p_confidence smallint, p_response_ms integer, p_hint_count smallint,
  p_idempotency_key uuid, p_client_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_hint smallint := greatest(0, coalesce(p_hint_count, 0))::smallint;
  v_response_ms integer := greatest(0, least(600000, coalesce(p_response_ms, 0)));
  v_hash text;
  v_prev public.review_logs;
  v_card public.review_cards;
  v_tz text;
  v_today date;
  v_effective smallint;
  v_next jsonb;
  v_due timestamptz;
  v_lapse boolean;
  v_before jsonb;
  v_after jsonb;
  v_log_id uuid := gen_random_uuid();
  v_newly boolean;
  v_mastered_at timestamptz;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_rating is null or p_rating not between 1 and 4
     or (p_confidence is not null and p_confidence not between 1 and 3)
     or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_rating';
  end if;

  -- Replays return the stored result; the same key with another payload is a conflict.
  v_hash := md5(concat_ws('|',
    coalesce(p_card_id::text, ''), p_rating::text, coalesce(p_confidence::text, ''),
    v_hint::text, v_response_ms::text));
  select l.* into v_prev from public.review_logs l where l.user_id = v_uid and l.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.kind = 'grade' and v_prev.payload_hash = v_hash then
      return v_prev.result || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  select c.* into v_card from public.review_cards c where c.id = p_card_id and c.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'card_not_found';
  end if;
  if v_card.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'card_suspended';
  end if;

  -- Counted per user after the card lock, so that concurrent grades of one card are counted in turn.
  if (select count(*) from public.review_logs l
      where l.user_id = v_uid and l.kind = 'grade' and l.created_at > v_now - interval '60 seconds') >= 60 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_today := public.learning_user_today(v_uid);

  v_effective := public.srs_adjust_rating(p_rating, p_confidence, v_hint);
  v_next := public.srs_next(
    v_card.fsrs_state, v_card.step, v_card.stability, v_card.difficulty, v_card.last_review_at,
    v_effective, v_now, v_tz);
  v_due := (v_next ->> 'due_at')::timestamptz;
  v_lapse := coalesce((v_next ->> 'lapse')::boolean, false);

  v_before := public.srs_card_state_json(
    v_card.fsrs_state, v_card.step, v_card.stability, v_card.difficulty, v_card.reps, v_card.lapses,
    v_card.scheduled_days, v_card.due_at, v_card.last_review_at);

  update public.review_cards
  set fsrs_state = v_next ->> 'state',
      step = (v_next ->> 'step')::smallint,
      stability = (v_next ->> 'stability')::double precision,
      difficulty = (v_next ->> 'difficulty')::double precision,
      scheduled_days = (v_next ->> 'scheduled_days')::integer,
      due_at = v_due,
      last_review_at = v_now,
      reps = reps + 1,
      lapses = lapses + case when v_lapse then 1 else 0 end,
      -- A grade ends a run of consecutive postponements.
      postpone_count = 0,
      updated_at = v_now
  where id = v_card.id
  returning * into v_card;

  v_after := public.srs_card_state_json(
    v_card.fsrs_state, v_card.step, v_card.stability, v_card.difficulty, v_card.reps, v_card.lapses,
    v_card.scheduled_days, v_card.due_at, v_card.last_review_at);

  begin
    insert into public.review_logs (
      id, user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, confidence, response_ms, hint_count,
      state_before, state_after, local_day, idempotency_key, payload_hash, result, client_at, created_at
    ) values (
      v_log_id, v_uid, v_card.learning_path_id, v_card.id, 'grade', p_rating, v_effective, p_confidence, v_response_ms, v_hint,
      v_before, v_after, v_today, p_idempotency_key, v_hash, '{}'::jsonb, p_client_at, v_now
    );
  exception when unique_violation then
    -- A concurrent call with the same key won the race (it held the card lock first).
    select l.* into v_prev from public.review_logs l where l.user_id = v_uid and l.idempotency_key = p_idempotency_key;
    if found and v_prev.kind = 'grade' and v_prev.payload_hash = v_hash then
      return v_prev.result || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end;

  v_newly := public.srs_update_mastery(v_uid, v_card.learning_path_id, v_card.learning_item_id);
  select m.mastered_at into v_mastered_at
  from public.review_item_mastery m
  where m.user_id = v_uid and m.learning_path_id = v_card.learning_path_id and m.learning_item_id = v_card.learning_item_id;

  v_result := jsonb_build_object(
    'card_id', v_card.id,
    'log_id', v_log_id,
    'state', v_card.fsrs_state,
    'due_at', v_card.due_at,
    'interval_minutes', (v_next ->> 'interval_minutes')::integer,
    'rating_effective', v_effective,
    'item_status', case when v_mastered_at is not null then 'mastered' else v_card.fsrs_state end,
    'newly_mastered', v_newly,
    'replayed', false
  );
  update public.review_logs set result = v_result where id = v_log_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_lesson (spec 2) now enrols the lesson's items in the same transaction
-- ---------------------------------------------------------------------------

-- Closes the run once every exercise is resolved and every re-check is answered; idempotent.
-- Spec 3: identical to 20261014000200_lesson_runs.sql except that the lesson's introduced items are
-- enrolled as review cards (srs_enroll_lesson) in the same transaction.
create or replace function public.complete_lesson(p_run_id uuid)
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

  v_summary := jsonb_build_object(
    'accuracy_by_stage', v_accuracy,
    'almost_count', v_almost,
    'confident_wrong', v_confident_wrong,
    'unsure_right', v_unsure_right,
    'next_review_at', v_next,
    'completed_at', v_now
  );

  update public.lesson_runs
  set status = 'completed', completed_at = v_now, next_review_at = v_next, summary_json = v_summary
  where id = v_run.id;
  perform public.srs_enroll_lesson(v_uid, v_run.learning_path_id, v_run.lesson_id);
  return v_summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: grade_review and complete_lesson are the only client entry points here.
-- ---------------------------------------------------------------------------
revoke all on function public.srs_enroll_lesson(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.srs_update_mastery(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.srs_card_state_json(text, smallint, double precision, double precision, integer, integer, integer, timestamptz, timestamptz) from public, anon, authenticated;

revoke all on function public.grade_review(uuid, smallint, smallint, integer, smallint, uuid, timestamptz) from public, anon;
revoke all on function public.complete_lesson(uuid) from public, anon;
grant execute on function public.grade_review(uuid, smallint, smallint, integer, smallint, uuid, timestamptz) to authenticated;
grant execute on function public.complete_lesson(uuid) to authenticated;
