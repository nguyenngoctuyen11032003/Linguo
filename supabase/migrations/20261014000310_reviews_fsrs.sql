-- Linguo spec 3 §2/§4: FSRS-6 scheduling in plpgsql.
-- A port of ts-fsrs 5.x `FSRS.next` (BasicScheduler, enable_short_term = true, enable_fuzz = false) with the
-- learning/relearning steps and parameters read from public.srs_config. Parity with ts-fsrs is checked by the
-- generated supabase/tests/review_fsrs.test.sql (fixtures in UTC); day snapping, rating adjustment and previews
-- by supabase/tests/reviews_fsrs_snap.test.sql.
--
-- Deliberate differences from ts-fsrs, both invisible in UTC:
--   * elapsed days = difference of local calendar dates in p_tz (ts-fsrs uses UTC calendar dates);
--   * intervals of >= 1 day are due at the start of the local day (p_tz) instead of now + N * 24 h.
--     interval_minutes stays the nominal interval (scheduled_days * 1440, or the step minutes) so previews
--     read "1 day", "3 days" and so on.
-- JS Math.round is round-half-up; Postgres round(float8) is round-half-even, so every rounding below is
-- floor(x + 0.5). Intermediate values are rounded to 8 decimals exactly where ts-fsrs does (roundTo(x, 8)).
-- Arrays are 1-based: ts-fsrs w[i] is p_w[i + 1] here.

-- ---------------------------------------------------------------------------
-- Pure helpers (internal)
-- ---------------------------------------------------------------------------

