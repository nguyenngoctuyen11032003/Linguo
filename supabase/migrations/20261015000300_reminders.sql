-- Linguo spec 10 §2: study reminders, the in-app notification inbox, Web Push subscriptions and the weekly
-- summary. JSON shapes and numbers match packages/shared/src/notifications/contract.ts
-- (notificationPrefsSchema, notificationPrefsPatchSchema, notificationListSchema, weeklySummaryPayloadSchema,
-- dueNotificationSchema, REMINDER_RULES, BACKOFF_DAYS); supabase/tests/reminders.test.sql asserts them.
--
-- Clients read their own rows (RLS select-own) and write only through the RPCs below:
--   get_notification_prefs()                    the caller's prefs (default row created on first call)
--   set_notification_prefs(p jsonb)             partial update, validated ('invalid_prefs'); no day left
--                                               means reminders off; reset_backoff clears the backoff
--   save_push_subscription(...)                 upsert by endpoint, at most 5 per learner (oldest evicted)
--   delete_push_subscription(p_endpoint)
--   mark_notification(p_id, 'read'|'clicked')   a first click lowers the backoff by one level
--   list_notifications(p_limit, p_before)       { items, has_more }, newest first
--   unread_notification_count()
-- service_role only (notify-dispatch Edge Function, scheduled jobs):
--   generate_due_notifications(p_now)           inbox rows due at p_now; returns the rows to push
--   purge_notifications()                       deletes inbox rows older than 90 days
--
-- Reminder model (all in the learner's profiles.timezone):
--   * Slot k (0 <= k < max_per_day) starts at remind_at + k x 3 h (slots that would start after midnight are
--     dropped) and fires while the local time is in [slot, slot + 15 min); a window that crosses midnight
--     belongs to the day it started on. One reminder per slot: a run finds no reminder created within 15
--     minutes of p_now before it adds one, and the day's reminder count stays below max_per_day.
--   * The reminder day must be in remind_days and in BACKOFF_DAYS[backoff_level]; the local time must be
--     outside quiet hours ([quiet_start, quiet_end), wrapping past midnight when quiet_start > quiet_end,
--     none when equal); the learner must not be active that day yet (STREAK_RULES via progress_day_active over
--     all paths).
--   * Kind: resume_lesson (a lesson run in progress started within 7 days) > review_due (cards due today on
--     the current path, review_day_totals.due_total) > quick_check; a kind already sent that day is skipped
--     (unique (user_id, kind, local_day)), quick_check being the fallback.
--   * Weekly summary: Sunday, slot 0 of remind_at (19:30 for learners without a prefs row), for learners
--     with weekly_summary on and a learning path, regardless of reminders_enabled, remind_days, backoff and
--     activity. It is always put in the inbox but only pushed outside quiet hours.
--   * Rows are created with created_at = p_now, so a second run with the same p_now creates nothing and
--     returns nothing.
-- Backoff: a reminder (not the weekly summary) still unclicked 24 h after it was created, on a day the
-- learner did not become active, adds 1 to ignored_streak; every 3 add a backoff level (max 3) and reset the
-- streak. A first click on any notification, or the first run that sees the learner active on the local
-- day, lowers backoff_level by 1 (min 0) and resets ignored_streak. Both are applied by
-- generate_due_notifications (ignores, activity) and mark_notification (clicks).
-- Copy is Vietnamese, warm and free of guilt (FORBIDDEN_REMINDER_PHRASES).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reminders_enabled boolean not null default false,
  remind_at time not null default '19:30',
  -- ISO days, 1 = Monday ... 7 = Sunday; kept sorted and distinct by set_notification_prefs.
  remind_days smallint[] not null default '{1,2,3,4,5,6,7}',
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  max_per_day smallint not null default 1 check (max_per_day between 1 and 3),
  weekly_summary boolean not null default true,
  push_enabled boolean not null default false,
  ignored_streak integer not null default 0 check (ignored_streak >= 0),
  backoff_level smallint not null default 0 check (backoff_level between 0 and 3),
  -- Local day on which activity last lowered the backoff (at most once per day).
  backoff_relief_day date,
  updated_at timestamptz not null default now(),
  constraint notification_prefs_remind_days_shape check (
    coalesce(array_ndims(remind_days), 1) = 1 and remind_days <@ '{1,2,3,4,5,6,7}'::smallint[]
  ),
  constraint notification_prefs_enabled_needs_day check (not reminders_enabled or cardinality(remind_days) > 0)
);
comment on table public.notification_prefs is 'Reminder settings per learner (spec 10 §2); written through set_notification_prefs and the reminder jobs.';

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]+=*$' and char_length(p256dh) <= 200),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]+=*$' and char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 200),
  created_at timestamptz not null default clock_timestamp(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0)
);
create index push_subscriptions_user_created_idx on public.push_subscriptions (user_id, created_at desc);
comment on table public.push_subscriptions is 'Web Push endpoints, at most 5 per learner; notify-dispatch (service_role) records delivery results.';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('review_due', 'resume_lesson', 'quick_check', 'weekly_summary')),
  title_vi text not null check (char_length(title_vi) between 1 and 80),
  body_vi text not null check (char_length(body_vi) between 1 and 300),
  action_url text not null check (action_url ~ '^/app/' and char_length(action_url) <= 300),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  local_day date not null,
  created_at timestamptz not null default now(),
  delivered_push_at timestamptz,
  read_at timestamptz,
  clicked_at timestamptz,
  -- Set once the 24-hour ignore rule has looked at this row.
  ignore_checked boolean not null default false,
  unique (user_id, kind, local_day)
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc, id desc);
create index notifications_created_at_idx on public.notifications (created_at);
create index notifications_ignore_pending_idx on public.notifications (created_at)
  where not ignore_checked and kind <> 'weekly_summary';
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
comment on table public.notifications is 'In-app notification inbox (spec 10 §2), kept 90 days; created by generate_due_notifications.';

alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

create policy "notification prefs: read own" on public.notification_prefs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push subscriptions: read own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications: read own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.notification_prefs, public.push_subscriptions, public.notifications from public, anon, authenticated;
grant select on public.notification_prefs, public.push_subscriptions, public.notifications to authenticated;
grant select, insert, update, delete on public.notification_prefs, public.push_subscriptions, public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- STREAK_RULES over every path of the learner on one local day.
create or replace function public.reminders_day_active(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.progress_day_active(sum(a.lessons)::integer, sum(a.reviews)::integer, sum(a.active_ms)::bigint)
    from public.activity_days a
    where a.user_id = p_user and a.local_day = p_day
    having count(*) > 0
  ), false);
$$;

-- BACKOFF_DAYS: level 0 every day, 1 Tue/Thu/Sat, 2 Mon/Wed/Fri, 3 Monday.
create or replace function public.reminders_backoff_allows(p_level integer, p_isodow integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_level, 0)
    when 0 then true
    when 1 then p_isodow in (2, 4, 6)
    when 2 then p_isodow in (1, 3, 5)
    else p_isodow = 1
  end;
$$;

-- Quiet hours [p_start, p_end); wraps past midnight when p_start > p_end; none when equal.
create or replace function public.reminders_in_quiet(p_local time, p_start time, p_end time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start = p_end then false
    when p_start < p_end then p_local >= p_start and p_local < p_end
    else p_local >= p_start or p_local < p_end
  end;
$$;

-- The reminder slot whose 15-minute window contains p_local (local wall-clock time), if any: slot k starts at
-- p_remind_at + k x 3 h for k < p_slots and before midnight. reminder_day is the local day the slot started on.
create or replace function public.reminders_slot(p_local timestamp, p_remind_at time, p_slots integer)
returns table (slot integer, reminder_day date)
language sql
immutable
set search_path = ''
as $$
  select k, case when x.lt >= s.st then p_local::date else p_local::date - 1 end
  from (select extract(epoch from p_local::time) as lt) as x
  cross join generate_series(0, greatest(1, least(coalesce(p_slots, 1), 3)) - 1) as k
  cross join lateral (select extract(epoch from p_remind_at) + k * 10800 as st) as s
  where s.st < 86400
    and mod(x.lt - s.st + 86400, 86400) < 900
  order by k
  limit 1;
$$;

-- Prefs row as notificationPrefsSchema (times as 'HH:MM').
create or replace function public.reminders_prefs_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reminders_enabled', np.reminders_enabled,
    'remind_at', to_char(np.remind_at, 'HH24:MI'),
    'remind_days', to_jsonb(np.remind_days::integer[]),
    'quiet_start', to_char(np.quiet_start, 'HH24:MI'),
    'quiet_end', to_char(np.quiet_end, 'HH24:MI'),
    'max_per_day', np.max_per_day,
    'weekly_summary', np.weekly_summary,
    'push_enabled', np.push_enabled,
    'ignored_streak', np.ignored_streak,
    'backoff_level', np.backoff_level
  )
  from public.notification_prefs np
  where np.user_id = p_user;
