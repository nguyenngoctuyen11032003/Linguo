-- Linguo spec 4 §4: diagnostic RPCs (status, start, answer, skip, finish, accept placement).
-- Reads the tables of 20261014000400_diagnostic.sql and scores with the diag_* engine of
-- 20261014000410_diagnostic_engine.sql. JSON shapes match packages/shared/src/diagnostic/rpc.ts.
--
-- State is never cached: every call recomputes each skill's posterior from assessment_responses
-- (spec §2). Answer keys, correctness, explanations, difficulties and θ never leave this file: the
-- client only ever sees the public prompt, a per-skill "fill" in 0..1 and, once finished, the report.
--
-- Constants come from assessments.config (cooldown_days, abandon_days, max_items, foundation_max_items,
-- foundation_max_b, prior_sd, rapid_ms, rapid_share); the per-skill stop rule lives in
-- diag_should_stop_skill. Engine constants without a config key (spec §2) are written inline:
-- early stop = 3 consecutive wrong answers with b <= 1.0 in the first skill; 3 nearest candidates.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients). Scalar arguments only (never a table row), so that
-- PostgREST and the type generator do not expose any of them as computed columns.
-- ---------------------------------------------------------------------------

-- Numeric config value of an assessment, with the spec default when the key or the row is missing.
create or replace function public.diagnostic_config(p_assessment_id uuid, p_key text, p_default double precision)
returns double precision
language sql
stable
set search_path = ''
as $$
  select coalesce((select (a.config ->> p_key)::double precision from public.assessments a where a.id = p_assessment_id), p_default);
$$;

