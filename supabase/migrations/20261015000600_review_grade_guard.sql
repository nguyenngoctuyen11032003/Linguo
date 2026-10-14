-- Linguo: grade_review enforces the review queue's rules (security fix).
-- Until now grade_review (20261014000330_reviews_grade.sql) only checked that the card exists, is owned and
-- is not suspended, so a client could grade the same card repeatedly on one day (e.g. Easy x3 drives stability
-- from ~8 to ~31 days and can mark an item mastered without spaced recall), or grade cards of paused/archived
-- paths and of unpublished items, inflating mastery, badges, XP and streaks.
-- grade_review now applies the same filters as get_review_queue (20261014000320_reviews_queue.sql):
--   * the card's path must be active (path_not_active, via review_path_for_user);
--   * the card's item must be published (card_not_found: the queue never serves it);
--   * the card must be due: learning/relearning when due_at <= now, review/new when due_at is before the end
--     of the learner's local day (card_not_due).
-- Idempotent replays are answered before any of these checks, so a grade that was already applied still
-- replays after the card moved on. Otherwise identical to 20261014000330_reviews_grade.sql.

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
  -- Same filters as get_review_queue (20261014000320_reviews_queue.sql): only cards of an active path whose
  -- item is still published (the queue never serves the others, so they are treated as missing) ...
  perform public.review_path_for_user(v_uid, v_card.learning_path_id, true);
  if not exists (select 1 from public.learning_items i where i.id = v_card.learning_item_id and i.status = 'published') then
    raise exception using errcode = 'P0001', message = 'card_not_found';
  end if;

  -- Counted per user after the card lock, so that concurrent grades of one card are counted in turn.
  if (select count(*) from public.review_logs l
      where l.user_id = v_uid and l.kind = 'grade' and l.created_at > v_now - interval '60 seconds') >= 60 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_today := public.learning_user_today(v_uid);

  -- ... and only when the card is due under the queue's day model: learning/relearning at due_at <= now,
  -- review/new before the end of the local day. Grading a card again before it is due would let a learner
  -- inflate stability (and mastery, badges, streaks) without spaced recall.
  if not (
    (v_card.fsrs_state in ('learning', 'relearning') and v_card.due_at <= v_now)
    or (v_card.fsrs_state in ('review', 'new') and v_card.due_at < (v_today + 1)::timestamp at time zone v_tz)
  ) then
    raise exception using errcode = 'P0001', message = 'card_not_due';
  end if;

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

revoke all on function public.grade_review(uuid, smallint, smallint, integer, smallint, uuid, timestamptz) from public, anon;
grant execute on function public.grade_review(uuid, smallint, smallint, integer, smallint, uuid, timestamptz) to authenticated;