$$;

-- Vietnamese name of a skill (lower case, for use inside a sentence).
create or replace function public.reminders_skill_vi(p_skill text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_skill
    when 'vocabulary' then 'Từ vựng'
    when 'grammar' then 'Ngữ pháp'
    when 'reading' then 'Đọc'
    when 'listening' then 'Nghe'
    when 'writing' then 'Viết'
    when 'speaking' then 'Nói'
    else p_skill
  end;
$$;

-- weeklySummaryPayloadSchema for the 7 local days ending p_week_end, on the learner's current path (else the
-- most recently updated path that is not archived); null without a path. Minutes and active days follow
-- get_progress_dashboard (per-day floor of active_ms, progress_day_active); planned_* come from the path's
-- weekly_minutes; weak_skill is the lowest first-try accuracy (mean attempts.score of attempt_no = 1) among
-- skills with at least 10 such attempts in the week (ties: skill order of the dashboard).
create or replace function public.reminders_weekly_payload(p_user uuid, p_week_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skills constant text[] := array['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'];
  v_path public.learning_paths;
  v_tz text;
  v_start date := p_week_end - 6;
  v_minutes integer;
  v_active integer;
  v_planned_minutes integer;
  v_planned_days integer;
  v_weak text;
  v_weak_acc numeric;
  v_goal integer;
  v_target integer;
  v_suggestion text;
begin
  select lp.* into v_path
  from public.profiles p
  join public.learning_paths lp on lp.id = p.current_learning_path_id and lp.user_id = p.id
  where p.id = p_user;
  if not found then
    select lp.* into v_path
    from public.learning_paths lp
    where lp.user_id = p_user and lp.status <> 'archived'
    order by lp.updated_at desc, lp.created_at desc
    limit 1;
    if not found then
      return null;
    end if;
  end if;

  select coalesce(p.timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.profiles p where p.id = p_user;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');

  select coalesce(sum(a.active_ms / 60000), 0)::integer,
         count(*) filter (where public.progress_day_active(a.lessons, a.reviews, a.active_ms))::integer
    into v_minutes, v_active
  from public.activity_days a
  where a.user_id = p_user and a.learning_path_id = v_path.id and a.local_day between v_start and p_week_end;

  select coalesce(sum(m), 0)::integer, count(*) filter (where m > 0)::integer
    into v_planned_minutes, v_planned_days
  from unnest(v_path.weekly_minutes) as m;

  select x.skill, round(x.acc, 4)
    into v_weak, v_weak_acc
  from (
    select k.skill, avg(t.score) as acc, count(*) as n
    from public.attempts t
    join public.lessons l on l.id = t.lesson_id
    cross join lateral unnest(l.skills) as k(skill)
    where t.user_id = p_user and t.learning_path_id = v_path.id and t.attempt_no = 1
      and t.created_at >= (v_start::timestamp at time zone v_tz)
      and t.created_at < ((p_week_end + 1)::timestamp at time zone v_tz)
    group by k.skill
  ) as x
  where x.n >= 10
  order by x.acc, array_position(v_skills, x.skill)
  limit 1;

  -- One suggestion: a lighter daily goal when under half the plan, else the weak skill, else encouragement.
  if v_planned_minutes > 0 and v_minutes * 2 < v_planned_minutes then
    v_goal := v_planned_minutes / greatest(v_planned_days, 1);
    v_target := greatest(5, (round(v_minutes::numeric / greatest(v_planned_days, 1) / 5) * 5)::integer);
    if v_target < v_goal then
      v_suggestion := format('Thử giảm mục tiêu xuống %s phút/ngày — vừa sức thì dễ duy trì hơn.', v_target);
    end if;
  end if;
  if v_suggestion is null and v_weak is not null then
    v_suggestion := format('Thêm 1 buổi luyện %s vào tuần tới.', public.reminders_skill_vi(v_weak));
  end if;
  if v_suggestion is null then
    v_suggestion := case when v_minutes = 0
      then 'Tuần mới bắt đầu nhẹ nhàng: một phiên 10 phút là đủ.'
      else 'Giữ nhịp này nhé — bạn đang đi đúng hướng.' end;
  end if;

  return jsonb_build_object(
    'week_start', to_char(v_start, 'YYYY-MM-DD'),
    'minutes', v_minutes,
    'planned_minutes', v_planned_minutes,
    'active_days', v_active,
    'planned_days', v_planned_days,
    'weak_skill', v_weak,
    'weak_accuracy', v_weak_acc,
    'suggestion_vi', v_suggestion
  );
end;
$$;

-- Body of a weekly summary notification (<= 300 characters).
create or replace function public.reminders_weekly_body(p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if (p_payload ->> 'minutes')::integer = 0 and (p_payload ->> 'active_days')::integer = 0 then
    v_text := 'Tuần này bạn chưa có buổi học nào, không sao cả. ';
  else
    v_text := format('Tuần này bạn học %s phút, %s/%s buổi theo kế hoạch (mục tiêu %s phút). ',
      p_payload ->> 'minutes', p_payload ->> 'active_days', p_payload ->> 'planned_days', p_payload ->> 'planned_minutes');
  end if;
  if p_payload ->> 'weak_skill' is not null then
    v_text := v_text || format('Kỹ năng nên luyện thêm: %s (%s%% đúng). ',
      public.reminders_skill_vi(p_payload ->> 'weak_skill'),
      round((p_payload ->> 'weak_accuracy')::numeric * 100));
  end if;
  return left(v_text || (p_payload ->> 'suggestion_vi'), 300);
end;
$$;

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------

create or replace function public.get_notification_prefs()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  insert into public.notification_prefs (user_id) values (v_uid) on conflict (user_id) do nothing;
  return public.reminders_prefs_json(v_uid);
end;
$$;

-- Partial update with any subset of notificationPrefsPatchSchema; anything else (unknown key, null, wrong
-- type, out of range) raises 'invalid_prefs'. Returns the full prefs row.
create or replace function public.set_notification_prefs(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.notification_prefs;
  v_key text;
  v_hhmm constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_days smallint[];
  v_reset boolean := false;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_prefs';
  end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('reminders_enabled', 'remind_at', 'remind_days', 'quiet_start', 'quiet_end', 'max_per_day',
                     'weekly_summary', 'push_enabled', 'reset_backoff') then
      raise exception using errcode = 'P0001', message = 'invalid_prefs';
    end if;
    if v_key in ('reminders_enabled', 'weekly_summary', 'push_enabled', 'reset_backoff')
       and jsonb_typeof(p -> v_key) <> 'boolean' then
      raise exception using errcode = 'P0001', message = 'invalid_prefs';
    end if;
    if v_key in ('remind_at', 'quiet_start', 'quiet_end')
       and (jsonb_typeof(p -> v_key) <> 'string' or (p ->> v_key) !~ v_hhmm) then
      raise exception using errcode = 'P0001', message = 'invalid_prefs';
    end if;
  end loop;
  if p ? 'max_per_day' and (
       jsonb_typeof(p -> 'max_per_day') <> 'number'
       or (p ->> 'max_per_day')::numeric not in (1, 2, 3)) then
    raise exception using errcode = 'P0001', message = 'invalid_prefs';
  end if;
  if p ? 'remind_days' then
    if jsonb_typeof(p -> 'remind_days') <> 'array'
       or jsonb_array_length(p -> 'remind_days') > 7
       or exists (
         select 1 from jsonb_array_elements(p -> 'remind_days') as e
         where jsonb_typeof(e) <> 'number' or e::text::numeric not in (1, 2, 3, 4, 5, 6, 7)
       ) then
      raise exception using errcode = 'P0001', message = 'invalid_prefs';
    end if;
    select coalesce(array_agg(distinct e::text::numeric::smallint order by e::text::numeric::smallint), '{}')
      into v_days
    from jsonb_array_elements(p -> 'remind_days') as e;
  end if;
  v_reset := coalesce((p ->> 'reset_backoff')::boolean, false);

  insert into public.notification_prefs (user_id) values (v_uid) on conflict (user_id) do nothing;
  select np.* into v_row from public.notification_prefs np where np.user_id = v_uid for update;

  v_row.reminders_enabled := coalesce((p ->> 'reminders_enabled')::boolean, v_row.reminders_enabled);
  v_row.remind_at := coalesce((p ->> 'remind_at')::time, v_row.remind_at);
  v_row.remind_days := coalesce(v_days, v_row.remind_days);
  v_row.quiet_start := coalesce((p ->> 'quiet_start')::time, v_row.quiet_start);
  v_row.quiet_end := coalesce((p ->> 'quiet_end')::time, v_row.quiet_end);
  v_row.max_per_day := coalesce((p ->> 'max_per_day')::numeric::smallint, v_row.max_per_day);
  v_row.weekly_summary := coalesce((p ->> 'weekly_summary')::boolean, v_row.weekly_summary);
  v_row.push_enabled := coalesce((p ->> 'push_enabled')::boolean, v_row.push_enabled);
  -- No day left means reminders are off.
  if cardinality(v_row.remind_days) = 0 then
    v_row.reminders_enabled := false;
  end if;
  if v_reset then
    v_row.backoff_level := 0;
    v_row.ignored_streak := 0;
  end if;

  update public.notification_prefs np set
    reminders_enabled = v_row.reminders_enabled,
    remind_at = v_row.remind_at,
    remind_days = v_row.remind_days,
    quiet_start = v_row.quiet_start,
    quiet_end = v_row.quiet_end,
    max_per_day = v_row.max_per_day,
    weekly_summary = v_row.weekly_summary,
    push_enabled = v_row.push_enabled,
    backoff_level = v_row.backoff_level,
    ignored_streak = v_row.ignored_streak
  where np.user_id = v_uid;

  return public.reminders_prefs_json(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------

-- Upserts the caller's subscription by endpoint (an endpoint saved by another account moves to the caller:
-- same browser, new sign-in), resets its failure count and keeps the 5 most recent per learner.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ua text := nullif(left(btrim(coalesce(p_user_agent, '')), 200), '');
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]+=*$' or char_length(p_p256dh) > 200
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]+=*$' or char_length(p_auth) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_subscription';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push_subscriptions:' || v_uid::text, 0));

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, user_agent, created_at)
  values (v_uid, p_endpoint, p_p256dh, p_auth, v_ua, clock_timestamp())
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    created_at = excluded.created_at,
    failure_count = 0;

  delete from public.push_subscriptions s
  where s.user_id = v_uid
    and s.id not in (
      select k.id from public.push_subscriptions k
      where k.user_id = v_uid
      order by k.created_at desc, k.id desc
      limit 5
    );
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  delete from public.push_subscriptions s where s.user_id = v_uid and s.endpoint = p_endpoint;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbox
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification(p_id uuid, p_action text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.notifications;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_action is null or p_action not in ('read', 'clicked') then
    raise exception using errcode = 'P0001', message = 'invalid_action';
  end if;
  select n.* into v_row from public.notifications n where n.id = p_id and n.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'notification_not_found';
  end if;

  if p_action = 'read' then
    update public.notifications n set read_at = coalesce(n.read_at, now()) where n.id = v_row.id;
  else
    update public.notifications n set read_at = coalesce(n.read_at, now()), clicked_at = coalesce(n.clicked_at, now())
    where n.id = v_row.id;
    -- The first click shows the reminders help: remind a little more often again.
    if v_row.clicked_at is null then
      update public.notification_prefs np
      set backoff_level = greatest(0, np.backoff_level - 1), ignored_streak = 0
      where np.user_id = v_uid and (np.backoff_level > 0 or np.ignored_streak > 0);
    end if;
  end if;
end;
$$;

-- Newest first (created_at desc, id desc), p_limit clamped to 1..50, only rows older than p_before when given.
-- Rows sharing the created_at of the page's last row are all included, so paging with
-- p_before = last created_at never skips one; has_more tells whether older rows remain.
create or replace function public.list_notifications(p_limit integer default 20, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 20)));
  v_cutoff timestamptz;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select min(x.created_at) into v_cutoff
  from (
    select n.created_at from public.notifications n
    where n.user_id = v_uid and (p_before is null or n.created_at < p_before)
    order by n.created_at desc, n.id desc
    limit v_limit
  ) as x;
  if v_cutoff is null then
    return jsonb_build_object('items', '[]'::jsonb, 'has_more', false);
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', n.id,
           'kind', n.kind,
           'title_vi', n.title_vi,
           'body_vi', n.body_vi,
           'action_url', n.action_url,
           'payload', n.payload,
           'local_day', to_char(n.local_day, 'YYYY-MM-DD'),
           'created_at', n.created_at,
           'read_at', n.read_at,
           'clicked_at', n.clicked_at
         ) order by n.created_at desc, n.id desc)
    into v_items
  from public.notifications n
  where n.user_id = v_uid and (p_before is null or n.created_at < p_before) and n.created_at >= v_cutoff;

  return jsonb_build_object(
    'items', v_items,
    'has_more', exists (select 1 from public.notifications n where n.user_id = v_uid and n.created_at < v_cutoff)
  );