-- The published diagnostic of a language (null when none).
create or replace function public.diagnostic_assessment_for(p_language text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select a.id from public.assessments a
  where a.language_code = p_language and a.assessment_type = 'diagnostic' and a.is_published
  order by a.version desc, a.id
  limit 1;
$$;

-- True when the assessment has at least one servable item for the mode.
create or replace function public.diagnostic_bank_available(p_assessment_id uuid, p_mode text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_assessment_id is not null and exists (
    select 1 from public.assessment_items i
    where i.assessment_id = p_assessment_id and i.status = 'published'
      and (p_mode <> 'foundation' or i.difficulty <= public.diagnostic_config(p_assessment_id, 'foundation_max_b', 1.5))
  );
$$;

create or replace function public.diagnostic_level_ordinal(p_language text, p_level text)
returns integer
language sql
stable
set search_path = ''
as $$
  select h.ordinal::integer from public.level_reference_hours h where h.language_code = p_language and h.level_code = p_level;
$$;

create or replace function public.diagnostic_level_code(p_language text, p_ordinal integer)
returns text
language sql
stable
set search_path = ''
as $$
  select h.level_code from public.level_reference_hours h
  where p_ordinal is not null and h.language_code = p_language and h.ordinal = least(greatest(p_ordinal, 0), 6);
$$;

-- Unanswered servable items of one skill in an attempt.
create or replace function public.diagnostic_bank_left(p_attempt_id uuid, p_skill text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.assessment_attempts a
  join public.assessment_items i on i.assessment_id = a.assessment_id
  where a.id = p_attempt_id and i.skill = p_skill and i.status = 'published'
    and (a.mode <> 'foundation' or i.difficulty <= public.diagnostic_config(a.assessment_id, 'foundation_max_b', 1.5))
    and not exists (select 1 from public.assessment_responses r where r.attempt_id = a.id and r.item_id = i.id);
$$;

-- Recomputed state of an attempt (internal; contains θ, never returned to a client):
--   {total, max_total, rapid_share, early_stop, done, active, language_code,
--    skills: [{skill, status pending|active|done|skipped, n, mean, sd, weights}]}
-- Skills run vocabulary → grammar → reading. A skill's prior mean is the attempt's base prior
-- (report.prior_mean, set at start) for the first estimated skill, then the mean EAP of the earlier
-- finished skills; prior sd = config prior_sd.
create or replace function public.diagnostic_attempt_state(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_att public.assessment_attempts;
  v_lang text;
  v_base double precision;
  v_prior_sd double precision;
  v_rapid_ms double precision;
  v_max_total integer;
  v_total integer;
  v_rapid integer;
  v_first_skill text;
  v_early boolean := false;
  v_skill text;
  v_n integer;
  v_b double precision[];
  v_opt integer[];
  v_ok boolean[];
  v_w double precision[];
  v_e jsonb;
  v_mean double precision;
  v_sd double precision;
  v_done_means double precision[] := '{}';
  v_active text;
  v_status text;
  v_skills jsonb := '[]'::jsonb;
begin
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id;
  if not found then
    return null;
  end if;
  select p.language_code,
         coalesce((v_att.report ->> 'prior_mean')::double precision,
           case when v_att.mode = 'foundation' then 0.5
                else public.diagnostic_level_ordinal(p.language_code, p.current_level) + 0.5 end)
    into v_lang, v_base
    from public.learning_paths p where p.id = v_att.learning_path_id;
  v_prior_sd := public.diagnostic_config(v_att.assessment_id, 'prior_sd', 1.25);
  v_rapid_ms := public.diagnostic_config(v_att.assessment_id, 'rapid_ms', 800);
  v_max_total := case when v_att.mode = 'foundation'
    then public.diagnostic_config(v_att.assessment_id, 'foundation_max_items', 8)
    else public.diagnostic_config(v_att.assessment_id, 'max_items', 30) end;

  select count(*)::integer,
         (count(*) filter (where r.answered_at - r.served_at < make_interval(secs => v_rapid_ms / 1000)))::integer
    into v_total, v_rapid
    from public.assessment_responses r where r.attempt_id = p_attempt_id;

  -- Early stop: 3 consecutive wrong answers with b <= 1.0 within the first skill answered.
  select r.skill into v_first_skill from public.assessment_responses r where r.attempt_id = p_attempt_id order by r.seq limit 1;
  if v_first_skill is not null then
    select coalesce(bool_or(t.easy_wrong and t.prev1 and t.prev2), false) into v_early
    from (
      select x.easy_wrong,
             coalesce(lag(x.easy_wrong, 1) over (order by x.seq), false) as prev1,
             coalesce(lag(x.easy_wrong, 2) over (order by x.seq), false) as prev2
      from (
        select r.seq, (not r.is_correct and i.difficulty <= 1.0) as easy_wrong
        from public.assessment_responses r join public.assessment_items i on i.id = r.item_id
        where r.attempt_id = p_attempt_id and r.skill = v_first_skill
      ) as x
    ) as t;
  end if;

  foreach v_skill in array array['vocabulary', 'grammar', 'reading'] loop
    select count(*)::integer,
           coalesce(array_agg(i.difficulty::double precision order by r.seq), '{}'),
           coalesce(array_agg(jsonb_array_length(i.prompt -> 'options') order by r.seq), '{}'),
           coalesce(array_agg(r.is_correct order by r.seq), '{}')
      into v_n, v_b, v_opt, v_ok
      from public.assessment_responses r join public.assessment_items i on i.id = r.item_id
      where r.attempt_id = p_attempt_id and r.skill = v_skill;
    v_w := public.diag_posterior(
      case when cardinality(v_done_means) > 0 then (select avg(m) from unnest(v_done_means) as m) else v_base end,
      v_prior_sd, v_b, v_opt, v_ok);
    v_e := public.diag_eap(v_w);
    v_mean := (v_e ->> 'mean')::double precision;
    v_sd := (v_e ->> 'sd')::double precision;

    if v_att.skipped ? v_skill then
      v_status := 'skipped';
    elsif v_active is not null then
      v_status := 'pending';
    elsif public.diag_should_stop_skill(v_skill, v_n, v_sd, public.diagnostic_bank_left(p_attempt_id, v_skill)) then
      v_status := 'done';
      if v_n > 0 then
        v_done_means := v_done_means || v_mean;
      end if;
    else
      v_status := 'active';
      v_active := v_skill;
    end if;

    v_skills := v_skills || jsonb_build_array(jsonb_build_object(
      'skill', v_skill, 'status', v_status, 'n', v_n, 'mean', v_mean, 'sd', v_sd, 'weights', to_jsonb(v_w)));
  end loop;

  return jsonb_build_object(
    'total', v_total,
    'max_total', v_max_total,
    'rapid_share', case when v_total > 0 then v_rapid::double precision / v_total else 0 end,
    'early_stop', v_early,
    'done', v_active is null or v_total >= v_max_total or v_early,
    'active', v_active,
    'language_code', v_lang,
    'skills', v_skills
  );
end;
$$;

-- Item selection (spec §2): unanswered items of the skill (foundation: b <= foundation_max_b), without
-- the items of the user's earlier completed attempts while at least 3 remain; the 3 with the smallest
-- |b − EAP| (ties by id); pick floor(r · k) with r from md5(attempt_id:seq).
create or replace function public.diagnostic_pick_item(p_attempt_id uuid, p_skill text, p_eap double precision, p_seq integer)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_att public.assessment_attempts;
  v_ids uuid[];
  v_r double precision;
begin
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id;
  with cand as (
    select i.id, i.difficulty::double precision as b
    from public.assessment_items i
    where i.assessment_id = v_att.assessment_id and i.skill = p_skill and i.status = 'published'
      and (v_att.mode <> 'foundation' or i.difficulty <= public.diagnostic_config(v_att.assessment_id, 'foundation_max_b', 1.5))
      and not exists (select 1 from public.assessment_responses r where r.attempt_id = p_attempt_id and r.item_id = i.id)
  ), fresh as (
    select c.* from cand c
    where not exists (
      select 1 from public.assessment_responses r join public.assessment_attempts a on a.id = r.attempt_id
      where r.item_id = c.id and a.user_id = v_att.user_id and a.status = 'completed' and a.id <> p_attempt_id
    )
  ), pool as (
    select f.id, f.b from fresh f where (select count(*) from fresh) >= 3
    union all
    select c.id, c.b from cand c where (select count(*) from fresh) < 3
  )
  select array_agg(t.id order by t.dist, t.id) into v_ids
  from (select p.id, abs(p.b - p_eap) as dist from pool p order by abs(p.b - p_eap), p.id limit 3) as t;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return null;
  end if;
  v_r := ('x' || substr(md5(p_attempt_id::text || ':' || p_seq::text), 1, 8))::bit(32)::bigint / 4294967296.0;
  return v_ids[floor(v_r * cardinality(v_ids))::integer + 1];
end;
$$;

-- Serves the next item: keeps the pending (unanswered) item while it still belongs to the active skill, otherwise
-- picks one for the active skill (or clears it when the test is done).
create or replace function public.diagnostic_advance(p_attempt_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_state jsonb := public.diagnostic_attempt_state(p_attempt_id);
  v_current uuid;
  v_current_skill text;
  v_next uuid;
begin
  select a.current_item_id, i.skill into v_current, v_current_skill
  from public.assessment_attempts a left join public.assessment_items i on i.id = a.current_item_id
  where a.id = p_attempt_id;

  if (v_state ->> 'done')::boolean then
    v_next := null;
  elsif v_current is not null and v_current_skill = v_state ->> 'active'
        and not exists (select 1 from public.assessment_responses r where r.attempt_id = p_attempt_id and r.item_id = v_current) then
    return;
  else
    v_next := public.diagnostic_pick_item(
      p_attempt_id, v_state ->> 'active',
      (select (s ->> 'mean')::double precision from jsonb_array_elements(v_state -> 'skills') as s where s ->> 'skill' = v_state ->> 'active'),
      (v_state ->> 'total')::integer + 1);
  end if;

  update public.assessment_attempts
  set current_item_id = v_next,
      current_served_at = case when v_next is null then null else now() end
  where id = p_attempt_id;
end;
$$;

-- diagnosticStepSchema. The item carries only the public prompt fields (allow-listed).
create or replace function public.diagnostic_step_json(p_attempt_id uuid, p_resumed boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_att public.assessment_attempts;
  v_state jsonb := public.diagnostic_attempt_state(p_attempt_id);
  v_done boolean := (v_state ->> 'done')::boolean;
  v_item jsonb;
  v_progress jsonb;
  v_last_left boolean;
begin
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id;

  if v_att.current_item_id is not null and not v_done then
    select jsonb_build_object(
      'id', i.id,
      'skill', i.skill,
      'item_type', i.item_type,
      'prompt', jsonb_build_object(
        'stem', i.prompt -> 'stem',
        'stem_lang', i.prompt -> 'stem_lang',
        'passage', coalesce(i.prompt -> 'passage', 'null'::jsonb),
        'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o -> 'id', 'text', o -> 'text', 'lang', o -> 'lang') order by n), '[]'::jsonb)
                    from jsonb_array_elements(i.prompt -> 'options') with ordinality as x(o, n))
      )
    ) into v_item
    from public.assessment_items i where i.id = v_att.current_item_id;
  end if;

  -- No pending skill after the active one: the learner is on the last skill.
  v_last_left := not exists (select 1 from jsonb_array_elements(v_state -> 'skills') as s where s ->> 'status' = 'pending');

  select jsonb_build_object(
    'skills', jsonb_agg(jsonb_build_object(
      'skill', s ->> 'skill',
      'status', case when v_done and s ->> 'status' = 'active' then 'done' else s ->> 'status' end,
      'fill', case
        when s ->> 'status' = 'done' or (v_done and s ->> 'status' = 'active') then 1
        when s ->> 'status' = 'active' then
          round(least(greatest(1 - (s ->> 'sd')::numeric / public.diagnostic_config(v_att.assessment_id, 'prior_sd', 1.25)::numeric, 0), 1), 3)
        else 0 end
    ) order by n),
    'near_end', v_done or v_last_left or ((v_state ->> 'max_total')::integer - (v_state ->> 'total')::integer) <= 3
  ) into v_progress
  from jsonb_array_elements(v_state -> 'skills') with ordinality as x(s, n);

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'mode', v_att.mode,
    'item', v_item,
    'progress', v_progress,
    'done', v_done,
    'resumed', p_resumed
  );
end;
$$;

-- diagnosticReportSchema for an attempt finished at p_completed_at (applied_at null).
-- A diagnostic skill is 'estimated' with at least 3 answers, 'skipped' when the learner skipped it,
-- otherwise 'insufficient'; listening (no audio yet), writing and speaking are 'not_supported'.
create or replace function public.diagnostic_build_report(p_attempt_id uuid, p_completed_at timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_att public.assessment_attempts;
  v_path public.learning_paths;
  v_state jsonb := public.diagnostic_attempt_state(p_attempt_id);
  v_rapid double precision := (v_state ->> 'rapid_share')::double precision;
  v_early boolean := (v_state ->> 'early_stop')::boolean;
  v_s jsonb;
  v_n integer;
  v_level integer;
  v_range jsonb;
  v_conf text;
  v_levels integer[] := '{}';
  v_confs text[] := '{}';
  v_out jsonb := '[]'::jsonb;
  v_suggested integer;
  v_capped integer;
  v_first boolean;
begin
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id;
  select p.* into v_path from public.learning_paths p where p.id = v_att.learning_path_id;

  for v_s in select s from jsonb_array_elements(v_state -> 'skills') as s loop
    v_n := (v_s ->> 'n')::integer;
    if v_att.skipped ? (v_s ->> 'skill') then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'skill', v_s ->> 'skill', 'status', 'skipped', 'level_code', null, 'range', null, 'confidence', null,
        'sample_size', v_n, 'reason', v_att.skipped ->> (v_s ->> 'skill')));
    elsif v_n < 3 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'skill', v_s ->> 'skill', 'status', 'insufficient', 'level_code', null, 'range', null, 'confidence', null,
        'sample_size', v_n,
        'reason', case when v_early then 'early_stop' when v_n = 0 then 'not_reached' else 'too_few_answers' end));
    else
      v_level := public.diag_conservative_level(array(select jsonb_array_elements_text(v_s -> 'weights')::double precision));
      v_range := public.diag_level_range(array(select jsonb_array_elements_text(v_s -> 'weights')::double precision));
      v_conf := public.diag_confidence((v_s ->> 'sd')::double precision, v_n, v_rapid);
      v_levels := v_levels || v_level;
      v_confs := v_confs || v_conf;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'skill', v_s ->> 'skill', 'status', 'estimated',
        'level_code', public.diagnostic_level_code(v_path.language_code, v_level),
        'range', jsonb_build_object(
          'low', public.diagnostic_level_code(v_path.language_code, (v_range ->> 'low')::integer),
          'high', public.diagnostic_level_code(v_path.language_code, (v_range ->> 'high')::integer)),
        'confidence', v_conf, 'sample_size', v_n, 'reason', null));
    end if;
  end loop;

  v_out := v_out || jsonb_build_array(
    jsonb_build_object('skill', 'listening', 'status', 'not_supported', 'level_code', null, 'range', null,
      'confidence', null, 'sample_size', 0, 'reason', 'no_audio'),
    jsonb_build_object('skill', 'writing', 'status', 'not_supported', 'level_code', null, 'range', null,
      'confidence', null, 'sample_size', 0, 'reason', 'not_inferred'),
    jsonb_build_object('skill', 'speaking', 'status', 'not_supported', 'level_code', null, 'range', null,
      'confidence', null, 'sample_size', 0, 'reason', 'not_inferred'));

  if cardinality(v_levels) > 0 then
    v_suggested := public.diag_suggest_level(v_levels, v_confs);
  end if;
  if v_suggested is not null then
    v_first := not exists (
      select 1 from public.assessment_attempts a where a.learning_path_id = v_att.learning_path_id and a.applied_at is not null);
    v_capped := public.diag_cap_level(public.diagnostic_level_ordinal(v_path.language_code, v_path.current_level), v_suggested, v_first);
  end if;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'learning_path_id', v_att.learning_path_id,
    'language_code', v_path.language_code,
    'mode', v_att.mode,
    'completed_at', p_completed_at,
    'skills', v_out,
    'current_level', v_path.current_level,
    'suggested_level', public.diagnostic_level_code(v_path.language_code, v_suggested),
    'capped_level', public.diagnostic_level_code(v_path.language_code, v_capped),
    'early_stop', v_early,
    'rapid_answer_share', round(v_rapid::numeric, 4)::double precision,
    'bank_unreviewed', exists (
      select 1 from public.assessment_items i
      where i.assessment_id = v_att.assessment_id and i.status = 'published' and i.key_confidence <> 'reviewed'),
    'applied_at', null,
    'retake_after', p_completed_at + make_interval(days => public.diagnostic_config(v_att.assessment_id, 'cooldown_days', 14)::integer)
  );
