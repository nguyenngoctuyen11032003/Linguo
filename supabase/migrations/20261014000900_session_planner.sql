-- Linguo spec 6 §3: study sessions for the session planner.
-- The plan itself is built client-side by the pure planner (packages/shared/src/planner/plan.ts); the server
-- supplies its inputs, validates and stores the plan, and tracks progress. JSON shapes match
-- packages/shared/src/planner/contract.ts. Errors: 42501 not_authenticated, otherwise P0001 with a
-- SESSION_ERROR_CODES message.
--
-- "Today" is public.learning_user_today(user) (profiles.timezone), as in specs 1–3.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  local_date date not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'abandoned')),
  minutes_planned integer not null check (minutes_planned between 5 and 120),
  -- sessionPlanSchema, normalised by public.session_plan_normalize.
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 32768),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  -- Set when the session is closed (completed or abandoned).
  completed_at timestamptz,
  constraint study_sessions_closed_shape check ((status in ('completed', 'abandoned')) = (completed_at is not null))
);

comment on table public.study_sessions is 'Spec 6 study sessions. Written only by the session planner RPCs; at most one planned/in_progress session per path and local day.';

create unique index study_sessions_one_open on public.study_sessions (path_id, local_date) where status in ('planned', 'in_progress');
create index study_sessions_user_date_idx on public.study_sessions (user_id, local_date desc);
create index study_sessions_path_date_idx on public.study_sessions (path_id, local_date desc);

alter table public.study_sessions enable row level security;

create policy "study sessions: read own" on public.study_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.study_sessions from anon, authenticated;
grant select on public.study_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- studySessionSchema. Takes the id (not a study_sessions row) so that PostgREST and the type generator do not
-- expose it as a computed column.
create or replace function public.study_session_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'path_id', s.path_id,
    'local_date', to_char(s.local_date, 'YYYY-MM-DD'),
    'status', s.status,
    'minutes_planned', s.minutes_planned,
    'plan', s.plan,
    'created_at', s.created_at,
    'started_at', s.started_at,
    'completed_at', s.completed_at
  )
  from public.study_sessions s
  where s.id = p_id;
$$;

-- Seconds logged in the session items of a path on a local day (every session of that day).
create or replace function public.session_seconds_on(p_user uuid, p_path_id uuid, p_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(least((e ->> 'seconds_spent')::bigint, 2147483647)), 0)::integer
  from public.study_sessions s
  cross join lateral jsonb_array_elements(s.plan -> 'activities') as e
  where s.user_id = p_user and s.path_id = p_path_id and s.local_date = p_date;
$$;

