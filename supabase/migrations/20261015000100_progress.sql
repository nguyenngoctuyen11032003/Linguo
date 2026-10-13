-- Linguo spec 8 §2: activity days, XP, calendar streak, weekly challenge, badges and the progress dashboard.
-- Numbers mirror packages/shared/src/progress/contract.ts (XP_RULES, STREAK_RULES, ACTIVE_MS_CAP_PER_ANSWER,
-- BADGE_KEYS, MIN_ACCURACY_SAMPLE) and the jsonb returned by get_progress_dashboard matches
-- progressDashboardSchema. supabase/tests/progress.test.sql asserts them.
--
-- activity_days is maintained only by the AFTER triggers below (attempts, review_logs, lesson_runs); clients
-- read their own rows through RLS. user_badges is written only by get_progress_dashboard.
-- Day model: the learner's local date in profiles.timezone (as public.learning_user_today). An answer counts
-- on the local day of coalesce(client_at, created_at), clamped to [server day - 7, server day] where the server
-- day is the local day of created_at, so offline replays land on the day they happened but a skewed client
-- clock can neither back-date an answer by more than a week nor push it into the future.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  local_day date not null,
  -- Sum of min(response_ms, 120000) over answers and graded reviews.
  active_ms bigint not null default 0 check (active_ms >= 0),
  answers integer not null default 0 check (answers >= 0),
  -- First attempts judged correct (not almost) without a reveal.
  correct_first integer not null default 0 check (correct_first >= 0),
  lessons integer not null default 0 check (lessons >= 0),
  reviews integer not null default 0 check (reviews >= 0),
  -- Daily cap XP_RULES.daily_cap.
  xp integer not null default 0 check (xp between 0 and 300),
  updated_at timestamptz not null default now(),
  primary key (user_id, learning_path_id, local_day)
);

create index activity_days_learning_path_id_idx on public.activity_days (learning_path_id);
comment on table public.activity_days is 'Per learner-local day and path: active time, answers, lessons, reviews and XP; written by triggers only.';

create table public.user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  badge_key text not null check (badge_key in (
    'first_lesson', 'lessons_10', 'lessons_50', 'reviews_100', 'reviews_1000', 'mastered_25', 'mastered_100',
    'streak_7', 'streak_30', 'diagnostic_done', 'weekly_challenge_4',
    'skill_vocabulary', 'skill_grammar', 'skill_reading', 'skill_listening', 'skill_writing', 'skill_speaking'
  )),
  earned_at timestamptz not null default now(),
  primary key (user_id, learning_path_id, badge_key)
);

create index user_badges_learning_path_id_idx on public.user_badges (learning_path_id);
comment on table public.user_badges is 'Badges earned per path (catalogue in packages/shared/src/progress/contract.ts); awarded by get_progress_dashboard.';

-- Motivation layer and analytics consent, edited by the learner through the column UPDATE grant below.
alter table public.user_preferences
  add column show_motivation boolean not null default true,
  add column analytics_opt_out boolean not null default false;

alter table public.activity_days enable row level security;
alter table public.user_badges enable row level security;