end;
$$;

-- Locked, owned, active attempt for answer/skip: attempt_not_found / attempt_not_active
-- (an in-progress attempt idle for more than abandon_days counts as abandoned).
create or replace function public.diagnostic_active_attempt(p_user uuid, p_attempt_id uuid)
returns public.assessment_attempts
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_att public.assessment_attempts;
begin
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id and a.user_id = p_user for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_found';
  end if;
  if v_att.status <> 'in_progress'
     or v_att.last_activity_at < now() - make_interval(days => public.diagnostic_config(v_att.assessment_id, 'abandon_days', 7)::integer) then
    raise exception using errcode = 'P0001', message = 'attempt_not_active';
  end if;
  return v_att;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- diagnosticStatusSchema: latest attempt of the path, plus whether start_diagnostic would succeed now.
create or replace function public.diagnostic_status(p_path_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_assessment uuid;
  v_att public.assessment_attempts;
  v_status text := 'none';
  v_retake timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select p.* into v_path from public.learning_paths p where p.id = p_path_id and p.user_id = v_uid and p.status <> 'archived';
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  v_assessment := public.diagnostic_assessment_for(v_path.language_code);

  select a.* into v_att from public.assessment_attempts a
  where a.learning_path_id = p_path_id order by a.started_at desc, a.id desc limit 1;
  if found then
    v_status := v_att.status;
    if v_status = 'in_progress' and v_att.last_activity_at
         < now() - make_interval(days => public.diagnostic_config(v_att.assessment_id, 'abandon_days', 7)::integer) then
      v_status := 'abandoned';
    end if;
  end if;

  select a.completed_at + make_interval(days => public.diagnostic_config(coalesce(v_assessment, a.assessment_id), 'cooldown_days', 14)::integer)
    into v_retake
  from public.assessment_attempts a
  where a.learning_path_id = p_path_id and a.status = 'completed'
  order by a.completed_at desc limit 1;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'status', v_status,
    'completed_at', v_att.completed_at,
    'applied_at', v_att.applied_at,
    'retake_after', v_retake,
    'can_start', v_status = 'in_progress'
      or (public.diagnostic_bank_available(v_assessment, 'full') and (v_retake is null or v_retake <= now()))
  );