end;
$$;

create or replace function public.unread_notification_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  return (select count(*)::integer from public.notifications n where n.user_id = v_uid and n.read_at is null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Generation (service_role)
-- ---------------------------------------------------------------------------

-- Creates the inbox rows due at p_now (see the header) and returns dueNotificationSchema rows
-- [{notification_id, user_id, title, body, url}] for the rows created by this call whose learner has
-- push_enabled and at least one push subscription.
create or replace function public.generate_due_notifications(p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_reminder_kinds constant text[] := array['review_due', 'resume_lesson', 'quick_check'];
  v_out jsonb := '[]'::jsonb;
  r record;
  v_dow integer;
  v_quiet boolean;
  v_push boolean;
  v_sent text[];
  v_kind text;
  v_title text;
  v_body text;
  v_url text;
  v_payload jsonb;
  v_id uuid;
  v_run record;
  v_path public.learning_paths;
  v_due integer;
begin
  -- Ignores: reminders still unclicked 24 h later, on a day the learner did not become active.
  with checked as (
    update public.notifications n set ignore_checked = true
    where not n.ignore_checked and n.kind <> 'weekly_summary' and n.created_at <= v_now - interval '24 hours'
    returning n.user_id, n.local_day, n.clicked_at
  ), ignored as (
    select c.user_id, count(*)::integer as n
    from checked c
    where c.clicked_at is null and not public.reminders_day_active(c.user_id, c.local_day)
    group by c.user_id
  )
  update public.notification_prefs np set
    backoff_level = least(3, np.backoff_level + (np.ignored_streak + i.n) / 3),
    ignored_streak = (np.ignored_streak + i.n) % 3
  from ignored i
  where np.user_id = i.user_id;

  -- Activity: being active on the local day lowers the backoff once per day.
  update public.notification_prefs np set
    backoff_level = greatest(0, np.backoff_level - 1),
    ignored_streak = 0,
    backoff_relief_day = d.today
  from (
    select p.id, (v_now at time zone coalesce(p.timezone, 'Asia/Ho_Chi_Minh'))::date as today
    from public.profiles p
  ) as d
  where d.id = np.user_id and (np.backoff_level > 0 or np.ignored_streak > 0)
    and np.backoff_relief_day is distinct from d.today
    and public.reminders_day_active(np.user_id, d.today);

  for r in
    select p.id as user_id,
           (v_now at time zone coalesce(p.timezone, 'Asia/Ho_Chi_Minh')) as local_ts,
           coalesce(np.reminders_enabled, false) as reminders_enabled,
           coalesce(np.remind_days, '{1,2,3,4,5,6,7}'::smallint[]) as remind_days,
           coalesce(np.quiet_start, time '22:00') as quiet_start,
           coalesce(np.quiet_end, time '07:00') as quiet_end,
           coalesce(np.max_per_day, 1::smallint) as max_per_day,
           coalesce(np.weekly_summary, true) as weekly_summary,
           coalesce(np.push_enabled, false) as push_enabled,
           coalesce(np.backoff_level, 0::smallint) as backoff_level,
           s.slot, s.reminder_day
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    cross join lateral public.reminders_slot(
      v_now at time zone coalesce(p.timezone, 'Asia/Ho_Chi_Minh'),
      coalesce(np.remind_at, time '19:30'),
      case when coalesce(np.reminders_enabled, false) then coalesce(np.max_per_day, 1) else 1 end
    ) as s
    where coalesce(np.reminders_enabled, false) or coalesce(np.weekly_summary, true)
    order by p.id
  loop
    v_dow := extract(isodow from r.reminder_day)::integer;
    v_quiet := public.reminders_in_quiet(r.local_ts::time, r.quiet_start, r.quiet_end);
    v_push := r.push_enabled and exists (select 1 from public.push_subscriptions ps where ps.user_id = r.user_id);

    -- Reminder
    if r.reminders_enabled
       and v_dow = any (r.remind_days)
       and public.reminders_backoff_allows(r.backoff_level, v_dow)
       and not v_quiet
       and not public.reminders_day_active(r.user_id, r.reminder_day)
       and not exists (
         select 1 from public.notifications n
         where n.user_id = r.user_id and n.kind = any (v_reminder_kinds)
           and n.created_at > v_now - interval '15 minutes' and n.created_at < v_now + interval '15 minutes'
       ) then
      select coalesce(array_agg(n.kind), '{}') into v_sent
      from public.notifications n
      where n.user_id = r.user_id and n.local_day = r.reminder_day and n.kind = any (v_reminder_kinds);

      if cardinality(v_sent) < r.max_per_day then
        v_kind := null;

        -- 1. resume_lesson: a run in progress started within the last 7 days.
        if not ('resume_lesson' = any (v_sent)) then
          select lr.lesson_id, lr.learning_path_id, l.title ->> 'vi' as title into v_run
          from public.lesson_runs lr
          join public.lessons l on l.id = lr.lesson_id
          join public.learning_paths lp on lp.id = lr.learning_path_id and lp.status <> 'archived'
          where lr.user_id = r.user_id and lr.status = 'in_progress'
            and lr.started_at > v_now - interval '7 days' and lr.started_at <= v_now
          order by lr.started_at desc, lr.id
          limit 1;
          if found then
            v_kind := 'resume_lesson';
            v_title := 'Học tiếp bài đang dở';
            v_body := case when nullif(btrim(coalesce(v_run.title, '')), '') is null
              then 'Bài học của bạn vẫn đang chờ. Mở lại là học tiếp từ chỗ đã dừng.'
              else format('Bài “%s” vẫn đang chờ bạn. Mở lại là học tiếp từ chỗ đã dừng.', left(btrim(v_run.title), 120)) end;
            v_url := '/app/hoc-tap/bai/' || v_run.lesson_id::text;
            v_payload := jsonb_build_object('lesson_id', v_run.lesson_id, 'learning_path_id', v_run.learning_path_id);
          end if;
        end if;

        -- 2. review_due: cards due today on the current (active) path.
        if v_kind is null and not ('review_due' = any (v_sent)) then
          select lp.* into v_path
          from public.profiles p
          join public.learning_paths lp on lp.id = p.current_learning_path_id and lp.user_id = p.id
          where p.id = r.user_id and lp.status = 'active';
          if found then
            v_due := coalesce((public.review_day_totals(r.user_id, v_path.id, v_path.weekly_minutes, false, v_now) ->> 'due_total')::integer, 0);
            if v_due > 0 then
              v_kind := 'review_due';
              v_title := 'Ôn tập nhanh 5 phút';
              v_body := format('Có %s thẻ đang chờ — ôn 5 phút là đủ.', v_due);
              v_url := '/app/on-tap';
              v_payload := jsonb_build_object('due_count', v_due, 'learning_path_id', v_path.id);
            end if;
          end if;
        end if;

        -- 3. quick_check: a short session.
        if v_kind is null and not ('quick_check' = any (v_sent)) then
          v_kind := 'quick_check';
          v_title := 'Một phiên ngắn 10 phút nhé?';
          v_body := 'Vài câu luyện nhanh giúp kiến thức ở lại lâu hơn. Lúc nào tiện thì mình bắt đầu.';
          v_url := '/app/phien-hoc?phut=10';
          v_payload := '{}'::jsonb;
        end if;

        if v_kind is not null then
          v_id := null;
          insert into public.notifications (user_id, kind, title_vi, body_vi, action_url, payload, local_day, created_at)
          values (r.user_id, v_kind, v_title, v_body, v_url, v_payload, r.reminder_day, v_now)
          on conflict (user_id, kind, local_day) do nothing
          returning id into v_id;
          if v_id is not null and v_push then
            v_out := v_out || jsonb_build_array(jsonb_build_object(
              'notification_id', v_id, 'user_id', r.user_id, 'title', v_title, 'body', v_body, 'url', v_url));
          end if;
        end if;
      end if;
    end if;

    -- Weekly summary (Sunday, first slot).
    if r.weekly_summary and v_dow = 7 and r.slot = 0 then
      v_payload := public.reminders_weekly_payload(r.user_id, r.reminder_day);
      if v_payload is not null then
        v_title := 'Báo cáo tuần của bạn';
        v_body := public.reminders_weekly_body(v_payload);
        v_url := '/app/tien-do';
        v_id := null;
        insert into public.notifications (user_id, kind, title_vi, body_vi, action_url, payload, local_day, created_at)
        values (r.user_id, 'weekly_summary', v_title, v_body, v_url, v_payload, r.reminder_day, v_now)
        on conflict (user_id, kind, local_day) do nothing
        returning id into v_id;
        if v_id is not null and v_push and not v_quiet then
          v_out := v_out || jsonb_build_array(jsonb_build_object(
            'notification_id', v_id, 'user_id', r.user_id, 'title', v_title, 'body', v_body, 'url', v_url));
        end if;
      end if;
    end if;
  end loop;

  return v_out;
end;
$$;

-- Retention: deletes inbox rows older than REMINDER_RULES.retention_days (90); returns how many.
create or replace function public.purge_notifications()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.notifications n where n.created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account export (20261014000910_account_data.sql): reminder prefs and the inbox are exported with the
-- learner's other data. Push subscriptions are left out on purpose: their keys are device credentials.
-- Account deletion needs nothing: every table here cascades from auth.users.
-- ---------------------------------------------------------------------------

create or replace function public.account_optional_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['study_sessions', 'activity_days', 'user_badges', 'analytics_events', 'notification_prefs', 'notifications'];
$$;

-- ---------------------------------------------------------------------------
-- Privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------

revoke all on function public.reminders_day_active(uuid, date) from public, anon, authenticated;
revoke all on function public.reminders_backoff_allows(integer, integer) from public, anon, authenticated;
revoke all on function public.reminders_in_quiet(time, time, time) from public, anon, authenticated;
revoke all on function public.reminders_slot(timestamp, time, integer) from public, anon, authenticated;
revoke all on function public.reminders_prefs_json(uuid) from public, anon, authenticated;
revoke all on function public.reminders_skill_vi(text) from public, anon, authenticated;
revoke all on function public.reminders_weekly_payload(uuid, date) from public, anon, authenticated;
revoke all on function public.reminders_weekly_body(jsonb) from public, anon, authenticated;
revoke all on function public.account_optional_tables() from public, anon, authenticated;

revoke all on function public.get_notification_prefs() from public, anon;
revoke all on function public.set_notification_prefs(jsonb) from public, anon;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.mark_notification(uuid, text) from public, anon;
revoke all on function public.list_notifications(integer, timestamptz) from public, anon;
revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.get_notification_prefs() to authenticated;
grant execute on function public.set_notification_prefs(jsonb) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.mark_notification(uuid, text) to authenticated;
grant execute on function public.list_notifications(integer, timestamptz) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;

revoke all on function public.generate_due_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.purge_notifications() from public, anon, authenticated;
grant execute on function public.generate_due_notifications(timestamptz) to service_role;
grant execute on function public.purge_notifications() to service_role;