create policy "activity days: read own" on public.activity_days
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user badges: read own" on public.user_badges
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.activity_days, public.user_badges from public, anon, authenticated;
grant select on public.activity_days, public.user_badges to authenticated;
grant update (show_motivation, analytics_opt_out) on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Local day of an answer: coalesce(client_at, created_at) in the learner's time zone, clamped to
-- [local day of created_at - 7, local day of created_at].
create or replace function public.progress_answer_day(p_user uuid, p_client_at timestamptz, p_created_at timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_server date;
  v_day date;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_user;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_server := (p_created_at at time zone v_tz)::date;
  v_day := (coalesce(p_client_at, p_created_at) at time zone v_tz)::date;
  return greatest(v_server - 7, least(v_server, v_day));
end;
$$;

-- Local day of an instant in the learner's time zone.
create or replace function public.progress_local_day(p_user uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_at at time zone coalesce((select p.timezone from public.profiles p where p.id = p_user), 'Asia/Ho_Chi_Minh'))::date;
$$;

-- STREAK_RULES: a day is active with a completed lesson, >= 10 graded reviews or >= 5 active minutes.
create or replace function public.progress_day_active(p_lessons integer, p_reviews integer, p_active_ms bigint)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(p_lessons, 0) >= 1 or coalesce(p_reviews, 0) >= 10 or coalesce(p_active_ms, 0) >= 300000;
$$;

-- XP of a completed run: lesson_completed (10) + lesson_accurate_bonus (5) when the run's first-try accuracy
-- (share of first attempts judged correct or almost, as accuracy_by_stage in complete_lesson) is >= 0.8.
create or replace function public.progress_run_xp(p_run_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 10 + case when coalesce(avg(case when a.is_correct then 1 else 0 end), 0) >= 0.8 then 5 else 0 end
  from public.attempts a
  where a.lesson_run_id = p_run_id and a.attempt_no = 1;
$$;

-- Adds to one activity day; XP is capped per day (XP_RULES.daily_cap).
create or replace function public.progress_bump(
  p_user uuid, p_path uuid, p_day date, p_active_ms bigint, p_answers integer, p_correct_first integer,
  p_lessons integer, p_reviews integer, p_xp integer
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.activity_days as d (user_id, learning_path_id, local_day, active_ms, answers, correct_first, lessons, reviews, xp)
  values (p_user, p_path, p_day, greatest(0, p_active_ms), greatest(0, p_answers), greatest(0, p_correct_first),
    greatest(0, p_lessons), greatest(0, p_reviews), least(300, greatest(0, p_xp)))
  on conflict (user_id, learning_path_id, local_day) do update set
    active_ms = d.active_ms + excluded.active_ms,
    answers = d.answers + excluded.answers,
    correct_first = d.correct_first + excluded.correct_first,
    lessons = d.lessons + excluded.lessons,
    reviews = d.reviews + excluded.reviews,
    xp = least(300, d.xp + excluded.xp),
    updated_at = now();
$$;

-- Display text of an exercise prompt (packages/shared/src/content/exercises.ts), whitespace collapsed and
-- truncated to 120 characters: mcq stem, fill_blank template with blanks shown as "___", word_bank instruction,
-- translate source_text, listen fallback_text.
create or replace function public.progress_prompt_text(p_type text, p_prompt jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  v := case p_type
    when 'mcq' then p_prompt ->> 'stem'
    when 'fill_blank' then regexp_replace(p_prompt ->> 'template', '\{\{[^}]*\}\}', '___', 'g')
    when 'word_bank' then p_prompt ->> 'instruction'
    when 'translate' then p_prompt ->> 'source_text'
    when 'listen' then p_prompt ->> 'fallback_text'
  end;
  v := btrim(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g'));
  if char_length(v) > 120 then
    v := left(v, 119) || '…';
  end if;
  return v;
end;
$$;

-- Calendar streak (STREAK_RULES) over at most 400 days ending today, walked oldest -> newest from the path's
-- first local day (or its first activity, whichever is earlier):
--   * an active day extends the run (also on a rest day);
--   * an inactive rest day (weekly_minutes[isodow] = 0) and today when not yet active are skipped;
--   * an inactive scheduled day uses the ISO week's single grace when the run has not used it yet; a second
--     miss in the same week restarts the run after the first miss, which is exactly where a backward walk from
--     today would stop.
-- current = the run at today, best = the longest run seen, grace_left = 1 unless a scheduled day of the
-- current ISO week has already been missed.
create or replace function public.progress_streak(p_user uuid, p_path uuid)
returns table (current integer, best integer, grace_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path public.learning_paths;
  v_tz text;
  v_today date;
  v_start date;
  v_week date;
  v_this_week date;
  v_day date;
  v_active date[];
  v_run integer := 0;
  v_since_miss integer := 0;
  v_miss_week date;
  v_best integer := 0;
begin
  select p.* into v_path from public.learning_paths p where p.id = p_path and p.user_id = p_user;
  if not found then
    return query select 0, 0, 1;
    return;
  end if;
  select pr.timezone into v_tz from public.profiles pr where pr.id = p_user;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_today := (now() at time zone v_tz)::date;
  v_this_week := v_today - (extract(isodow from v_today)::integer - 1);

  select coalesce(array_agg(a.local_day), '{}')
    into v_active
  from public.activity_days a
  where a.user_id = p_user and a.learning_path_id = p_path and a.local_day between v_today - 399 and v_today
    and public.progress_day_active(a.lessons, a.reviews, a.active_ms);

  v_start := greatest(v_today - 399, least((v_path.created_at at time zone v_tz)::date,
    coalesce((select min(d) from unnest(v_active) as u(d)), v_today)));

  for v_day in select g::date from generate_series(v_start, v_today, interval '1 day') as g loop
    if v_day = any (v_active) then
      v_run := v_run + 1;
      v_since_miss := v_since_miss + 1;
    elsif v_day < v_today and coalesce(v_path.weekly_minutes[extract(isodow from v_day)::integer], 0) > 0 then
      v_week := v_day - (extract(isodow from v_day)::integer - 1);
      if v_miss_week is distinct from v_week then
        v_miss_week := v_week;
      else
        v_run := v_since_miss;
      end if;
      v_since_miss := 0;
    end if;
    v_best := greatest(v_best, v_run);
  end loop;

  return query select v_run, v_best, case when v_miss_week = v_this_week then 0 else 1 end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers keeping activity_days current
-- ---------------------------------------------------------------------------

-- XP_RULES: a first attempt without reveal earns 2 when correct (and counts in correct_first), 1 when almost.
create or replace function public.progress_on_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean := new.attempt_no = 1 and not new.after_reveal;
begin
  perform public.progress_bump(
    new.user_id, new.learning_path_id, public.progress_answer_day(new.user_id, new.client_at, new.created_at),
    least(new.response_ms, 120000)::bigint, 1,
    case when v_first and new.verdict = 'correct' then 1 else 0 end,
    0, 0,
    case when not v_first then 0 when new.verdict = 'correct' then 2 when new.verdict = 'almost' then 1 else 0 end);
  return null;
end;
$$;

-- XP_RULES.review_recalled: a graded review with rating_effective >= 2 earns 1; local_day is already stored.
create or replace function public.progress_on_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.progress_bump(
    new.user_id, new.learning_path_id, new.local_day,
    least(coalesce(new.response_ms, 0), 120000)::bigint, 0, 0, 0, 1,
    case when new.rating_effective >= 2 then 1 else 0 end);
  return null;
end;
$$;

-- XP_RULES.lesson_completed (+ lesson_accurate_bonus) on the local day the run completed.
create or replace function public.progress_on_lesson_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.progress_bump(
    new.user_id, new.learning_path_id, public.progress_local_day(new.user_id, coalesce(new.completed_at, now())),
    0, 0, 0, 1, 0, public.progress_run_xp(new.id));
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill from existing history with the same rules (XP is non-negative, so capping the day's sum equals
-- capping each step).
-- ---------------------------------------------------------------------------
insert into public.activity_days (user_id, learning_path_id, local_day, active_ms, answers, correct_first, lessons, reviews, xp)
select s.user_id, s.learning_path_id, s.local_day, sum(s.active_ms), sum(s.answers), sum(s.correct_first), sum(s.lessons),
       sum(s.reviews), least(300, sum(s.xp))
from (
  select a.user_id, a.learning_path_id, public.progress_answer_day(a.user_id, a.client_at, a.created_at) as local_day,
         least(a.response_ms, 120000)::bigint as active_ms, 1 as answers,
         case when a.attempt_no = 1 and not a.after_reveal and a.verdict = 'correct' then 1 else 0 end as correct_first,
         0 as lessons, 0 as reviews,
         case when a.attempt_no <> 1 or a.after_reveal then 0 when a.verdict = 'correct' then 2 when a.verdict = 'almost' then 1 else 0 end as xp
  from public.attempts a
  union all
  select l.user_id, l.learning_path_id, l.local_day, least(coalesce(l.response_ms, 0), 120000)::bigint, 0, 0, 0, 1,
         case when l.rating_effective >= 2 then 1 else 0 end
  from public.review_logs l
  where l.kind = 'grade'
  union all
  select r.user_id, r.learning_path_id, public.progress_local_day(r.user_id, r.completed_at), 0, 0, 0, 1, 0,
         public.progress_run_xp(r.id)
  from public.lesson_runs r
  where r.status = 'completed'
) as s
group by s.user_id, s.learning_path_id, s.local_day;

create trigger attempts_progress
  after insert on public.attempts
  for each row execute function public.progress_on_attempt();

create trigger review_logs_progress
  after insert on public.review_logs
  for each row when (new.kind = 'grade') execute function public.progress_on_review();

create trigger lesson_runs_progress
  after update of status on public.lesson_runs
  for each row when (old.status is distinct from 'completed' and new.status = 'completed')
  execute function public.progress_on_lesson_completed();

-- ---------------------------------------------------------------------------
-- get_progress_dashboard
-- ---------------------------------------------------------------------------

-- Progress page payload (progressDashboardSchema) for the caller's path over the last p_range_days local days.
-- Accuracy = mean attempts.score of first attempts (attempt_no = 1) answered in the window (by created_at),
-- null below 10 attempts; a lesson's attempts count for every skill in lessons.skills. Volatile: when the
-- motivation layer is shown it awards missing badges and returns those inserted by this call as new_badges.
create or replace function public.get_progress_dashboard(p_path_id uuid, p_range_days integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_skills constant text[] := array['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'];
  v_types constant text[] := array['mcq', 'fill_blank', 'word_bank', 'translate', 'listen'];
  v_badge_keys constant text[] := array[
    'first_lesson', 'lessons_10', 'lessons_50', 'reviews_100', 'reviews_1000', 'mastered_25', 'mastered_100',
    'streak_7', 'streak_30', 'diagnostic_done', 'weekly_challenge_4',
    'skill_vocabulary', 'skill_grammar', 'skill_reading', 'skill_listening', 'skill_writing', 'skill_speaking'];
  v_tz text;
  v_today date;
  v_from date;
  v_week_start date;
  v_from_ts timestamptz;
  v_prev_ts timestamptz;
  v_to_ts timestamptz;
  v_days jsonb;
  v_totals jsonb;
  v_skill_rows jsonb;
  v_type_rows jsonb;
  v_estimates jsonb;
  v_mistakes jsonb;
  v_motivation jsonb;
  v_show boolean;
  v_streak record;
  v_xp_total integer;
  v_xp_week integer;
  v_target_days integer;
  v_done_days integer;
  v_completed boolean;
  v_completed_weeks integer;
  v_created date;
  v_lessons_total integer;
  v_reviews_total integer;
  v_mastered integer;
  v_diagnostic boolean;
  v_strong_skills text[];
  v_earned text[];
  v_new text[];
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_range_days is null or p_range_days not in (7, 14, 28) then
    raise exception using errcode = 'P0001', message = 'invalid_range';
  end if;
  select p.* into v_path from public.learning_paths p where p.id = p_path_id and p.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;

  select pr.timezone into v_tz from public.profiles pr where pr.id = v_uid;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - (p_range_days - 1);
  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);
  v_from_ts := v_from::timestamp at time zone v_tz;
  v_prev_ts := (v_from - p_range_days)::timestamp at time zone v_tz;
  v_to_ts := (v_today + 1)::timestamp at time zone v_tz;
  v_created := (v_path.created_at at time zone v_tz)::date;

  -- Activity: exactly p_range_days days ending today, empty days as zeros.
  select jsonb_agg(jsonb_build_object(
           'date', to_char(g.day, 'YYYY-MM-DD'),
           'minutes', (coalesce(a.active_ms, 0) / 60000)::integer,
           'xp', coalesce(a.xp, 0),
           'lessons', coalesce(a.lessons, 0),
           'reviews', coalesce(a.reviews, 0),
           'answers', coalesce(a.answers, 0),
           'goal_minutes', coalesce(v_path.weekly_minutes[extract(isodow from g.day)::integer], 0)::integer,
           'active', public.progress_day_active(a.lessons, a.reviews, a.active_ms)
         ) order by g.day)
    into v_days
  from (select (v_from + i)::date as day from generate_series(0, p_range_days - 1) as i) as g
  left join public.activity_days a
    on a.user_id = v_uid and a.learning_path_id = v_path.id and a.local_day = g.day;

  select jsonb_build_object(
           'today_minutes', coalesce(sum(a.active_ms / 60000) filter (where a.local_day = v_today), 0)::integer,
           'week_minutes', coalesce(sum(a.active_ms / 60000) filter (where a.local_day >= v_week_start), 0)::integer,
           'week_goal_minutes', (select coalesce(sum(m), 0) from unnest(v_path.weekly_minutes) as m)::integer,
           'range_minutes', coalesce(sum(a.active_ms / 60000) filter (where a.local_day >= v_from), 0)::integer,
           'lessons_completed', coalesce(sum(a.lessons) filter (where a.local_day >= v_from), 0)::integer,
           'reviews_done', coalesce(sum(a.reviews) filter (where a.local_day >= v_from), 0)::integer,
           'application_done', (
             select count(*)::integer from public.attempts t
             where t.user_id = v_uid and t.learning_path_id = v_path.id and t.created_at >= v_from_ts and t.created_at < v_to_ts
               and t.stage = 'application' and t.attempt_no = 1 and t.verdict = 'correct')
         )
    into v_totals
  from public.activity_days a
  where a.user_id = v_uid and a.learning_path_id = v_path.id and a.local_day between least(v_from, v_week_start) and v_today;

  -- First-try accuracy per skill and per exercise type, this window and the previous one.
  select jsonb_agg(jsonb_build_object(
           'skill', s.skill,
           'attempts', coalesce(x.n, 0),
           'accuracy', case when x.n >= 10 then round(x.acc, 4) end,
           'prev_attempts', coalesce(x.pn, 0),
           'prev_accuracy', case when x.pn >= 10 then round(x.pacc, 4) end
         ) order by s.ord)
    into v_skill_rows
  from unnest(v_skills) with ordinality as s(skill, ord)
  left join (
    select k.skill,
           count(*) filter (where t.created_at >= v_from_ts)::integer as n,
           avg(t.score) filter (where t.created_at >= v_from_ts) as acc,
           count(*) filter (where t.created_at < v_from_ts)::integer as pn,
           avg(t.score) filter (where t.created_at < v_from_ts) as pacc
    from public.attempts t
    join public.lessons l on l.id = t.lesson_id
    cross join lateral unnest(l.skills) as k(skill)
    where t.user_id = v_uid and t.learning_path_id = v_path.id and t.attempt_no = 1
      and t.created_at >= v_prev_ts and t.created_at < v_to_ts
    group by k.skill
  ) as x on x.skill = s.skill;

  select jsonb_agg(jsonb_build_object(
           'exercise_type', s.exercise_type,
           'attempts', coalesce(x.n, 0),
           'accuracy', case when x.n >= 10 then round(x.acc, 4) end,
           'prev_attempts', coalesce(x.pn, 0),
           'prev_accuracy', case when x.pn >= 10 then round(x.pacc, 4) end
         ) order by s.ord)
    into v_type_rows
  from unnest(v_types) with ordinality as s(exercise_type, ord)
  left join (
    select t.exercise_type,
           count(*) filter (where t.created_at >= v_from_ts)::integer as n,
           avg(t.score) filter (where t.created_at >= v_from_ts) as acc,
           count(*) filter (where t.created_at < v_from_ts)::integer as pn,
           avg(t.score) filter (where t.created_at < v_from_ts) as pacc
    from public.attempts t
    where t.user_id = v_uid and t.learning_path_id = v_path.id and t.attempt_no = 1
      and t.created_at >= v_prev_ts and t.created_at < v_to_ts
    group by t.exercise_type
  ) as x on x.exercise_type = s.exercise_type;

  -- Latest estimate per skill: assessment > diagnostic > self_report, then the most recent.
  select coalesce(jsonb_agg(jsonb_build_object(
           'skill', e.skill,
           'level_code', e.level_code,
           'confidence', e.confidence,
           'source', e.source,
           'sample_size', e.sample_size,
           'assessed_at', e.assessed_at
         ) order by array_position(v_skills, e.skill)), '[]'::jsonb)
    into v_estimates
  from (
    select distinct on (se.skill) se.*
    from public.skill_estimates se
    where se.learning_path_id = v_path.id
    order by se.skill, case se.source when 'assessment' then 0 when 'diagnostic' then 1 else 2 end, se.assessed_at desc
  ) as e;

  -- Exercises answered incorrectly most often in the window (every incorrect attempt counts).
  select coalesce(jsonb_agg(jsonb_build_object(
           'prompt', public.progress_prompt_text(e.exercise_type, e.prompt),
           'lesson_id', l.id,
           'lesson_title', coalesce(l.title ->> 'vi', ''),
           'wrong_count', w.wrong_count,
           'last_wrong_at', w.last_wrong_at
         ) order by w.wrong_count desc, w.last_wrong_at desc, e.id), '[]'::jsonb)
    into v_mistakes
  from (
    select t.exercise_id, count(*)::integer as wrong_count, max(t.created_at) as last_wrong_at
    from public.attempts t
    where t.user_id = v_uid and t.learning_path_id = v_path.id and t.verdict = 'incorrect'
      and t.created_at >= v_from_ts and t.created_at < v_to_ts
    group by t.exercise_id
    order by count(*) desc, max(t.created_at) desc, t.exercise_id
    limit 10
  ) as w
  join public.exercises e on e.id = w.exercise_id
  join public.lessons l on l.id = e.lesson_id;

  select coalesce((select up.show_motivation from public.user_preferences up where up.user_id = v_uid), true) into v_show;

  if v_show then
    select s.* into v_streak from public.progress_streak(v_uid, v_path.id) as s;

    select coalesce(sum(a.xp), 0)::integer, coalesce(sum(a.xp) filter (where a.local_day >= v_week_start), 0)::integer
      into v_xp_total, v_xp_week
    from public.activity_days a
    where a.user_id = v_uid and a.learning_path_id = v_path.id;

    -- Weekly challenge: every scheduled day of the ISO week active. Past weeks count from the path's first
    -- local day (days before it are not targets), over the same 400-day horizon as the streak.
    select count(*) filter (where d.wk = v_week_start and d.scheduled)::integer,
           count(*) filter (where d.wk = v_week_start and d.scheduled and d.active)::integer
      into v_target_days, v_done_days
    from (
      select g.day, g.day - (extract(isodow from g.day)::integer - 1) as wk,
             coalesce(v_path.weekly_minutes[extract(isodow from g.day)::integer], 0) > 0 as scheduled,
             coalesce(public.progress_day_active(a.lessons, a.reviews, a.active_ms), false) as active
      from (select (v_week_start + i)::date as day from generate_series(0, 6) as i) as g
      left join public.activity_days a on a.user_id = v_uid and a.learning_path_id = v_path.id and a.local_day = g.day
    ) as d;
    v_completed := v_target_days > 0 and v_done_days >= v_target_days;

    select count(*)::integer
      into v_completed_weeks
    from (
      select d.wk
      from (
        select g.day - (extract(isodow from g.day)::integer - 1) as wk,
               coalesce(public.progress_day_active(a.lessons, a.reviews, a.active_ms), false) as active
        from (
          select gs::date as day
          from generate_series(greatest(v_created, v_today - 399), v_week_start - 1, interval '1 day') as gs
        ) as g
        left join public.activity_days a on a.user_id = v_uid and a.learning_path_id = v_path.id and a.local_day = g.day
        where coalesce(v_path.weekly_minutes[extract(isodow from g.day)::integer], 0) > 0
      ) as d
      group by d.wk
      having bool_and(d.active)
    ) as w;

    -- Badge criteria (catalogue in contract.ts).
    select count(*)::integer into v_lessons_total
    from public.lesson_runs r where r.user_id = v_uid and r.learning_path_id = v_path.id and r.status = 'completed';
    select count(*)::integer into v_reviews_total
    from public.review_logs l where l.user_id = v_uid and l.learning_path_id = v_path.id and l.kind = 'grade';
    select count(*)::integer into v_mastered
    from public.review_item_mastery m where m.user_id = v_uid and m.learning_path_id = v_path.id and m.mastered_at is not null;
    select exists (
      select 1 from public.assessment_attempts aa
      where aa.user_id = v_uid and aa.learning_path_id = v_path.id and aa.status = 'completed'
    ) into v_diagnostic;
    -- skill_*: first-try accuracy >= 0.8 over >= 30 attempts of the skill in the last 28 local days.
    select coalesce(array_agg(x.skill order by array_position(v_skills, x.skill)), '{}')
      into v_strong_skills
    from (
      select k.skill
      from public.attempts t
      join public.lessons l on l.id = t.lesson_id
      cross join lateral unnest(l.skills) as k(skill)
      where t.user_id = v_uid and t.learning_path_id = v_path.id and t.attempt_no = 1
        and t.created_at >= (v_today - 27)::timestamp at time zone v_tz and t.created_at < v_to_ts
      group by k.skill
      having count(*) >= 30 and avg(t.score) >= 0.8
    ) as x;

    v_earned := array_remove(array[
      case when v_lessons_total >= 1 then 'first_lesson' end,
      case when v_lessons_total >= 10 then 'lessons_10' end,
      case when v_lessons_total >= 50 then 'lessons_50' end,
      case when v_reviews_total >= 100 then 'reviews_100' end,
      case when v_reviews_total >= 1000 then 'reviews_1000' end,
      case when v_mastered >= 25 then 'mastered_25' end,
      case when v_mastered >= 100 then 'mastered_100' end,
      case when v_streak.best >= 7 then 'streak_7' end,
      case when v_streak.best >= 30 then 'streak_30' end,
      case when v_diagnostic then 'diagnostic_done' end,
      case when v_completed_weeks + case when v_completed then 1 else 0 end >= 4 then 'weekly_challenge_4' end
    ], null) || array(select 'skill_' || s from unnest(v_strong_skills) as s);

    with ins as (
      insert into public.user_badges (user_id, learning_path_id, badge_key)
      select v_uid, v_path.id, k from unnest(v_earned) as k
      on conflict do nothing
      returning badge_key
    )
    select coalesce(array_agg(ins.badge_key), '{}') into v_new from ins;

    v_motivation := jsonb_build_object(
      'xp_total', v_xp_total,
      'xp_week', v_xp_week,
      'streak_current', v_streak.current,
      'streak_best', v_streak.best,
      'grace_left', v_streak.grace_left,
      'weekly_challenge', jsonb_build_object(
        'target_days', v_target_days,
        'done_days', v_done_days,
        'completed', v_completed,
        'completed_weeks', v_completed_weeks
      ),
      'badges', (
        select coalesce(jsonb_agg(jsonb_build_object('key', b.badge_key, 'earned_at', b.earned_at)
                 order by b.earned_at, array_position(v_badge_keys, b.badge_key)), '[]'::jsonb)
        from public.user_badges b
        where b.user_id = v_uid and b.learning_path_id = v_path.id
      ),
      'new_badges', (
        select coalesce(jsonb_agg(k order by o), '[]'::jsonb)
        from unnest(v_badge_keys) with ordinality as t(k, o)
        where k = any (v_new)
      )
    );
  end if;

  return jsonb_build_object(
    'path_id', v_path.id,
    'range_days', p_range_days,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'days', v_days,
    'totals', v_totals,
    'skills', v_skill_rows,
    'exercise_types', v_type_rows,
    'estimates', v_estimates,
    'mistakes', v_mistakes,
    'motivation', coalesce(v_motivation, 'null'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.progress_answer_day(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.progress_local_day(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.progress_day_active(integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.progress_run_xp(uuid) from public, anon, authenticated;
revoke all on function public.progress_bump(uuid, uuid, date, bigint, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.progress_prompt_text(text, jsonb) from public, anon, authenticated;
revoke all on function public.progress_streak(uuid, uuid) from public, anon, authenticated;
revoke all on function public.progress_on_attempt() from public, anon, authenticated;
revoke all on function public.progress_on_review() from public, anon, authenticated;
revoke all on function public.progress_on_lesson_completed() from public, anon, authenticated;

revoke all on function public.get_progress_dashboard(uuid, integer) from public, anon;
grant execute on function public.get_progress_dashboard(uuid, integer) to authenticated;