end;
$$;

-- Resumes the in-progress attempt (same pending item, resumed = true) or starts a new one.
create or replace function public.start_diagnostic(p_path_id uuid, p_mode text default 'full')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_assessment uuid;
  v_att public.assessment_attempts;
  v_retake timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  select p.* into v_path from public.learning_paths p
  where p.id = p_path_id and p.user_id = v_uid and p.status <> 'archived' for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  if p_mode is null or p_mode not in ('full', 'foundation') then
    raise exception using errcode = 'P0001', message = 'invalid_mode';
  end if;

  select a.* into v_att from public.assessment_attempts a
  where a.learning_path_id = p_path_id and a.status = 'in_progress' for update;
  if found then
    if v_att.last_activity_at < now() - make_interval(days => public.diagnostic_config(v_att.assessment_id, 'abandon_days', 7)::integer) then
      update public.assessment_attempts
      set status = 'abandoned', current_item_id = null, current_served_at = null
      where id = v_att.id;
    else
      perform public.diagnostic_advance(v_att.id);
      update public.assessment_attempts set last_activity_at = now() where id = v_att.id;
      return public.diagnostic_step_json(v_att.id, true);
    end if;
  end if;

  v_assessment := public.diagnostic_assessment_for(v_path.language_code);
  select a.completed_at + make_interval(days => public.diagnostic_config(coalesce(v_assessment, a.assessment_id), 'cooldown_days', 14)::integer)
    into v_retake
  from public.assessment_attempts a
  where a.learning_path_id = p_path_id and a.status = 'completed'
  order by a.completed_at desc limit 1;
  if v_retake > now() then
    -- detail: retake_after as ISO 8601 (same text as the jsonb timestamps), for the client's message.
    raise exception using errcode = 'P0001', message = 'diagnostic_cooldown', detail = to_jsonb(v_retake) #>> '{}';
  end if;
  if not public.diagnostic_bank_available(v_assessment, p_mode) then
    raise exception using errcode = 'P0001', message = 'bank_unavailable';
  end if;

  insert into public.assessment_attempts (user_id, learning_path_id, assessment_id, mode, status, skipped, report)
  values (
    v_uid, p_path_id, v_assessment, p_mode, 'in_progress', '{}'::jsonb,
    -- Base prior fixed at start, so a later level change of the path cannot move this attempt's estimates.
    jsonb_build_object('prior_mean', case when p_mode = 'foundation' then 0.5
      else public.diagnostic_level_ordinal(v_path.language_code, v_path.current_level) + 0.5 end)
  )
  returning id into v_id;
  perform public.diagnostic_advance(v_id);
  return public.diagnostic_step_json(v_id, false);
