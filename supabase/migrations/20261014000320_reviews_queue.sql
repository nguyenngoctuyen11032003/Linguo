-- Linguo spec 3 §4: the daily review queue, postponing and the review summary.
-- Reads the tables of 20261014000300_reviews.sql and calls the FSRS helpers of 20261014000310_reviews_fsrs.sql
-- (srs_retrievability, srs_previews). JSON shapes match packages/shared/src/review/rpc.ts.
--
-- Day model (spec §2): "today" is public.learning_user_today(user), i.e. the local date in profiles.timezone;
-- the local day runs from local midnight to the next local midnight. A card is due today when:
--   * learning/relearning: due_at <= now (minute steps are not snapped, so they wait for their minute);
--   * review: due_at < end of the local day;
--   * new: due_at < end of the local day (enrolment sets it to the start of the next local day).
-- Suspended cards and cards whose item is no longer published are never served or counted.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Owned path check shared by the RPCs: path_not_found for a missing or foreign path, path_not_active when
-- p_require_active and the path is not active. Returns the path row.
create or replace function public.review_path_for_user(p_user uuid, p_path_id uuid, p_require_active boolean)
returns public.learning_paths
language plpgsql
stable
set search_path = ''
as $$
declare
  v_path public.learning_paths;
begin
  select p.* into v_path from public.learning_paths p where p.id = p_path_id and p.user_id = p_user;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  if p_require_active and v_path.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'path_not_active';
  end if;
  return v_path;
end;
$$;

