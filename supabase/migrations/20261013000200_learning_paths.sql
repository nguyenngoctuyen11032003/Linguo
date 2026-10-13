-- Linguo spec 1: reference hours, learning paths, self-reported skill estimates and write RPCs.
-- Clients read through RLS and write only through the SECURITY DEFINER functions below.

-- ---------------------------------------------------------------------------
-- Reference hours (seeded, unreviewed)
-- ---------------------------------------------------------------------------
create table public.level_reference_hours (
  language_code text not null check (language_code in ('en', 'ko')),
  level_code text not null,
  ordinal smallint not null check (ordinal >= 0),
  cumulative_hours integer not null check (cumulative_hours >= 0),
  source text not null,
  reviewed boolean not null default false,
  primary key (language_code, level_code),
  unique (language_code, ordinal)
);

comment on table public.level_reference_hours is 'Cumulative study hours per level used for time estimates. Seed values are unreviewed references.';

insert into public.level_reference_hours (language_code, level_code, ordinal, cumulative_hours, source) values
  ('en', 'pre_a1', 0, 0, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'a1', 1, 90, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'a2', 2, 190, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'b1', 3, 375, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'b2', 4, 575, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'c1', 5, 775, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('en', 'c2', 6, 1100, 'Cambridge English guided learning hours (midpoints) — chưa kiểm duyệt'),
  ('ko', 'hangul', 0, 0, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik1', 1, 120, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik2', 2, 300, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik3', 3, 650, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik4', 4, 1000, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik5', 5, 1500, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ko', 'topik6', 6, 2200, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt');

-- ---------------------------------------------------------------------------
-- Learning paths
-- ---------------------------------------------------------------------------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  language_code text not null check (language_code in ('en', 'ko')),
  start_point text not null check (start_point in ('new', 'some', 'rusty', 'confident', 'unsure')),
  goal_type text not null,
  current_level text not null,
  target_level text not null,
  weekly_minutes smallint[] not null,
  target_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  estimate jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_paths_goal_matches_language check (
    (language_code = 'en' and goal_type in ('foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'))
    or (language_code = 'ko' and goal_type in ('hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'))
  ),
  constraint learning_paths_weekly_minutes_shape check (coalesce(array_ndims(weekly_minutes), 0) = 1 and array_length(weekly_minutes, 1) = 7 and 0 <= all (weekly_minutes) and 720 >= all (weekly_minutes)),
  constraint learning_paths_current_level_fk foreign key (language_code, current_level) references public.level_reference_hours (language_code, level_code),
  constraint learning_paths_target_level_fk foreign key (language_code, target_level) references public.level_reference_hours (language_code, level_code)
);

create unique index learning_paths_one_open_per_language on public.learning_paths (user_id, language_code) where status <> 'archived';
create index learning_paths_user_id_idx on public.learning_paths (user_id);

create trigger learning_paths_set_updated_at
  before update on public.learning_paths
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Skill estimates (self-reported now; diagnostics in spec 4)
-- ---------------------------------------------------------------------------
create table public.skill_estimates (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  skill text not null check (skill in ('vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking')),
  level_code text not null,
  confidence text not null check (confidence in ('self_reported', 'low', 'medium', 'high')),
  sample_size integer not null default 0 check (sample_size >= 0),
  source text not null check (source in ('self_report', 'diagnostic', 'assessment')),
  assessed_at timestamptz not null default now(),
  unique (learning_path_id, skill, source)
);

comment on column public.skill_estimates.level_code is 'Level code within the path''s language. Validated by the RPCs; there is no composite FK because this table has no language column.';

alter table public.profiles
  add column current_learning_path_id uuid references public.learning_paths (id) on delete set null;

create index profiles_current_learning_path_id_idx on public.profiles (current_learning_path_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.level_reference_hours enable row level security;
alter table public.learning_paths enable row level security;
alter table public.skill_estimates enable row level security;

create policy "reference hours: readable by everyone" on public.level_reference_hours
  for select to anon, authenticated using (true);
create policy "learning paths: read own" on public.learning_paths
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "skill estimates: read own" on public.skill_estimates
  for select to authenticated using (
    exists (select 1 from public.learning_paths p where p.id = learning_path_id and p.user_id = (select auth.uid()))
  );

revoke all on public.level_reference_hours, public.learning_paths, public.skill_estimates from anon, authenticated;
grant select on public.level_reference_hours to anon, authenticated;
grant select on public.learning_paths, public.skill_estimates to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.learning_user_today(p_user uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce((select p.timezone from public.profiles p where p.id = p_user), 'Asia/Ho_Chi_Minh'))::date;
$$;

create or replace function public.learning_path_validate(
  p_language text, p_goal_type text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date, p_today date
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cur smallint;
  v_tgt smallint;
begin
  if p_language is null or p_language not in ('en', 'ko') then
    raise exception using errcode = 'P0001', message = 'invalid_language';
  end if;
  if p_goal_type is null or not (
    (p_language = 'en' and p_goal_type in ('foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'))
    or (p_language = 'ko' and p_goal_type in ('hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_goal_for_language';
  end if;
  select ordinal into v_cur from public.level_reference_hours where language_code = p_language and level_code = p_current_level;
  select ordinal into v_tgt from public.level_reference_hours where language_code = p_language and level_code = p_target_level;
  if v_cur is null or v_tgt is null then
    raise exception using errcode = 'P0001', message = 'invalid_level';
  end if;
  if v_tgt <= v_cur then
    raise exception using errcode = 'P0001', message = 'target_not_above_current';
  end if;
  if (p_goal_type = 'topik_i' and p_target_level not in ('topik1', 'topik2'))
     or (p_goal_type = 'topik_ii' and p_target_level not in ('topik3', 'topik4', 'topik5', 'topik6')) then
    raise exception using errcode = 'P0001', message = 'target_not_allowed_for_goal';
  end if;
  if p_weekly_minutes is null
     or coalesce(array_ndims(p_weekly_minutes), 0) <> 1
     or coalesce(array_length(p_weekly_minutes, 1), 0) <> 7
     or exists (select 1 from unnest(p_weekly_minutes) as m where m is null or m < 0 or m > 720)
     or (select sum(m) from unnest(p_weekly_minutes) as m) <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_schedule';
  end if;
  if p_target_date is not null and p_target_date < p_today then
    raise exception using errcode = 'P0001', message = 'target_date_in_past';
  end if;
  if p_target_date is not null and p_target_date > p_today + 3650 then
    raise exception using errcode = 'P0001', message = 'target_date_too_far';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estimate (mirror of packages/shared/src/learning/estimate.ts; checked by generated pgTAP fixtures)
-- ---------------------------------------------------------------------------
create or replace function public.estimate_learning_path(
  p_language text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date, p_today date
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cur integer;
  v_tgt integer;
  v_reviewed boolean;
  v_hours integer;
  v_weekly integer;
  v_active integer;
  v_mid integer;
  v_min integer;
  v_max integer;
  v_avail integer;
  v_feasibility text := 'no_deadline';
  v_suggested_minutes integer;
  v_suggested_date date;
begin
  if p_target_date is not null and p_today is null then
    raise exception using errcode = 'P0001', message = 'invalid_date';
  end if;
  select cumulative_hours into v_cur from public.level_reference_hours where language_code = p_language and level_code = p_current_level;
  select cumulative_hours into v_tgt from public.level_reference_hours where language_code = p_language and level_code = p_target_level;
  if v_cur is null or v_tgt is null then
    raise exception using errcode = 'P0001', message = 'invalid_level';
  end if;
  select bool_and(reviewed) into v_reviewed
    from public.level_reference_hours
    where language_code = p_language and level_code in (p_current_level, p_target_level);

  select coalesce(sum(m), 0), count(*) filter (where m > 0) into v_weekly, v_active from unnest(p_weekly_minutes) as m;
  if v_weekly <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_schedule';
  end if;

  v_hours := greatest(0, v_tgt - v_cur);
  v_mid := ceil((v_hours * 60)::numeric / v_weekly);
  v_min := ceil((v_mid * 4)::numeric / 5);
  v_max := ceil((v_mid * 13)::numeric / 10);

  if p_target_date is not null then
    v_avail := floor((p_target_date - p_today)::numeric / 7);
    if v_avail >= v_max then
      v_feasibility := 'feasible';
    elsif v_avail >= v_mid then
      v_feasibility := 'tight';
    else
      v_feasibility := 'needs_more_time';
      v_suggested_minutes := least(720, ceil((v_hours * 60)::numeric / (greatest(v_avail, 1) * greatest(v_active, 1))));
      v_suggested_date := p_today + v_mid * 7;
    end if;
  end if;

  return jsonb_build_object(
    'hours_needed', v_hours,
    'weeks_min', v_min,
    'weeks_mid', v_mid,
    'weeks_max', v_max,
    'feasibility', v_feasibility,
    'suggested_minutes_per_day', v_suggested_minutes,
    'suggested_date', v_suggested_date,
    'assumptions', jsonb_build_object(
      'weekly_minutes', v_weekly,
      'hours_needed', v_hours,
      'reference_reviewed', coalesce(v_reviewed, false),
      'multiplier_range', jsonb_build_array(0.8, 1.3)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_learning_path(
  p_language text, p_start_point text, p_goal_type text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date default null
)
returns public.learning_paths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_path public.learning_paths;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  if p_start_point is null or p_start_point not in ('new', 'some', 'rusty', 'confident', 'unsure') then
    raise exception using errcode = 'P0001', message = 'invalid_start_point';
  end if;
  v_today := public.learning_user_today(v_uid);
  perform public.learning_path_validate(p_language, p_goal_type, p_current_level, p_target_level, p_weekly_minutes, p_target_date, v_today);

  begin
    insert into public.learning_paths (
      user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, target_date, estimate
    ) values (
      v_uid, p_language, p_start_point, p_goal_type, p_current_level, p_target_level, p_weekly_minutes, p_target_date,
      public.estimate_learning_path(p_language, p_current_level, p_target_level, p_weekly_minutes, p_target_date, v_today)
    )
    returning * into v_path;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'path_exists_for_language';
  end;

  insert into public.skill_estimates (learning_path_id, skill, level_code, confidence, sample_size, source)
  select v_path.id, s, p_current_level, 'self_reported', 0, 'self_report'
  from unnest(array['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking']) as s;

  update public.profiles set current_learning_path_id = v_path.id where id = v_uid;
  return v_path;
end;
$$;

create or replace function public.set_current_learning_path(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not exists (select 1 from public.learning_paths where id = p_id and user_id = v_uid and status <> 'archived' for share) then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  update public.profiles set current_learning_path_id = p_id where id = v_uid;
end;
$$;

create or replace function public.update_learning_path_plan(
  p_id uuid, p_goal_type text, p_target_level text, p_weekly_minutes smallint[], p_target_date date default null
)
returns public.learning_paths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_path public.learning_paths;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select * into v_path from public.learning_paths where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  if v_path.status not in ('active', 'paused') then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;
  v_today := public.learning_user_today(v_uid);
  perform public.learning_path_validate(v_path.language_code, p_goal_type, v_path.current_level, p_target_level, p_weekly_minutes, p_target_date, v_today);

  update public.learning_paths
  set goal_type = p_goal_type,
      target_level = p_target_level,
      weekly_minutes = p_weekly_minutes,
      target_date = p_target_date,
      estimate = public.estimate_learning_path(v_path.language_code, v_path.current_level, p_target_level, p_weekly_minutes, p_target_date, v_today)
  where id = p_id
  returning * into v_path;
  return v_path;
end;
$$;

comment on function public.update_learning_path_plan(uuid, text, text, smallint[], date) is 'Replaces the plan of an active or paused path. Omitting p_target_date (null) clears the deadline: null means no deadline.';

create or replace function public.set_learning_path_status(p_id uuid, p_status text)
returns public.learning_paths
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_next uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = v_uid for update;
  select * into v_path from public.learning_paths where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  if not (
    (v_path.status = 'active' and p_status in ('paused', 'completed', 'archived'))
    or (v_path.status = 'paused' and p_status in ('active', 'archived'))
    or (v_path.status = 'completed' and p_status = 'archived')
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;

  update public.learning_paths set status = p_status where id = p_id returning * into v_path;

  if p_status = 'archived' and (select current_learning_path_id from public.profiles where id = v_uid) = p_id then
    select id into v_next
    from public.learning_paths
    where user_id = v_uid and status <> 'archived'
    order by (status = 'active') desc, (status = 'paused') desc, updated_at desc, created_at desc
    limit 1;
    update public.profiles set current_learning_path_id = v_next where id = v_uid;
  end if;
  return v_path;
end;
$$;

-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
revoke all on function public.learning_user_today(uuid) from public, anon, authenticated;
revoke all on function public.learning_path_validate(text, text, text, text, smallint[], date, date) from public, anon, authenticated;
revoke all on function public.estimate_learning_path(text, text, text, smallint[], date, date) from public, anon;
revoke all on function public.create_learning_path(text, text, text, text, text, smallint[], date) from public, anon;
revoke all on function public.set_current_learning_path(uuid) from public, anon;
revoke all on function public.update_learning_path_plan(uuid, text, text, smallint[], date) from public, anon;
revoke all on function public.set_learning_path_status(uuid, text) from public, anon;
grant execute on function public.estimate_learning_path(text, text, text, smallint[], date, date) to authenticated;
grant execute on function public.create_learning_path(text, text, text, text, text, smallint[], date) to authenticated;
grant execute on function public.set_current_learning_path(uuid) to authenticated;
grant execute on function public.update_learning_path_plan(uuid, text, text, smallint[], date) to authenticated;
grant execute on function public.set_learning_path_status(uuid, text) to authenticated;