end;
$$;

-- Records the answer to the pending item (p_choice null = "Tôi không biết") and serves the next one.
-- Returns the next step only: never correctness, the key or θ.
create or replace function public.answer_diagnostic(p_attempt_id uuid, p_item_id uuid, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.assessment_attempts;
  v_item public.assessment_items;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_att := public.diagnostic_active_attempt(v_uid, p_attempt_id);
  if exists (select 1 from public.assessment_responses r where r.attempt_id = p_attempt_id and r.item_id = p_item_id) then
    raise exception using errcode = 'P0001', message = 'already_answered';
  end if;
  if v_att.current_item_id is null or p_item_id is distinct from v_att.current_item_id then
    raise exception using errcode = 'P0001', message = 'item_mismatch';
  end if;
  select i.* into v_item from public.assessment_items i where i.id = p_item_id;
  if p_choice is not null and not exists (
    select 1 from jsonb_array_elements(v_item.prompt -> 'options') as o where o ->> 'id' = p_choice
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_choice';
  end if;

  insert into public.assessment_responses (attempt_id, seq, item_id, skill, choice, is_correct, served_at, answered_at)
  values (
    p_attempt_id,
    (select coalesce(max(r.seq), 0) + 1 from public.assessment_responses r where r.attempt_id = p_attempt_id),
    p_item_id, v_item.skill, p_choice, coalesce(p_choice = v_item.answer_key, false),
    least(v_att.current_served_at, now()), now()
  );
  update public.assessment_attempts set last_activity_at = now() where id = p_attempt_id;
  perform public.diagnostic_advance(p_attempt_id);
  return public.diagnostic_step_json(p_attempt_id, false);
end;
$$;

-- Skips a diagnostic skill (reported as "chưa đủ dữ liệu"). Skipping a skill that is already skipped or
-- finished changes nothing.
create or replace function public.skip_diagnostic_skill(p_attempt_id uuid, p_skill text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.assessment_attempts;
  v_status text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_skill is null or p_skill not in ('vocabulary', 'grammar', 'reading') then
    raise exception using errcode = 'P0001', message = 'invalid_skill';
  end if;
  if p_reason is null or p_reason not in ('no_time', 'too_hard', 'not_my_goal', 'other') then
    raise exception using errcode = 'P0001', message = 'invalid_reason';
  end if;
  v_att := public.diagnostic_active_attempt(v_uid, p_attempt_id);

  select s ->> 'status' into v_status
  from jsonb_array_elements(public.diagnostic_attempt_state(p_attempt_id) -> 'skills') as s
  where s ->> 'skill' = p_skill;
  if v_status in ('active', 'pending') then
    update public.assessment_attempts
    set skipped = skipped || jsonb_build_object(p_skill, p_reason), last_activity_at = now()
    where id = p_attempt_id;
    perform public.diagnostic_advance(p_attempt_id);
  end if;
  return public.diagnostic_step_json(p_attempt_id, false);
end;
$$;

-- Ends the attempt (early finishing allowed), writes the report and the skill_estimates of the
-- estimated skills (source 'diagnostic'). The path is never changed here. Idempotent.
create or replace function public.finish_diagnostic(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.assessment_attempts;
  v_now timestamptz := now();
  v_report jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id and a.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_found';
  end if;
  if v_att.status = 'completed' then
    return v_att.report;
  end if;
  v_att := public.diagnostic_active_attempt(v_uid, p_attempt_id);
  perform 1 from public.learning_paths p where p.id = v_att.learning_path_id for share;

  v_report := public.diagnostic_build_report(p_attempt_id, v_now);

  insert into public.skill_estimates (learning_path_id, skill, level_code, confidence, sample_size, source, assessed_at)
  select v_att.learning_path_id, s ->> 'skill', s ->> 'level_code', s ->> 'confidence', (s ->> 'sample_size')::integer, 'diagnostic', v_now
  from jsonb_array_elements(v_report -> 'skills') as s
  where s ->> 'status' = 'estimated'
  on conflict (learning_path_id, skill, source) do update
    set level_code = excluded.level_code,
        confidence = excluded.confidence,
        sample_size = excluded.sample_size,
        assessed_at = excluded.assessed_at;

  update public.assessment_attempts
  set status = 'completed', completed_at = v_now, report = v_report,
      current_item_id = null, current_served_at = null, last_activity_at = v_now
  where id = p_attempt_id;
  return v_report;
end;
$$;

-- Applies the capped suggestion to the path (placementResultSchema). The cap (+2 while no diagnostic
-- result was ever applied to the path, +1 afterwards; moving down always allowed) is re-evaluated now.
-- no_suggestion / unchanged / needs_target_update leave the path and the attempt untouched.
create or replace function public.accept_diagnostic_placement(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.assessment_attempts;
  v_path public.learning_paths;
  v_cur integer;
  v_capped integer;
  v_new text;
  v_previous text;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  select a.* into v_att from public.assessment_attempts a where a.id = p_attempt_id and a.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_found';
  end if;
  if v_att.status <> 'completed' then
    raise exception using errcode = 'P0001', message = 'attempt_not_completed';
  end if;
  if v_att.applied_at is not null then
    raise exception using errcode = 'P0001', message = 'already_applied';
  end if;
  select p.* into v_path from public.learning_paths p
  where p.id = v_att.learning_path_id and p.user_id = v_uid and p.status <> 'archived' for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;

  if v_att.report ->> 'suggested_level' is null then
    return jsonb_build_object('learning_path_id', v_path.id, 'previous_level', v_path.current_level,
      'new_level', v_path.current_level, 'outcome', 'no_suggestion', 'estimate', null);
  end if;

  v_previous := v_path.current_level;
  v_cur := public.diagnostic_level_ordinal(v_path.language_code, v_path.current_level);
  v_capped := public.diag_cap_level(
    v_cur,
    public.diagnostic_level_ordinal(v_path.language_code, v_att.report ->> 'suggested_level'),
    not exists (select 1 from public.assessment_attempts a where a.learning_path_id = v_path.id and a.applied_at is not null));
  v_new := public.diagnostic_level_code(v_path.language_code, v_capped);

  if v_capped = v_cur then
    return jsonb_build_object('learning_path_id', v_path.id, 'previous_level', v_path.current_level,
      'new_level', v_path.current_level, 'outcome', 'unchanged', 'estimate', null);
  end if;
  if v_capped >= public.diagnostic_level_ordinal(v_path.language_code, v_path.target_level) then
    return jsonb_build_object('learning_path_id', v_path.id, 'previous_level', v_path.current_level,
      'new_level', v_new, 'outcome', 'needs_target_update', 'estimate', null);
  end if;

  update public.learning_paths
  set current_level = v_new,
      estimate = public.estimate_learning_path(v_path.language_code, v_new, v_path.target_level, v_path.weekly_minutes,
        v_path.target_date, public.learning_user_today(v_uid))
  where id = v_path.id
  returning * into v_path;

  update public.assessment_attempts
  set applied_at = v_now, report = jsonb_set(report, '{applied_at}', to_jsonb(v_now))
  where id = p_attempt_id;

  return jsonb_build_object('learning_path_id', v_path.id, 'previous_level', v_previous,
    'new_level', v_new, 'outcome', 'applied', 'estimate', v_path.estimate);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.diagnostic_config(uuid, text, double precision) from public, anon, authenticated;
revoke all on function public.diagnostic_assessment_for(text) from public, anon, authenticated;
revoke all on function public.diagnostic_bank_available(uuid, text) from public, anon, authenticated;
revoke all on function public.diagnostic_level_ordinal(text, text) from public, anon, authenticated;
revoke all on function public.diagnostic_level_code(text, integer) from public, anon, authenticated;
revoke all on function public.diagnostic_bank_left(uuid, text) from public, anon, authenticated;
revoke all on function public.diagnostic_attempt_state(uuid) from public, anon, authenticated;
revoke all on function public.diagnostic_pick_item(uuid, text, double precision, integer) from public, anon, authenticated;
revoke all on function public.diagnostic_advance(uuid) from public, anon, authenticated;
revoke all on function public.diagnostic_step_json(uuid, boolean) from public, anon, authenticated;
revoke all on function public.diagnostic_build_report(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.diagnostic_active_attempt(uuid, uuid) from public, anon, authenticated;

revoke all on function public.diagnostic_status(uuid) from public, anon;
revoke all on function public.start_diagnostic(uuid, text) from public, anon;
revoke all on function public.answer_diagnostic(uuid, uuid, text) from public, anon;
revoke all on function public.skip_diagnostic_skill(uuid, text, text) from public, anon;
revoke all on function public.finish_diagnostic(uuid) from public, anon;
revoke all on function public.accept_diagnostic_placement(uuid) from public, anon;
grant execute on function public.diagnostic_status(uuid) to authenticated;
grant execute on function public.start_diagnostic(uuid, text) to authenticated;
grant execute on function public.answer_diagnostic(uuid, uuid, text) to authenticated;
grant execute on function public.skip_diagnostic_skill(uuid, text, text) to authenticated;
grant execute on function public.finish_diagnostic(uuid) to authenticated;
grant execute on function public.accept_diagnostic_placement(uuid) to authenticated;