-- Daily figures for one path at p_now (spec §4 get_review_queue):
--   base_cap        = clamp(weekly_minutes[local ISO weekday] x cap_per_minute, cap_min, cap_max)
--   daily_cap       = base_cap (+ 10 when p_extra)
--   reviewed_today  = grade logs of the path on the local day
--   due_total       = items with a non-new card due today (see the header); one per item, because
--                     get_review_queue serves at most one direction per item
--   recovery_mode   = non-new cards due today (every direction) > recovery_factor x base_cap
--   new_quota       = daily_new_limit - new cards first graded today (0 in recovery mode)
--   new_eligible    = items whose only cards due today are new (one per item, as served)
--   new_available   = least(new_quota, new_eligible)
-- plus the local day bounds used by the callers.
-- Scalar arguments (not a learning_paths row) so that PostgREST and the type generator do not expose it as a
-- computed column of learning_paths.
create or replace function public.review_day_totals(
  p_user uuid, p_path_id uuid, p_weekly_minutes smallint[], p_extra boolean, p_now timestamptz
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cfg public.srs_config;
  v_tz text;
  v_today date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_base_cap integer;
  v_cap integer;
  v_reviewed integer;
  v_due integer;
  v_due_cards integer;
  v_new_eligible integer;
  v_new_started integer;
  v_recovery boolean;
  v_new_quota integer;
begin
  select c.* into v_cfg from public.srs_config c where c.id;
  select coalesce(p.timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.profiles p where p.id = p_user;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_today := (p_now at time zone v_tz)::date;
  v_day_start := v_today::timestamp at time zone v_tz;
  v_day_end := (v_today + 1)::timestamp at time zone v_tz;

  -- weekly_minutes runs Monday -> Sunday, matching the ISO weekday of the local date.
  v_base_cap := greatest(v_cfg.cap_min::integer, least(v_cfg.cap_max::integer,
    floor(coalesce(p_weekly_minutes[extract(isodow from v_today)::integer], 0) * v_cfg.cap_per_minute)::integer));
  v_cap := v_base_cap + case when coalesce(p_extra, false) then 10 else 0 end;

  select count(*)::integer into v_reviewed
  from public.review_logs l
  where l.user_id = p_user and l.learning_path_id = p_path_id and l.kind = 'grade' and l.local_day = v_today;

  -- Per item, like get_review_queue: an item with any non-new card due counts once in due_total (its other
  -- direction waits), an item with only new cards due counts once in new_eligible. v_due_cards keeps the
  -- per-card backlog for the recovery threshold.
  select count(*) filter (where not s.only_new)::integer,
         count(*) filter (where s.only_new)::integer,
         coalesce(sum(s.due_cards), 0)::integer
    into v_due, v_new_eligible, v_due_cards
  from (
    select c.learning_item_id,
           bool_and(c.fsrs_state = 'new') as only_new,
           count(*) filter (where c.fsrs_state <> 'new') as due_cards
    from public.review_cards c
    join public.learning_items i on i.id = c.learning_item_id and i.status = 'published'
    where c.user_id = p_user and c.learning_path_id = p_path_id and c.suspended_at is null
      and (
        (c.fsrs_state in ('learning', 'relearning') and c.due_at <= p_now)
        or (c.fsrs_state in ('review', 'new') and c.due_at < v_day_end)
      )
    group by c.learning_item_id
  ) as s;

  -- A new card "started" today when its first grade falls on the local day (independent of the shape of
  -- review_logs.state_before).
  select count(*)::integer into v_new_started
  from (
    select l.card_id
    from public.review_logs l
    where l.user_id = p_user and l.learning_path_id = p_path_id and l.kind = 'grade'
    group by l.card_id
    having min(l.local_day) = v_today
  ) as s;

  v_recovery := v_due_cards > v_cfg.recovery_factor * v_base_cap;
  v_new_quota := case when v_recovery then 0 else greatest(0, v_cfg.daily_new_limit::integer - v_new_started) end;

  return jsonb_build_object(
    'tz', v_tz,
    'today', v_today,
    'day_start', v_day_start,
    'day_end', v_day_end,
    'base_cap', v_base_cap,
    'daily_cap', v_cap,
    'reviewed_today', v_reviewed,
    'remaining_cap', greatest(0, v_cap - v_reviewed),
    'due_total', v_due,
    'recovery_mode', v_recovery,
    'new_quota', v_new_quota,
    'new_eligible', v_new_eligible,
    'new_available', least(v_new_quota, v_new_eligible)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_review_queue
-- ---------------------------------------------------------------------------

-- Next cards to review for the caller's active path (spec §4). Order: learning/relearning due now (by due_at),
-- then review cards due before the end of the local day by retrievability ascending (then card id), then new
-- cards in enrolment order (lesson item position, recognize before recall). Each item appears in at most one
-- direction per call (its highest-priority card). New cards are limited by new_quota and everything by
-- least(p_limit, daily_cap - reviewed_today). Every card carries server-computed previews.
create or replace function public.get_review_queue(p_path_id uuid, p_limit integer default 20, p_extra boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_now timestamptz := now();
  v_totals jsonb;
  v_tz text;
  v_day_end timestamptz;
  v_take integer;
  v_cards jsonb;
  v_served integer;
  v_served_due integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_path := public.review_path_for_user(v_uid, p_path_id, true);
  v_totals := public.review_day_totals(v_uid, v_path.id, v_path.weekly_minutes, p_extra, v_now);
  v_tz := v_totals ->> 'tz';
  v_day_end := (v_totals ->> 'day_end')::timestamptz;
  v_take := least(greatest(1, least(coalesce(p_limit, 20), 100)), (v_totals ->> 'remaining_cap')::integer);

  with candidates as (
    select c.*,
           case when c.fsrs_state in ('learning', 'relearning') then 1 when c.fsrs_state = 'review' then 2 else 3 end as grp,
           case when c.fsrs_state = 'review' then
             public.srs_retrievability(c.stability, greatest(0, extract(epoch from (v_now - coalesce(c.last_review_at, v_now))) / 86400.0))
           end as retr,
           (select min(li.position) from public.lesson_items li where li.item_id = c.learning_item_id and li.role = 'introduce') as item_pos
    from public.review_cards c
    join public.learning_items i on i.id = c.learning_item_id and i.status = 'published'
    where c.user_id = v_uid and c.learning_path_id = v_path.id and c.suspended_at is null
      and (
        (c.fsrs_state in ('learning', 'relearning') and c.due_at <= v_now)
        or (c.fsrs_state in ('review', 'new') and c.due_at < v_day_end)
      )
  ),
  ranked as (
    select cd.*,
           row_number() over (
             order by cd.grp,
               case when cd.grp = 1 then cd.due_at end,
               cd.retr,
               case when cd.grp = 3 then cd.created_at end,
               cd.item_pos nulls last,
               case when cd.grp = 3 then case cd.direction when 'recognize' then 0 else 1 end end,
               cd.id
           ) as ord
    from candidates cd
  ),
  one_per_item as (
    select r.*, row_number() over (partition by r.learning_item_id order by r.ord) as item_rn
    from ranked r
  ),
  limited_new as (
    select o.*, case when o.grp = 3 then row_number() over (partition by (o.grp = 3) order by o.ord) end as new_rn
    from one_per_item o
    where o.item_rn = 1
  ),
  picked as (
    select ln.*
    from limited_new ln
    where ln.grp < 3 or ln.new_rn <= (v_totals ->> 'new_quota')::integer
    order by ln.ord
    limit v_take
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'card_id', pk.id,
             'item_id', pk.learning_item_id,
             'direction', pk.direction,
             'state', pk.fsrs_state,
             'is_new', pk.fsrs_state = 'new',
             'due_at', pk.due_at,
             'postpone_count', coalesce(pk.postpone_count, 0),
             'item', jsonb_build_object(
               'language_code', i.language_code,
               'item_type', i.item_type,
               'front', i.front,
               'back', i.back,
               'audio_path', i.audio_path
             ),
             'previews', public.srs_previews(pk.fsrs_state, pk.step, pk.stability, pk.difficulty, pk.last_review_at, v_now, v_tz)
           ) order by pk.ord), '[]'::jsonb),
         count(*)::integer,
         (count(*) filter (where pk.grp < 3))::integer
    into v_cards, v_served, v_served_due
  from picked pk
  join public.learning_items i on i.id = pk.learning_item_id;

  return jsonb_build_object(
    'cards', v_cards,
    'totals', jsonb_build_object(
      'due_total', (v_totals ->> 'due_total')::integer,
      'served', v_served,
      'backlog_remaining', greatest(0, (v_totals ->> 'due_total')::integer - v_served_due),
      'new_available', (v_totals ->> 'new_available')::integer,
      'daily_cap', (v_totals ->> 'daily_cap')::integer,
      'reviewed_today', (v_totals ->> 'reviewed_today')::integer,
      'recovery_mode', (v_totals ->> 'recovery_mode')::boolean
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- postpone_reviews
-- ---------------------------------------------------------------------------

-- Moves due cards to the start of the next local day, keeping S and D (spec §4). p_card_ids null = every
-- non-new card of the path due today. A card is skipped (counted in `skipped`) when it was already postponed
-- today, has been postponed twice in a row without a grade in between (postpone_count >= 2; grade_review
-- resets the count), is suspended, or is not due today. Unknown or foreign card ids -> card_not_found.
--
-- Every call writes ONE review_logs row (kind 'postpone', card_id null) keyed by p_idempotency_key, with
-- state_before/state_after = arrays of {card_id, due_at, postpone_count, last_postponed_on} for the postponed
-- cards and result = the RPC result. A replay with the same key and payload returns that result
-- (replayed = true); the same key with another payload (or a grade's key) -> idempotency_conflict.
create or replace function public.postpone_reviews(p_path_id uuid, p_card_ids uuid[], p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_path public.learning_paths;
  v_now timestamptz := now();
  v_tz text;
  v_today date;
  v_day_end timestamptz;
  v_hash text;
  v_prev public.review_logs;
  v_ids uuid[];
  v_card public.review_cards;
  v_postponed uuid[] := '{}'::uuid[];
  v_before jsonb := '[]'::jsonb;
  v_after jsonb;
  v_skipped integer := 0;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  -- Serialises the caller's review writes (same convention as start_lesson).
  perform 1 from public.profiles where id = v_uid for update;

  select array_agg(distinct x order by x) into v_ids from unnest(p_card_ids) as x where x is not null;
  v_hash := md5(concat_ws('|', 'postpone', coalesce(p_path_id::text, ''),
    case when p_card_ids is null then 'all' else coalesce(array_to_string(v_ids, ','), '') end));

  select l.* into v_prev from public.review_logs l where l.user_id = v_uid and l.idempotency_key = v_key;
  if found then
    if v_prev.kind = 'postpone' and v_prev.payload_hash = v_hash then
      return (v_prev.result - 'replayed') || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  v_path := public.review_path_for_user(v_uid, p_path_id, true);
  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_today := (v_now at time zone v_tz)::date;
  v_day_end := (v_today + 1)::timestamp at time zone v_tz;

  if p_card_ids is null then
    select coalesce(array_agg(c.id order by c.id), '{}') into v_ids
    from public.review_cards c
    join public.learning_items i on i.id = c.learning_item_id and i.status = 'published'
    where c.user_id = v_uid and c.learning_path_id = v_path.id and c.suspended_at is null
      and c.fsrs_state <> 'new' and c.due_at < v_day_end;
  else
    v_ids := coalesce(v_ids, '{}');
    if exists (
      select 1 from unnest(v_ids) as x
      where not exists (
        select 1 from public.review_cards c where c.id = x and c.user_id = v_uid and c.learning_path_id = v_path.id
      )
    ) then
      raise exception using errcode = 'P0001', message = 'card_not_found';
    end if;
  end if;

  for v_card in
    select c.* from public.review_cards c where c.id = any (v_ids) order by c.id for update
  loop
    if v_card.suspended_at is not null
       or v_card.due_at >= v_day_end
       or v_card.last_postponed_on = v_today
       or v_card.postpone_count >= 2 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_postponed := array_append(v_postponed, v_card.id);
    v_before := v_before || jsonb_build_array(jsonb_build_object(
      'card_id', v_card.id, 'due_at', v_card.due_at, 'postpone_count', v_card.postpone_count,
      'last_postponed_on', v_card.last_postponed_on));
  end loop;

  update public.review_cards c
  set due_at = v_day_end,
      postpone_count = c.postpone_count + 1,
      last_postponed_on = v_today
  where c.id = any (v_postponed);

  select coalesce(jsonb_agg(jsonb_build_object(
           'card_id', c.id, 'due_at', c.due_at, 'postpone_count', c.postpone_count,
           'last_postponed_on', c.last_postponed_on) order by c.id), '[]'::jsonb)
    into v_after
  from public.review_cards c
  where c.id = any (v_postponed);

  v_result := jsonb_build_object('postponed', cardinality(v_postponed), 'skipped', v_skipped, 'replayed', false);

  begin
    insert into public.review_logs (
      user_id, learning_path_id, card_id, kind, state_before, state_after, local_day,
      idempotency_key, payload_hash, result, created_at
    ) values (
      v_uid, v_path.id, null, 'postpone', v_before, v_after, v_today, v_key, v_hash, v_result, v_now
    );
  exception when unique_violation then
    -- Cannot normally happen under the profile lock; handled like a concurrent call with the same key.
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- review_summary
-- ---------------------------------------------------------------------------

-- reviewSummarySchema for one of the caller's paths (any status). Definitions:
--   remaining_today    = least(daily_cap - reviewed_today, due_total + new_available), floored at 0; both terms
--                        count one card per item, i.e. what a get_review_queue session started now serves
--   forecast           = 7 local days from today; today counts every non-new card due before the end of the
--                        local day (overdue included), later days the non-new cards due within that day
--   retention_30d      = share of Good/Easy (rating_effective >= 3) among grades in the last 30 days whose
--                        previous grade of the same card was >= 7 days earlier (first try of a review card
--                        with an interval of at least a week); null when fewer than 20 such grades
--   mastered_this_week = mastered items whose mastered_at is on or after the local Monday of this week
create or replace function public.review_summary(p_path_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_now timestamptz := now();
  v_totals jsonb;
  v_tz text;
  v_today date;
  v_forecast jsonb;
  v_sample integer;
  v_success integer;
  v_mastered integer;
  v_mastered_week integer;
  v_week_start timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_path := public.review_path_for_user(v_uid, p_path_id, false);
  v_totals := public.review_day_totals(v_uid, v_path.id, v_path.weekly_minutes, false, v_now);
  v_tz := v_totals ->> 'tz';
  v_today := (v_totals ->> 'today')::date;

  select jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'count', (
           select count(*)::integer
           from public.review_cards c
           join public.learning_items i on i.id = c.learning_item_id and i.status = 'published'
           where c.user_id = v_uid and c.learning_path_id = v_path.id and c.suspended_at is null and c.fsrs_state <> 'new'
             and c.due_at < (d.day + 1)::timestamp at time zone v_tz
             and (d.day = v_today or c.due_at >= d.day::timestamp at time zone v_tz)
         )) order by d.day)
    into v_forecast
  from (select (v_today + g)::date as day from generate_series(0, 6) as g) as d;

  select count(*)::integer, (count(*) filter (where s.rating_effective >= 3))::integer
    into v_sample, v_success
  from (
    select l.rating_effective, l.created_at,
           lag(l.created_at) over (partition by l.card_id order by l.created_at, l.id) as prev_at
    from public.review_logs l
    where l.user_id = v_uid and l.learning_path_id = v_path.id and l.kind = 'grade'
  ) as s
  where s.created_at >= v_now - interval '30 days'
    and s.prev_at is not null and s.created_at - s.prev_at >= interval '7 days';

  v_week_start := (v_today - (extract(isodow from v_today)::integer - 1))::timestamp at time zone v_tz;
  select count(*) filter (where m.mastered_at is not null)::integer,
         count(*) filter (where m.mastered_at >= v_week_start)::integer
    into v_mastered, v_mastered_week
  from public.review_item_mastery m
  where m.user_id = v_uid and m.learning_path_id = v_path.id;

  return jsonb_build_object(
    'reviewed_today', (v_totals ->> 'reviewed_today')::integer,
    'remaining_today', least(
      (v_totals ->> 'remaining_cap')::integer,
      (v_totals ->> 'due_total')::integer + (v_totals ->> 'new_available')::integer),
    'forecast', v_forecast,
    'retention_30d', case when v_sample >= 20 then round(v_success::numeric / v_sample, 4) end,
    'retention_sample', v_sample,
    'mastered_total', v_mastered,
    'mastered_this_week', v_mastered_week,
    'recovery_mode', (v_totals ->> 'recovery_mode')::boolean
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.review_path_for_user(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.review_day_totals(uuid, uuid, smallint[], boolean, timestamptz) from public, anon, authenticated;

revoke all on function public.get_review_queue(uuid, integer, boolean) from public, anon;
revoke all on function public.postpone_reviews(uuid, uuid[], uuid) from public, anon;
revoke all on function public.review_summary(uuid) from public, anon;
grant execute on function public.get_review_queue(uuid, integer, boolean) to authenticated;
grant execute on function public.postpone_reviews(uuid, uuid[], uuid) to authenticated;
grant execute on function public.review_summary(uuid) to authenticated;