-- ts-fsrs roundTo(x, 8).
create or replace function public.srs_round8(p_x double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select floor(p_x * 100000000::double precision + 0.5::double precision) / 100000000::double precision;
$$;

-- ts-fsrs clipParameters (enable_short_term = true): clamp each weight into its range; with more than one
-- relearning step w17/w18 get a lower ceiling.
create or replace function public.srs_clip_weights(p_w double precision[], p_num_relearning_steps integer)
returns double precision[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_lo constant double precision[] := array[0.001, 0.001, 0.001, 0.001, 1, 0.001, 0.001, 0.001, 0, 0, 0.001, 0.001, 0.001, 0.001, 0, 0, 1, 0, 0, 0.01, 0.1];
  v_hi double precision[] := array[100, 100, 100, 100, 10, 4, 4, 0.75, 4.5, 0.8, 3.5, 5, 0.25, 0.9, 4, 1, 6, 2, 2, 0.8, 0.8];
  v_out double precision[] := '{}'::double precision[];
  v_w11 double precision;
  v_w13 double precision;
  v_w14 double precision;
  v_value double precision;
  v_ceiling double precision;
begin
  if p_w is null or cardinality(p_w) <> 21 then
    raise exception 'invalid_srs_weights';
  end if;
  if coalesce(p_num_relearning_steps, 0) > 1 then
    v_w11 := least(greatest(coalesce(p_w[12], 0), v_lo[12]), v_hi[12]);
    v_w13 := least(greatest(coalesce(p_w[14], 0), v_lo[14]), v_hi[14]);
    v_w14 := least(greatest(coalesce(p_w[15], 0), v_lo[15]), v_hi[15]);
    v_value := -(ln(v_w11) + ln(power(2::double precision, v_w13) - 1) + v_w14 * 0.3::double precision) / p_num_relearning_steps;
    v_ceiling := least(greatest(public.srs_round8(sqrt(greatest(v_value, 0))), 0.01::double precision), 2::double precision);
    v_hi[18] := v_ceiling;
    v_hi[19] := v_ceiling;
  end if;
  for i in 1..21 loop
    v_out := v_out || least(greatest(coalesce(p_w[i], 0), v_lo[i]), v_hi[i]);
  end loop;
  return v_out;
end;
$$;

-- ts-fsrs computeDecayFactor: {decay = -w20, factor = roundTo(0.9^(1/decay) - 1, 8)}.
create or replace function public.srs_decay_factor(p_w double precision[])
returns double precision[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[-p_w[21], public.srs_round8(exp((1::double precision / -p_w[21]) * ln(0.9::double precision)) - 1)];
$$;

-- ts-fsrs forgetting_curve(w, t, s) = roundTo((1 + factor * t / s)^decay, 8).
create or replace function public.srs_forgetting_curve(p_w double precision[], p_elapsed_days double precision, p_stability double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.srs_round8(power(1 + df[2] * p_elapsed_days / p_stability, df[1]))
  from (select public.srs_decay_factor(p_w) as df) x;
$$;

-- ts-fsrs init_difficulty(g) = roundTo(w4 - e^((g-1) * w5) + 1, 8) (not clamped).
create or replace function public.srs_init_difficulty(p_w double precision[], p_g integer)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.srs_round8(p_w[5] - exp((p_g - 1) * p_w[6]) + 1);
$$;

-- ts-fsrs FSRSAlgorithm.next_state: {difficulty, stability} after grade p_g given t elapsed days.
-- p_r null = derive retrievability from the forgetting curve.
create or replace function public.srs_next_memory(
  p_w double precision[], p_d double precision, p_s double precision, p_t integer, p_g integer, p_r double precision
)
returns double precision[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_r double precision;
  v_new_s double precision;
  v_new_d double precision;
  v_sinc double precision;
  v_s_after_fail double precision;
  v_next_d double precision;
begin
  if p_d = 0 and p_s = 0 then
    return array[least(greatest(public.srs_init_difficulty(p_w, p_g), 1), 10), greatest(p_w[p_g], 0.1::double precision)];
  end if;
  if p_d < 1 or p_s < 0.001 then
    raise exception 'invalid_memory_state';
  end if;
  v_r := coalesce(p_r, public.srs_forgetting_curve(p_w, p_t, p_s));

  if p_t = 0 then
    -- next_short_term_stability
    v_sinc := power(p_s, -p_w[20]) * exp(p_w[18] * (p_g - 3 + p_w[19]));
    if p_g >= 2 then
      v_sinc := greatest(v_sinc, 1);
    end if;
    v_new_s := public.srs_round8(least(greatest(p_s * v_sinc, 0.001), 36500));
  elsif p_g = 1 then
    -- next_forget_stability, then min(max(S / e^(w17 * w18), S_MIN), S_after_fail)
    v_s_after_fail := public.srs_round8(least(greatest(
      p_w[12] * power(p_d, -p_w[13]) * (power(p_s + 1, p_w[14]) - 1) * exp((1 - v_r) * p_w[15]),
      0.001), 36500));
    v_new_s := least(greatest(public.srs_round8(p_s / exp(p_w[18] * p_w[19])), 0.001), v_s_after_fail);
  else
    -- next_recall_stability
    v_new_s := public.srs_round8(least(greatest(
      p_s * (1 + exp(p_w[9]) * (11 - p_d) * power(p_s, -p_w[10]) * (exp((1 - v_r) * p_w[11]) - 1)
        * (case when p_g = 2 then p_w[16] else 1 end) * (case when p_g = 4 then p_w[17] else 1 end)),
      0.001), 36500));
  end if;

  -- next_difficulty: linear damping, then mean reversion towards D0(Easy), clamped to [1, 10].
  v_next_d := p_d + public.srs_round8(-p_w[7] * (p_g - 3) * (10 - p_d) / 9);
  v_new_d := least(greatest(
    public.srs_round8(p_w[8] * public.srs_init_difficulty(p_w, 4) + (1 - p_w[8]) * v_next_d), 1), 10);
  return array[v_new_d, v_new_s];
end;
$$;

-- ts-fsrs next_interval with fuzz off: min(max(1, round(S * interval_modifier)), maximum_interval) days.
create or replace function public.srs_interval_days(
  p_w double precision[], p_desired_retention double precision, p_maximum_interval integer, p_stability double precision
)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select least(greatest(1, floor(p_stability * public.srs_round8((power(p_desired_retention, 1 / df[1]) - 1) / df[2]) + 0.5)::integer), p_maximum_interval)
  from (select public.srs_decay_factor(p_w) as df) x;
$$;

-- ts-fsrs BasicLearningStepsStrategy → array[scheduled_minutes, next_step]; {0, 0} = no step (go to review).
create or replace function public.srs_step_info(
  p_learning_steps integer[], p_relearning_steps integer[], p_state text, p_step integer, p_g integer
)
returns integer[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_steps integer[] := case when p_state in ('relearning', 'review') then coalesce(p_relearning_steps, '{}') else coalesce(p_learning_steps, '{}') end;
  v_n integer := cardinality(v_steps);
begin
  if v_n = 0 or p_step >= v_n then
    return array[0, 0];
  end if;
  if p_state = 'review' then
    if p_g = 1 then
      return array[v_steps[greatest(0, p_step) + 1], 0];
    end if;
    return array[0, 0];
  end if;
  if p_g = 1 then
    return array[v_steps[1], 0];
  elsif p_g = 2 then
    if v_n = 1 then
      return array[floor(v_steps[1] * 1.5::double precision + 0.5)::integer, p_step];
    end if;
    return array[floor((v_steps[1] + v_steps[2]) / 2::double precision + 0.5)::integer, p_step];
  elsif p_g = 3 and p_step + 1 >= 0 and p_step + 1 < v_n and v_steps[p_step + 2] <> 0 then
    return array[v_steps[p_step + 2], p_step + 1];
  end if;
  return array[0, 0];
end;
$$;

-- One FSRS step with explicit parameters and elapsed (local) days. Returns
-- {state, step, stability, difficulty, scheduled_days, step_minutes, lapse}; step_minutes > 0 means
-- "due p_now + step_minutes" (ts-fsrs applyLearningSteps), otherwise the card is due in scheduled_days days.
create or replace function public.srs_schedule(
  p_w double precision[], p_desired_retention double precision, p_maximum_interval integer,
  p_learning_steps integer[], p_relearning_steps integer[],
  p_state text, p_step integer, p_stability double precision, p_difficulty double precision,
  p_elapsed_days integer, p_rating integer
)
returns jsonb
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  v_ds double precision[];
  v_r double precision;
  v_hard double precision[];
  v_good double precision[];
  v_easy double precision[];
  v_hard_ivl integer;
  v_good_ivl integer;
  v_easy_ivl integer;
  v_days integer;
  v_info integer[];
  v_minutes integer;
  v_to_state text;
  v_t integer := case when p_state = 'new' then 0 else greatest(coalesce(p_elapsed_days, 0), 0) end;
  v_step integer := coalesce(p_step, 0);
  v_s double precision := coalesce(p_stability, 0);
  v_d double precision := coalesce(p_difficulty, 0);
begin
  if p_rating is null or p_rating not between 1 and 4 then
    raise exception 'invalid_rating';
  end if;
  if p_state is null or p_state not in ('new', 'learning', 'review', 'relearning') then
    raise exception 'invalid_state';
  end if;

  if p_state = 'review' then
    v_r := public.srs_forgetting_curve(p_w, v_t, v_s);
    if p_rating >= 2 then
      v_hard := public.srs_next_memory(p_w, v_d, v_s, v_t, 2, v_r);
      v_good := public.srs_next_memory(p_w, v_d, v_s, v_t, 3, v_r);
      v_easy := public.srs_next_memory(p_w, v_d, v_s, v_t, 4, v_r);
      v_hard_ivl := public.srs_interval_days(p_w, p_desired_retention, p_maximum_interval, v_hard[2]);
      v_good_ivl := public.srs_interval_days(p_w, p_desired_retention, p_maximum_interval, v_good[2]);
      v_hard_ivl := least(v_hard_ivl, v_good_ivl);
      v_good_ivl := greatest(v_good_ivl, v_hard_ivl + 1);
      v_easy_ivl := greatest(public.srs_interval_days(p_w, p_desired_retention, p_maximum_interval, v_easy[2]), v_good_ivl + 1);
      v_ds := case p_rating when 2 then v_hard when 3 then v_good else v_easy end;
      v_days := case p_rating when 2 then v_hard_ivl when 3 then v_good_ivl else v_easy_ivl end;
      return jsonb_build_object('state', 'review', 'step', 0, 'difficulty', v_ds[1], 'stability', v_ds[2],
        'scheduled_days', v_days, 'step_minutes', 0, 'lapse', false);
    end if;
    v_ds := public.srs_next_memory(p_w, v_d, v_s, v_t, 1, v_r);
    v_to_state := 'relearning';
  else
    v_ds := public.srs_next_memory(p_w, v_d, v_s, v_t, p_rating, null);
    v_to_state := case when p_state = 'new' then 'learning' else p_state end;
  end if;

  -- applyLearningSteps
  v_info := public.srs_step_info(p_learning_steps, p_relearning_steps, p_state, v_step, p_rating);
  v_minutes := greatest(0, v_info[1]);
  if v_minutes > 0 and v_minutes < 1440 then
    return jsonb_build_object('state', v_to_state, 'step', greatest(0, v_info[2]), 'difficulty', v_ds[1], 'stability', v_ds[2],
      'scheduled_days', 0, 'step_minutes', v_minutes, 'lapse', p_state = 'review');
  elsif v_minutes >= 1440 then
    return jsonb_build_object('state', 'review', 'step', greatest(0, v_info[2]), 'difficulty', v_ds[1], 'stability', v_ds[2],
      'scheduled_days', v_minutes / 1440, 'step_minutes', v_minutes, 'lapse', p_state = 'review');
  end if;
  return jsonb_build_object('state', 'review', 'step', 0, 'difficulty', v_ds[1], 'stability', v_ds[2],
    'scheduled_days', public.srs_interval_days(p_w, p_desired_retention, p_maximum_interval, v_ds[2]),
    'step_minutes', 0, 'lapse', p_state = 'review');
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal contract (plan "Internal SQL contract"); config from public.srs_config
-- ---------------------------------------------------------------------------

create or replace function public.srs_next(
  p_state text, p_step smallint, p_stability double precision, p_difficulty double precision,
  p_last_review_at timestamptz, p_rating smallint, p_now timestamptz, p_tz text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cfg record;
  v_tz text := coalesce(p_tz, 'Asia/Ho_Chi_Minh');
  v_today date := (p_now at time zone v_tz)::date;
  v_elapsed integer := 0;
  v_res jsonb;
  v_days integer;
  v_minutes integer;
  v_interval integer;
  v_due timestamptz;
begin
  select c.weights, c.desired_retention, c.maximum_interval, c.learning_steps_minutes, c.relearning_steps_minutes
    into v_cfg
    from public.srs_config c
    limit 1;
  if not found then
    raise exception 'srs_config_missing';
  end if;

  if p_state is distinct from 'new' and p_last_review_at is not null then
    v_elapsed := greatest(v_today - (p_last_review_at at time zone v_tz)::date, 0);
  end if;

  v_res := public.srs_schedule(
    public.srs_clip_weights(v_cfg.weights::double precision[], cardinality(v_cfg.relearning_steps_minutes)),
    v_cfg.desired_retention::double precision, v_cfg.maximum_interval::integer,
    v_cfg.learning_steps_minutes::integer[], v_cfg.relearning_steps_minutes::integer[],
    p_state, p_step, p_stability, p_difficulty, v_elapsed, p_rating);

  v_days := (v_res->>'scheduled_days')::integer;
  v_minutes := (v_res->>'step_minutes')::integer;
  if v_days >= 1 then
    v_due := ((v_today + v_days)::timestamp) at time zone v_tz;
  else
    v_due := p_now + make_interval(mins => v_minutes);
  end if;
  v_interval := case when v_minutes > 0 then v_minutes else v_days * 1440 end;

  return jsonb_build_object(
    'state', v_res->'state',
    'step', v_res->'step',
    'stability', v_res->'stability',
    'difficulty', v_res->'difficulty',
    'scheduled_days', v_days,
    'interval_minutes', v_interval,
    'due_at', v_due,
    'lapse', v_res->'lapse'
  );
end;
$$;

-- Probability of recall after p_elapsed_days for a card of stability p_stability (ts-fsrs forgetting_curve);
-- 0 for a card without memory state.
create or replace function public.srs_retrievability(p_stability double precision, p_elapsed_days double precision)
returns double precision
language plpgsql
stable
set search_path = ''
as $$
declare
  v_w double precision[];
begin
  if p_stability is null or p_stability <= 0 then
    return 0;
  end if;
  select public.srs_clip_weights(c.weights::double precision[], cardinality(c.relearning_steps_minutes))
    into v_w
    from public.srs_config c
    limit 1;
  if v_w is null then
    raise exception 'srs_config_missing';
  end if;
  return public.srs_forgetting_curve(v_w, greatest(coalesce(p_elapsed_days, 0), 0), p_stability);
end;
$$;

-- Spec §2 rating adjustment: any hint caps the rating at Hard; a correct answer (>= Good) given with
-- confidence 1 ("guessed") counts as Hard. Again stays Again.
create or replace function public.srs_adjust_rating(p_rating smallint, p_confidence smallint, p_hint_count smallint)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_rating is null then null
    when coalesce(p_hint_count, 0) > 0 then least(p_rating, 2::smallint)
    when p_rating >= 3 and p_confidence = 1 then 2::smallint
    else p_rating
  end;
$$;

-- What each rating would do to the card now: {"again": {"interval_minutes", "due_at"}, "hard": …, "good": …, "easy": …}.
create or replace function public.srs_previews(
  p_state text, p_step smallint, p_stability double precision, p_difficulty double precision,
  p_last_review_at timestamptz, p_now timestamptz, p_tz text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_next jsonb;
  v_keys constant text[] := array['again', 'hard', 'good', 'easy'];
begin
  for i in 1..4 loop
    v_next := public.srs_next(p_state, p_step, p_stability, p_difficulty, p_last_review_at, i::smallint, p_now, p_tz);
    v_out := v_out || jsonb_build_object(v_keys[i],
      jsonb_build_object('interval_minutes', v_next->'interval_minutes', 'due_at', v_next->'due_at'));
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: everything here is internal (called by the SECURITY DEFINER review RPCs)
-- ---------------------------------------------------------------------------

revoke all on function public.srs_round8(double precision) from public, anon, authenticated;
revoke all on function public.srs_clip_weights(double precision[], integer) from public, anon, authenticated;
revoke all on function public.srs_decay_factor(double precision[]) from public, anon, authenticated;
revoke all on function public.srs_forgetting_curve(double precision[], double precision, double precision) from public, anon, authenticated;
revoke all on function public.srs_init_difficulty(double precision[], integer) from public, anon, authenticated;
revoke all on function public.srs_next_memory(double precision[], double precision, double precision, integer, integer, double precision) from public, anon, authenticated;
revoke all on function public.srs_interval_days(double precision[], double precision, integer, double precision) from public, anon, authenticated;
revoke all on function public.srs_step_info(integer[], integer[], text, integer, integer) from public, anon, authenticated;
revoke all on function public.srs_schedule(double precision[], double precision, integer, integer[], integer[], text, integer, double precision, double precision, integer, integer) from public, anon, authenticated;
revoke all on function public.srs_next(text, smallint, double precision, double precision, timestamptz, smallint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.srs_retrievability(double precision, double precision) from public, anon, authenticated;
revoke all on function public.srs_adjust_rating(smallint, smallint, smallint) from public, anon, authenticated;
revoke all on function public.srs_previews(text, smallint, double precision, double precision, timestamptz, timestamptz, text) from public, anon, authenticated;
