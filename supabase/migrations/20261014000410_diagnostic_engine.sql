-- Linguo spec 4 §2: adaptive diagnostic scoring engine in SQL.
-- Mirrors packages/shared/src/diagnostic/engine.ts (posterior, eap, shouldStopSkill, conservativeLevel,
-- levelRange, confidenceFor, suggestLevel, capLevel). Parity is checked by the generated
-- supabase/tests/diagnostic_engine.test.sql (from packages/shared/src/diagnostic/engine.fixtures.json,
-- floats within 1e-6). All functions are pure, internal and revoked from clients.
--
-- θ grid: -0.5, -0.25, …, 6.5 (29 points, ordinal scale of level_reference_hours.ordinal).
-- P(correct | θ) = c + (1 − c) · σ(1.7 · (θ − b)), c = 1 / options. Arrays are 1-based: grid point i
-- (1..29) is θ = -0.5 + 0.25 · (i − 1).

-- ---------------------------------------------------------------------------
-- Grid
-- ---------------------------------------------------------------------------
create or replace function public.diag_grid()
returns double precision[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array_agg(-0.5::double precision + 0.25::double precision * i order by i)
  from generate_series(0, 28) as i;
$$;

-- ---------------------------------------------------------------------------
-- Posterior: Normal(p_mean, p_sd) prior on the grid × Π item likelihoods, normalised.
-- Computed in log space (shifted by the maximum) so long answer lists cannot underflow.
-- p_b / p_options / p_correct are parallel arrays (one entry per answered item; null correct = wrong).
-- ---------------------------------------------------------------------------
create or replace function public.diag_posterior(
  p_mean double precision,
  p_sd double precision,
  p_b double precision[],
  p_options integer[],
  p_correct boolean[]
)
returns double precision[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_grid constant double precision[] := public.diag_grid();
  v_n integer := coalesce(cardinality(p_b), 0);
  v_log double precision[] := '{}'::double precision[];
  v_out double precision[] := '{}'::double precision[];
  v_theta double precision;
  v_c double precision;
  v_p double precision;
  v_l double precision;
  v_max double precision := '-Infinity'::double precision;
  v_sum double precision := 0;
begin
  if p_sd is null or p_sd <= 0 or p_mean is null then
    raise exception 'invalid_diagnostic_prior';
  end if;
  if v_n <> coalesce(cardinality(p_options), 0) or v_n <> coalesce(cardinality(p_correct), 0) then
    raise exception 'invalid_diagnostic_answers';
  end if;

  for i in 1..cardinality(v_grid) loop
    v_theta := v_grid[i];
    v_l := -0.5::double precision * ((v_theta - p_mean) / p_sd) ^ 2;
    for j in 1..v_n loop
      if p_options[j] is null or p_options[j] < 2 or p_b[j] is null then
        raise exception 'invalid_diagnostic_answers';
      end if;
      v_c := 1::double precision / p_options[j];
      v_p := v_c + (1 - v_c) / (1 + exp(-1.7::double precision * (v_theta - p_b[j])));
      if coalesce(p_correct[j], false) then
        v_l := v_l + ln(v_p);
      else
        v_l := v_l + ln(1 - v_p);
      end if;
    end loop;
    v_log := v_log || v_l;
    v_max := greatest(v_max, v_l);
  end loop;

  for i in 1..cardinality(v_log) loop
    v_out := v_out || exp(v_log[i] - v_max);
    v_sum := v_sum + v_out[i];
  end loop;
  for i in 1..cardinality(v_out) loop
    v_out[i] := v_out[i] / v_sum;
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- EAP: {mean, sd} of the (normalised) weights on the grid.
-- ---------------------------------------------------------------------------
create or replace function public.diag_eap(p_weights double precision[])
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_grid constant double precision[] := public.diag_grid();
  v_sum double precision := 0;
  v_mean double precision := 0;
  v_var double precision := 0;
begin
  if p_weights is null or cardinality(p_weights) <> cardinality(v_grid) then
    raise exception 'invalid_diagnostic_weights';
  end if;
  for i in 1..cardinality(v_grid) loop
    v_sum := v_sum + p_weights[i];
    v_mean := v_mean + p_weights[i] * v_grid[i];
  end loop;
  if v_sum <= 0 then
    raise exception 'invalid_diagnostic_weights';
  end if;
  v_mean := v_mean / v_sum;
  for i in 1..cardinality(v_grid) loop
    v_var := v_var + p_weights[i] * (v_grid[i] - v_mean) ^ 2;
  end loop;
  return jsonb_build_object('mean', v_mean, 'sd', sqrt(greatest(v_var / v_sum, 0)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Skill stop rule: (n >= 4 and sd <= 0.45) or n = 8 (reading: 5) or no items left.
-- ---------------------------------------------------------------------------
create or replace function public.diag_should_stop_skill(
  p_skill text,
  p_n integer,
  p_sd double precision,
  p_bank_left integer
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_n >= 4 and p_sd <= 0.45)
    or p_n >= case when p_skill = 'reading' then 5 else 8 end
    or p_bank_left <= 0;
$$;

-- ---------------------------------------------------------------------------
-- Reported level: largest L in 0..6 with P(θ >= L) >= 0.7 (1e-9 tolerance, as the TS engine); none → 0.
-- ---------------------------------------------------------------------------
create or replace function public.diag_conservative_level(p_weights double precision[])
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_grid constant double precision[] := public.diag_grid();
  v_tail double precision;
begin
  if p_weights is null or cardinality(p_weights) <> cardinality(v_grid) then
    raise exception 'invalid_diagnostic_weights';
  end if;
  for v_level in reverse 6..1 loop
    v_tail := 0;
    for i in 1..cardinality(v_grid) loop
      if v_grid[i] >= v_level then
        v_tail := v_tail + p_weights[i];
      end if;
    end loop;
    if v_tail >= 0.7 - 1e-9 then
      return v_level;
    end if;
  end loop;
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Level range: floor(10th percentile) .. floor(90th percentile), clamped to 0..6.
-- Percentile q = first grid θ whose cumulative weight reaches q - 1e-9 (same tolerance as the TS engine).
-- ---------------------------------------------------------------------------
create or replace function public.diag_level_range(p_weights double precision[])
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_grid constant double precision[] := public.diag_grid();
  v_n constant integer := cardinality(v_grid);
  v_cum double precision := 0;
  v_low double precision;
  v_high double precision;
begin
  if p_weights is null or cardinality(p_weights) <> v_n then
    raise exception 'invalid_diagnostic_weights';
  end if;
  for i in 1..v_n loop
    v_cum := v_cum + p_weights[i];
    if v_low is null and v_cum >= 0.1 - 1e-9 then
      v_low := v_grid[i];
    end if;
    if v_high is null and v_cum >= 0.9 - 1e-9 then
      v_high := v_grid[i];
    end if;
  end loop;
  v_low := coalesce(v_low, v_grid[v_n]);
  v_high := coalesce(v_high, v_grid[v_n]);
  return jsonb_build_object(
    'low', least(greatest(floor(v_low)::integer, 0), 6),
    'high', least(greatest(floor(v_high)::integer, 0), 6)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Confidence: high if sd <= 0.45 and n >= 6; medium if sd <= 0.75; else low.
-- More than 30% rapid (< 800 ms) answers in the attempt lowers it one step.
-- ---------------------------------------------------------------------------
create or replace function public.diag_confidence(p_sd double precision, p_n integer, p_rapid_share double precision)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when base = 'high' and coalesce(p_rapid_share, 0) > 0.3 then 'medium'
    when base = 'medium' and coalesce(p_rapid_share, 0) > 0.3 then 'low'
    else base
  end
  from (
    select case
      when p_sd <= 0.45 and p_n >= 6 then 'high'
      when p_sd <= 0.75 then 'medium'
      else 'low'
    end as base
  ) as b;
$$;

-- ---------------------------------------------------------------------------
-- Suggested path level: lower median of the levels whose confidence is medium or high;
-- needs at least 2 such skills, otherwise null. p_levels / p_confidences are parallel arrays.
-- ---------------------------------------------------------------------------
create or replace function public.diag_suggest_level(p_levels integer[], p_confidences text[])
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_levels integer[];
begin
  if coalesce(cardinality(p_levels), 0) <> coalesce(cardinality(p_confidences), 0) then
    raise exception 'invalid_diagnostic_skills';
  end if;
  select coalesce(array_agg(l order by l), '{}'::integer[])
  into v_levels
  from unnest(p_levels, p_confidences) as s(l, c)
  where c in ('medium', 'high') and l is not null;
  if cardinality(v_levels) < 2 then
    return null;
  end if;
  return v_levels[(cardinality(v_levels) - 1) / 2 + 1];
end;
$$;

-- ---------------------------------------------------------------------------
-- Cap: moving up is limited to +2 on the first applied result for the path (p_first_applied), +1 after;
-- moving down is always allowed.
-- ---------------------------------------------------------------------------
create or replace function public.diag_cap_level(p_current integer, p_suggested integer, p_first_applied boolean)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_suggested <= p_current then p_suggested
    else least(p_suggested, p_current + case when p_first_applied then 2 else 1 end)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: internal only.
-- ---------------------------------------------------------------------------
revoke all on function public.diag_grid() from public, anon, authenticated;
revoke all on function public.diag_posterior(double precision, double precision, double precision[], integer[], boolean[]) from public, anon, authenticated;
revoke all on function public.diag_eap(double precision[]) from public, anon, authenticated;
revoke all on function public.diag_should_stop_skill(text, integer, double precision, integer) from public, anon, authenticated;
revoke all on function public.diag_conservative_level(double precision[]) from public, anon, authenticated;
revoke all on function public.diag_level_range(double precision[]) from public, anon, authenticated;
revoke all on function public.diag_confidence(double precision, integer, double precision) from public, anon, authenticated;
revoke all on function public.diag_suggest_level(integer[], text[]) from public, anon, authenticated;
revoke all on function public.diag_cap_level(integer, integer, boolean) from public, anon, authenticated;