-- true when p is a JSON integer in [p_min, p_max].
create or replace function public.session_json_int(p jsonb, p_min bigint, p_max bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'number'
    then (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric) and (p #>> '{}')::numeric between p_min and p_max
    else false end;
$$;

-- true when p is a JSON string of p_min..p_max characters.
create or replace function public.session_json_text(p jsonb, p_min integer, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'string' then char_length(p #>> '{}') between p_min and p_max else false end;
$$;

-- Validates a sessionPlanSchema for the caller's path and returns it with only the contract keys. Rules
-- (spec §3): 1–12 activities, unique ids a<n>, known kind/status, total minutes <= 130, lesson/practice need a
-- published lesson of the path (path_lessons: path language, path programs), review/recap have no lesson,
-- review_limit only on review. Raises invalid_plan. Relies on auth.uid() through path_lessons.
create or replace function public.session_plan_normalize(p_path_id uuid, p_plan jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_allowed uuid[];
  v_a jsonb;
  v_ids text[] := '{}'::text[];
  v_acts jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_kind text;
  v_lesson uuid;
  v_limit integer;
  v_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or octet_length(p_plan::text) > 32768
     or not public.session_json_int(p_plan -> 'minutes', 5, 120)
     or not public.session_json_text(p_plan -> 'focus_vi', 1, 160)
     or coalesce(jsonb_typeof(p_plan -> 'backlog_mode'), '') <> 'boolean'
     or coalesce(jsonb_typeof(p_plan -> 'activities'), '') <> 'array'
     or jsonb_array_length(p_plan -> 'activities') not between 1 and 12 then
    raise exception using errcode = 'P0001', message = 'invalid_plan';
  end if;

  v_allowed := array(select pl.lesson_id from public.path_lessons(p_path_id) as pl);

  for v_a in select e from jsonb_array_elements(p_plan -> 'activities') as e loop
    if jsonb_typeof(v_a) <> 'object'
       or coalesce(jsonb_typeof(v_a -> 'id'), '') <> 'string'
       or (v_a ->> 'id') !~ '^a[0-9]{1,2}$'
       or (v_a ->> 'id') = any (v_ids)
       or coalesce(jsonb_typeof(v_a -> 'kind'), '') <> 'string'
       or (v_a ->> 'kind') not in ('review', 'lesson', 'practice', 'recap')
       or coalesce(jsonb_typeof(v_a -> 'status'), '') <> 'string'
       or (v_a ->> 'status') not in ('pending', 'done', 'skipped')
       or not public.session_json_int(v_a -> 'minutes', 1, 120)
       or not public.session_json_text(v_a -> 'title_vi', 1, 120)
       or not public.session_json_text(v_a -> 'reason_vi', 1, 200)
       or not public.session_json_int(v_a -> 'priority', 0, 100)
       or not public.session_json_int(v_a -> 'seconds_spent', 0, 2147483647) then
      raise exception using errcode = 'P0001', message = 'invalid_plan';
    end if;
    v_kind := v_a ->> 'kind';

    if v_kind in ('lesson', 'practice') then
      if coalesce(jsonb_typeof(v_a -> 'lesson_id'), '') <> 'string' or (v_a ->> 'lesson_id') !~ v_uuid_re then
        raise exception using errcode = 'P0001', message = 'invalid_plan';
      end if;
      v_lesson := (v_a ->> 'lesson_id')::uuid;
      if not v_lesson = any (v_allowed) then
        raise exception using errcode = 'P0001', message = 'invalid_plan';
      end if;
    elsif coalesce(jsonb_typeof(v_a -> 'lesson_id'), 'null') <> 'null' then
      raise exception using errcode = 'P0001', message = 'invalid_plan';
    else
      v_lesson := null;
    end if;

    if coalesce(jsonb_typeof(v_a -> 'review_limit'), 'null') = 'null' then
      v_limit := null;
    elsif v_kind <> 'review' or not public.session_json_int(v_a -> 'review_limit', 1, 500) then
      raise exception using errcode = 'P0001', message = 'invalid_plan';
    else
      v_limit := (v_a ->> 'review_limit')::integer;
    end if;

    v_ids := v_ids || (v_a ->> 'id');
    v_total := v_total + (v_a ->> 'minutes')::integer;
    v_acts := v_acts || jsonb_build_array(jsonb_build_object(
      'id', v_a ->> 'id',
      'kind', v_kind,
      'minutes', (v_a ->> 'minutes')::integer,
      'lesson_id', v_lesson,
      'review_limit', v_limit,
      'title_vi', v_a ->> 'title_vi',
      'reason_vi', v_a ->> 'reason_vi',
      'priority', (v_a ->> 'priority')::integer,
      'status', v_a ->> 'status',
      'seconds_spent', (v_a ->> 'seconds_spent')::integer
    ));
  end loop;

  if v_total > 130 then
    raise exception using errcode = 'P0001', message = 'invalid_plan';
  end if;

  return jsonb_build_object(
    'minutes', (p_plan ->> 'minutes')::integer,
    'activities', v_acts,
    'focus_vi', p_plan ->> 'focus_vi',
    'backlog_mode', (p_plan ->> 'backlog_mode')::boolean
  );
end;
$$;

-- Prompt text of a public exercise prompt (blanks shown as ___).
create or replace function public.session_prompt_text(p_type text, p_prompt jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'mcq' then p_prompt ->> 'stem'
    when 'fill_blank' then regexp_replace(p_prompt ->> 'template', '\{\{[a-z0-9_-]+\}\}', '___', 'g')
    when 'word_bank' then p_prompt ->> 'instruction'
    when 'translate' then p_prompt ->> 'source_text'
    when 'listen' then p_prompt ->> 'fallback_text'
  end;
$$;

-- The learner's response as text: chosen option text, typed text, tokens in order, or the template with the
-- typed blanks. Null for a give-up.
create or replace function public.session_answer_text(p_type text, p_prompt jsonb, p_response jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
  v_blank record;
begin
  if p_response is null or p_response ? 'give_up' then
    return null;
  end if;
  if p_type in ('mcq', 'listen') then
    select o ->> 'text' into v_text
    from jsonb_array_elements(p_prompt -> 'options') as o
    where o ->> 'id' = p_response ->> 'option_id';
    return v_text;
  elsif p_type = 'translate' then
    return p_response ->> 'text';
  elsif p_type = 'word_bank' then
    select string_agg(tk ->> 'text', ' ' order by t.o) into v_text
    from jsonb_array_elements_text(p_response -> 'token_ids') with ordinality as t(id, o)
    join jsonb_array_elements(p_prompt -> 'tokens') as tk on tk ->> 'id' = t.id;
    return v_text;
  elsif p_type = 'fill_blank' then
    v_text := p_prompt ->> 'template';
    for v_blank in select b.key, b.value from jsonb_each_text(p_response -> 'blanks') as b loop
      v_text := replace(v_text, '{{' || v_blank.key || '}}', v_blank.value);
    end loop;
    return regexp_replace(v_text, '\{\{[a-z0-9_-]+\}\}', '___', 'g');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- sessionInputsSchema for the caller's active path.
create or replace function public.get_session_inputs(p_path_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_now timestamptz := now();
  v_tz text;
  v_today date;
  v_totals jsonb;
  v_overdue integer;
  v_next jsonb;
  v_skills jsonb;
  v_last date;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_path := public.review_path_for_user(v_uid, p_path_id, true);
  v_today := public.learning_user_today(v_uid);
  v_totals := public.review_day_totals(v_uid, v_path.id, v_path.weekly_minutes, false, v_now);
  v_tz := v_totals ->> 'tz';

  -- Items (as in due_count) with a non-new card due before the local day began.
  select count(distinct c.learning_item_id)::integer into v_overdue
  from public.review_cards c
  join public.learning_items i on i.id = c.learning_item_id and i.status = 'published'
  where c.user_id = v_uid and c.learning_path_id = v_path.id and c.suspended_at is null
    and c.fsrs_state <> 'new' and c.due_at < (v_totals ->> 'day_start')::timestamptz;

  -- Up to 5 unlocked, not completed lessons in path order.
  select coalesce(jsonb_agg(jsonb_build_object(
      'lesson_id', n.lesson_id,
      'title_vi', n.title ->> 'vi',
      'estimated_minutes', n.estimated_minutes,
      'skills', to_jsonb(n.skills),
      'run_status', n.run_status,
      'unit_order', n.unit_order,
      'lesson_order', n.lesson_order
    ) order by n.ord), '[]'::jsonb)
    into v_next
  from (
    select pl.lesson_id, pl.title, pl.estimated_minutes, l.skills, pl.run_status, pl.unit_order, pl.lesson_order, pl.ord
    from public.path_lessons(v_path.id) with ordinality as pl(
      lesson_id, lesson_key, program_id, program_title, unit_id, unit_title, unit_order, lesson_order, title, level_code,
      estimated_minutes, is_demo, prerequisite_ids, prerequisites_met, run_status, ord)
    join public.lessons l on l.id = pl.lesson_id
    where pl.prerequisites_met and pl.run_status <> 'completed'
    order by pl.ord
    limit 5
  ) as n;

  -- Latest estimate per skill; recent_accuracy over the last 14 days of attempts made before the answer was
  -- revealed, per skill of the attempted lesson (null below 5 attempts). Weakest first.
  with est as (
    select distinct on (se.skill) se.skill, se.level_code, se.confidence
    from public.skill_estimates se
    where se.learning_path_id = v_path.id
    order by se.skill, se.assessed_at desc, (se.source = 'self_report')
  ),
  acc as (
    select s.skill, count(*) as n, avg(case when a.is_correct then 1.0 else 0.0 end) as accuracy
    from public.attempts a
    join public.lessons l on l.id = a.lesson_id
    cross join lateral unnest(l.skills) as s(skill)
    where a.user_id = v_uid and a.learning_path_id = v_path.id and a.created_at >= v_now - interval '14 days' and not a.after_reveal
    group by s.skill
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'skill', e.skill,
      'level_code', e.level_code,
      'confidence', e.confidence,
      'recent_accuracy', case when acc.n >= 5 then round(acc.accuracy, 4)::double precision end
    ) order by case when acc.n >= 5 then acc.accuracy end asc nulls last,
      array_position(array['self_reported', 'low', 'medium', 'high'], e.confidence), e.skill), '[]'::jsonb)
    into v_skills
  from est as e
  left join acc on acc.skill = e.skill;

  select max(d) into v_last
  from (
    select (r.completed_at at time zone v_tz)::date as d
    from public.lesson_runs r
    where r.user_id = v_uid and r.learning_path_id = v_path.id and r.status = 'completed'
    union all
    select l.local_day
    from public.review_logs l
    where l.user_id = v_uid and l.learning_path_id = v_path.id and l.kind = 'grade'
    union all
    select s.local_date
    from public.study_sessions s
    where s.user_id = v_uid and s.path_id = v_path.id and s.started_at is not null
  ) as x;

  return jsonb_build_object(
    'path_id', v_path.id,
    'language_code', v_path.language_code,
    'local_date', to_char(v_today, 'YYYY-MM-DD'),
    'daily_goal_minutes', coalesce(v_path.weekly_minutes[extract(isodow from v_today)::integer], 0),
    'studied_seconds_today', public.session_seconds_on(v_uid, v_path.id, v_today),
    'due_count', (v_totals ->> 'due_total')::integer,
    'overdue_count', v_overdue,
    'new_card_count', (v_totals ->> 'new_available')::integer,
    'next_lessons', v_next,
    'skills', v_skills,
    'days_since_last_study', case when v_last is not null then greatest(0, v_today - v_last) end
  );
end;
$$;

-- Stores a plan as today's session. With an open session today: p_replace=false returns it unchanged,
-- p_replace=true abandons it and stores the new plan.
create or replace function public.save_session_plan(p_path_id uuid, p_plan jsonb, p_replace boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_plan jsonb;
  v_today date;
  v_open uuid;
  v_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_path := public.review_path_for_user(v_uid, p_path_id, true);
  -- Serialises concurrent saves on the path.
  perform 1 from public.learning_paths where id = v_path.id for update;
  v_plan := public.session_plan_normalize(v_path.id, p_plan);
  v_today := public.learning_user_today(v_uid);

  select s.id into v_open
  from public.study_sessions s
  where s.path_id = v_path.id and s.local_date = v_today and s.status in ('planned', 'in_progress')
  for update;
  if v_open is not null then
    if not coalesce(p_replace, false) then
      return public.study_session_json(v_open);
    end if;
    update public.study_sessions set status = 'abandoned', completed_at = v_now where id = v_open;
  end if;

  insert into public.study_sessions (user_id, path_id, local_date, status, minutes_planned, plan, created_at)
  values (v_uid, v_path.id, v_today, 'planned', (v_plan ->> 'minutes')::integer, v_plan, v_now)
  returning id into v_id;
  return public.study_session_json(v_id);
end;
$$;

-- todaySessionResultSchema: today's open session, else the latest one of today, else null.
create or replace function public.get_today_session(p_path_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_today date;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_path := public.review_path_for_user(v_uid, p_path_id, false);
  v_today := public.learning_user_today(v_uid);

  select s.id into v_id
  from public.study_sessions s
  where s.user_id = v_uid and s.path_id = v_path.id and s.local_date = v_today
  order by (s.status in ('planned', 'in_progress')) desc, s.created_at desc, s.id
  limit 1;

  return jsonb_build_object(
    'session', case when v_id is null then 'null'::jsonb else public.study_session_json(v_id) end,
    'studied_seconds_today', public.session_seconds_on(v_uid, v_path.id, v_today),
    'daily_goal_minutes', coalesce(v_path.weekly_minutes[extract(isodow from v_today)::integer], 0)
  );
end;
$$;

-- Sets one activity's status and adds p_seconds (clamped to 0..7200) to it. The first update starts the
-- session; once no activity is pending the session is completed.
create or replace function public.update_session_item(p_session_id uuid, p_item_id text, p_status text, p_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.study_sessions;
  v_secs integer := greatest(0, least(7200, coalesce(p_seconds, 0)));
  v_acts jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select s.* into v_s from public.study_sessions s where s.id = p_session_id and s.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  if v_s.status in ('completed', 'abandoned') then
    raise exception using errcode = 'P0001', message = 'session_closed';
  end if;
  if p_status is null or p_status not in ('pending', 'done', 'skipped') then
    raise exception using errcode = 'P0001', message = 'invalid_plan';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_s.plan -> 'activities') as e where e ->> 'id' = p_item_id) then
    raise exception using errcode = 'P0001', message = 'item_not_found';
  end if;

  select jsonb_agg(case when e ->> 'id' = p_item_id
      then e || jsonb_build_object('status', p_status,
        'seconds_spent', least(2147483647, (e ->> 'seconds_spent')::bigint + v_secs))
      else e end order by o)
    into v_acts
  from jsonb_array_elements(v_s.plan -> 'activities') with ordinality as t(e, o);

  update public.study_sessions
  set plan = jsonb_set(plan, '{activities}', v_acts),
      status = case
        when not exists (select 1 from jsonb_array_elements(v_acts) as e where e ->> 'status' = 'pending') then 'completed'
        else 'in_progress' end,
      started_at = coalesce(started_at, v_now),
      completed_at = case
        when not exists (select 1 from jsonb_array_elements(v_acts) as e where e ->> 'status' = 'pending') then v_now end
  where id = v_s.id;
  return public.study_session_json(v_s.id);
end;
$$;

-- Reorders the activities; p_order must be a permutation of the current activity ids.
create or replace function public.reorder_session(p_session_id uuid, p_order text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.study_sessions;
  v_acts jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select s.* into v_s from public.study_sessions s where s.id = p_session_id and s.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  if v_s.status in ('completed', 'abandoned') then
    raise exception using errcode = 'P0001', message = 'session_closed';
  end if;
  if p_order is null
     or coalesce(array_ndims(p_order), 1) <> 1
     or cardinality(p_order) <> jsonb_array_length(v_s.plan -> 'activities')
     or array_position(p_order, null) is not null
     or (select count(distinct x) from unnest(p_order) as x) <> cardinality(p_order)
     or exists (
       select 1 from jsonb_array_elements(v_s.plan -> 'activities') as e
       where not (e ->> 'id') = any (p_order)
     ) then
    raise exception using errcode = 'P0001', message = 'invalid_order';
  end if;

  select jsonb_agg(e order by array_position(p_order, e ->> 'id')) into v_acts
  from jsonb_array_elements(v_s.plan -> 'activities') as e;

  update public.study_sessions set plan = jsonb_set(plan, '{activities}', v_acts) where id = v_s.id;
  return public.study_session_json(v_s.id);
end;
$$;

-- Closes the session as completed or abandoned. Repeating the status it already has returns it unchanged.
create or replace function public.finish_session(p_session_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.study_sessions;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select s.* into v_s from public.study_sessions s where s.id = p_session_id and s.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  if p_status is null or p_status not in ('completed', 'abandoned') then
    raise exception using errcode = 'P0001', message = 'invalid_plan';
  end if;
  if v_s.status = p_status then
    return public.study_session_json(v_s.id);
  end if;
  if v_s.status in ('completed', 'abandoned') then
    raise exception using errcode = 'P0001', message = 'session_closed';
  end if;

  update public.study_sessions set status = p_status, completed_at = clock_timestamp() where id = v_s.id;
  return public.study_session_json(v_s.id);
end;
$$;

-- Mistakes for the recap activity: the latest incorrect attempt per exercise on the session's path during the
-- session's local day, newest first, at most 10. expected_answer is the display_answer the lesson player
-- already showed (an attempt of the same exercise version that revealed it), else null.
create or replace function public.session_recap(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.study_sessions;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select s.* into v_s from public.study_sessions s where s.id = p_session_id and s.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  select coalesce(p.timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.profiles p where p.id = v_uid;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_start := v_s.local_date::timestamp at time zone v_tz;
  v_end := (v_s.local_date + 1)::timestamp at time zone v_tz;

  select coalesce(jsonb_agg(r.j order by r.created_at desc, r.id), '[]'::jsonb) into v_result
  from (
    select w.id, w.created_at, w.j
    from (
      select distinct on (a.exercise_id) a.id, a.created_at, jsonb_build_object(
          'attempt_id', a.id,
          'lesson_id', a.lesson_id,
          'exercise_id', a.exercise_id,
          'exercise_type', a.exercise_type,
          'prompt_text', public.session_prompt_text(e.exercise_type, e.prompt),
          'expected_answer', (
            select v.feedback_json ->> 'display_answer'
            from public.attempts v
            where v.user_id = v_uid and v.exercise_id = a.exercise_id and v.exercise_version = a.exercise_version and v.revealed
            order by v.created_at desc
            limit 1),
          'learner_answer', public.session_answer_text(e.exercise_type, e.prompt, a.response_json),
          'created_at', a.created_at
        ) as j
      from public.attempts a
      join public.exercises e on e.id = a.exercise_id and e.status = 'published'
      where a.user_id = v_uid and a.learning_path_id = v_s.path_id and a.verdict = 'incorrect'
        and a.created_at >= v_start and a.created_at < v_end
      order by a.exercise_id, a.created_at desc, a.id
    ) as w
    order by w.created_at desc, w.id
    limit 10
  ) as r;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.study_session_json(uuid) from public, anon, authenticated;
revoke all on function public.session_seconds_on(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.session_json_int(jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function public.session_json_text(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.session_plan_normalize(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.session_prompt_text(text, jsonb) from public, anon, authenticated;
revoke all on function public.session_answer_text(text, jsonb, jsonb) from public, anon, authenticated;

revoke all on function public.get_session_inputs(uuid) from public, anon;
revoke all on function public.save_session_plan(uuid, jsonb, boolean) from public, anon;
revoke all on function public.get_today_session(uuid) from public, anon;
revoke all on function public.update_session_item(uuid, text, text, integer) from public, anon;
revoke all on function public.reorder_session(uuid, text[]) from public, anon;
revoke all on function public.finish_session(uuid, text) from public, anon;
revoke all on function public.session_recap(uuid) from public, anon;
grant execute on function public.get_session_inputs(uuid) to authenticated;
grant execute on function public.save_session_plan(uuid, jsonb, boolean) to authenticated;
grant execute on function public.get_today_session(uuid) to authenticated;
grant execute on function public.update_session_item(uuid, text, text, integer) to authenticated;
grant execute on function public.reorder_session(uuid, text[]) to authenticated;
grant execute on function public.finish_session(uuid, text) to authenticated;
grant execute on function public.session_recap(uuid) to authenticated;
