-- Linguo spec 10 hardening of the live reminders / Web Push system (security review). New migration only: the
-- deployed 20261015000300_reminders.sql is never edited.
--
--   1. Push endpoints are an allowlist, not "any https URL" (SSRF through notify-dispatch's fetch):
--      is_allowed_push_endpoint(text) = https://<FCM | Mozilla autopush | WNS | Apple host>[:443]/<path>, no
--      userinfo, no IP literal, no other port. save_push_subscription and a CHECK on push_subscriptions use it;
--      rows that cannot be a real browser subscription are deleted first (they cannot be legitimate).
--   2. save_push_subscription is rate limited: at most 20 calls per hour per learner ('rate_limited').
--   3. Learners can no longer read the p256dh / auth keys of their own subscriptions (the client only uses
--      the RPCs); every other column stays readable.
--   4. Catch-up: GitHub cron runs are often late or skipped, so a reminder is due from its slot start until
--      60 minutes later (was 15) and a run only skips it when a reminder of that user was already created in
--      that same slot window. The unique (user_id, kind, local_day) keeps catch-ups from duplicating, quiet
--      hours are judged at the time of the run. The weekly summary catches up the same way.
--   5. Lock-screen privacy: Web Push text is generic and chosen by notification kind (reminders_push_text);
--      lesson titles, due-card counts and study minutes stay in the in-app inbox rows only.
--   6. Retryable delivery: pending_push_notifications(p_now, p_limit) (service_role) returns the inbox rows that
--      never got a push (delivered_push_at null), created within the 4-hour push TTL, for learners with push on
--      and a device, so a run that failed after generating is retried by the next one. Rows already read or
--      reminders for a day the learner has since studied are skipped; a weekly summary waits out quiet hours.
--      notify-dispatch marks the rows delivered after sending.
--   7. purge_notifications() also drops the save-rate-limit bookkeeping older than a day; notify-dispatch calls
--      it once a night.

-- ---------------------------------------------------------------------------
-- 1. Endpoint allowlist
-- ---------------------------------------------------------------------------

-- Mirrors supabase/functions/notify-dispatch/endpoint.ts (isAllowedPushEndpoint).
create or replace function public.is_allowed_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(p_endpoint) <= 2048
    and p_endpoint ~* '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)+push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com|([a-z0-9-]+\.)+push\.apple\.com)(:443)?/[^[:space:]\\]*$',
    false);
$$;

-- Subscriptions that are not a real push service endpoint cannot be legitimate (the browser chose a real one):
-- remove them before the constraint is validated.
delete from public.push_subscriptions s where not public.is_allowed_push_endpoint(s.endpoint);

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_allowed check (public.is_allowed_push_endpoint(endpoint)) not valid;
alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_allowed;

-- ---------------------------------------------------------------------------
-- 2. Rate limit of save_push_subscription
-- ---------------------------------------------------------------------------

-- One row per call, used only for the 20/hour limit; rows older than a day are purged.
create table public.push_subscription_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  saved_at timestamptz not null default now()
);
create index push_subscription_saves_user_saved_idx on public.push_subscription_saves (user_id, saved_at desc);
create index push_subscription_saves_saved_at_idx on public.push_subscription_saves (saved_at);
comment on table public.push_subscription_saves is 'save_push_subscription calls, for its rate limit; kept 1 day.';
alter table public.push_subscription_saves enable row level security;
revoke all on public.push_subscription_saves from public, anon, authenticated;

-- Same as 20261015000300, plus the endpoint allowlist and at most 20 saves per hour ('rate_limited').
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
  v_now timestamptz := now();
  v_recent integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048
     or not public.is_allowed_push_endpoint(p_endpoint)
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]+=*$' or char_length(p_p256dh) > 200
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]+=*$' or char_length(p_auth) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_subscription';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push_subscriptions:' || v_uid::text, 0));

  delete from public.push_subscription_saves x where x.user_id = v_uid and x.saved_at < v_now - interval '1 day';
  select count(*)::integer into v_recent
  from public.push_subscription_saves x
  where x.user_id = v_uid and x.saved_at > v_now - interval '1 hour';
  if v_recent >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  insert into public.push_subscription_saves (user_id, saved_at) values (v_uid, v_now);

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

-- ---------------------------------------------------------------------------
-- 3. Keys are not readable by learners
-- ---------------------------------------------------------------------------

revoke select on public.push_subscriptions from authenticated;
grant select (id, user_id, endpoint, user_agent, created_at, last_success_at, failure_count)
  on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Catch-up window
-- ---------------------------------------------------------------------------

-- The reminder slot whose 60-minute window contains p_local (local wall-clock time), if any: slot k starts at
-- p_remind_at + k x 3 h for k < p_slots and before midnight. reminder_day is the local day the slot started on;
-- elapsed_seconds is how long ago the slot started (0 <= elapsed < 3600).
drop function public.reminders_slot(timestamp, time, integer);
create function public.reminders_slot(p_local timestamp, p_remind_at time, p_slots integer)
returns table (slot integer, reminder_day date, elapsed_seconds integer)
language sql
immutable
set search_path = ''
as $$
  select k,
         case when x.lt >= s.st then p_local::date else p_local::date - 1 end,
         mod(x.lt - s.st + 86400, 86400)::integer
  from (select extract(epoch from p_local::time) as lt) as x
  cross join generate_series(0, greatest(1, least(coalesce(p_slots, 1), 3)) - 1) as k
  cross join lateral (select extract(epoch from p_remind_at) + k * 10800 as st) as s
  where s.st < 86400
    and mod(x.lt - s.st + 86400, 86400) < 3600
  order by k
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 5. Generic push text
-- ---------------------------------------------------------------------------

-- {title, body} of the Web Push for a notification kind. Deliberately free of anything the learner studies
-- (no lesson title, card count, minutes or skill): it shows on the lock screen. Warm, no guilt.
create or replace function public.reminders_push_text(p_kind text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'review_due' then array['Ôn tập nhanh 5 phút', 'Có vài thẻ đang chờ bạn ôn nhanh.']
    when 'resume_lesson' then array['Học tiếp bài đang dở', 'Bài học của bạn vẫn đang chờ. Mở lại là học tiếp từ chỗ đã dừng.']
    when 'weekly_summary' then array['Báo cáo tuần của bạn', 'Báo cáo tuần của bạn đã sẵn sàng.']
    else array['Một phiên ngắn 10 phút nhé?', 'Vài câu luyện nhanh giúp kiến thức ở lại lâu hơn. Lúc nào tiện thì mình bắt đầu.']
  end;
$$;

-- ---------------------------------------------------------------------------
-- Generation (service_role): catch-up window, generic push text
-- ---------------------------------------------------------------------------

-- Creates the inbox rows due at p_now (see 20261015000300_reminders.sql and the header above) and returns
-- dueNotificationSchema rows [{notification_id, user_id, title, body, url}] for the rows created by this call whose
-- learner has push_enabled and at least one push subscription; title and body are the generic push text.
-- notify-dispatch sends what pending_push_notifications returns, which is a superset of this.
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
  v_slot_start timestamptz;
  v_text text[];
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
           s.slot, s.reminder_day, s.elapsed_seconds
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
    v_slot_start := v_now - make_interval(secs => r.elapsed_seconds);

    -- Reminder: due from the slot start until 60 minutes later; one per slot (a reminder created inside this
    -- slot's window means an earlier run already served it), and never beyond the unique (user, kind, day).
    if r.reminders_enabled
       and v_dow = any (r.remind_days)
       and public.reminders_backoff_allows(r.backoff_level, v_dow)
       and not v_quiet
       and not public.reminders_day_active(r.user_id, r.reminder_day)
       and not exists (
         select 1 from public.notifications n
         where n.user_id = r.user_id and n.kind = any (v_reminder_kinds)
           and n.created_at >= v_slot_start and n.created_at < v_slot_start + interval '60 minutes'
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
            v_text := public.reminders_push_text(v_kind);
            v_out := v_out || jsonb_build_array(jsonb_build_object(
              'notification_id', v_id, 'user_id', r.user_id, 'title', v_text[1], 'body', v_text[2], 'url', v_url));
          end if;
        end if;
      end if;
    end if;

    -- Weekly summary (Sunday, first slot, caught up within the slot's 60 minutes).
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
          v_text := public.reminders_push_text('weekly_summary');
          v_out := v_out || jsonb_build_array(jsonb_build_object(
            'notification_id', v_id, 'user_id', r.user_id, 'title', v_text[1], 'body', v_text[2], 'url', v_url));
        end if;
      end if;
    end if;
  end loop;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Retryable pickup (service_role)
-- ---------------------------------------------------------------------------

-- Inbox rows that still need a Web Push at p_now, oldest first (at most p_limit, clamped to 1..1000), as
-- dueNotificationSchema rows with the generic push text. A row qualifies while delivered_push_at is null, it is at
-- most 4 hours old (REMINDER_RULES.push_retry_hours, the push TTL), nobody has read it, the learner has push on and
-- a device, a reminder's day is still without study, and a weekly summary is not inside quiet hours.
create or replace function public.pending_push_notifications(p_now timestamptz default now(), p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_limit integer := least(1000, greatest(1, coalesce(p_limit, 500)));
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'notification_id', x.id,
             'user_id', x.user_id,
             'title', (public.reminders_push_text(x.kind))[1],
             'body', (public.reminders_push_text(x.kind))[2],
             'url', x.action_url) order by x.created_at, x.id)
    from (
      select n.id, n.user_id, n.kind, n.action_url, n.created_at
      from public.notifications n
      join public.notification_prefs np on np.user_id = n.user_id and np.push_enabled
      join public.profiles p on p.id = n.user_id
      where n.delivered_push_at is null
        and n.read_at is null
        and n.created_at > v_now - interval '4 hours'
        and n.created_at <= v_now
        and exists (select 1 from public.push_subscriptions ps where ps.user_id = n.user_id)
        and case
              when n.kind = 'weekly_summary' then
                not public.reminders_in_quiet(
                  (v_now at time zone coalesce(p.timezone, 'Asia/Ho_Chi_Minh'))::time, np.quiet_start, np.quiet_end)
              else not public.reminders_day_active(n.user_id, n.local_day)
            end
      order by n.created_at, n.id
      limit v_limit
    ) as x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Retention
-- ---------------------------------------------------------------------------

-- Deletes inbox rows older than REMINDER_RULES.retention_days (90) and the save-rate-limit rows older than a
-- day; returns how many inbox rows were deleted. Called once a night by notify-dispatch.
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
  delete from public.push_subscription_saves x where x.saved_at < now() - interval '1 day';
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------

revoke all on function public.is_allowed_push_endpoint(text) from public, anon, authenticated;
grant execute on function public.is_allowed_push_endpoint(text) to service_role;
revoke all on function public.reminders_slot(timestamp, time, integer) from public, anon, authenticated;
revoke all on function public.reminders_push_text(text) from public, anon, authenticated;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

revoke all on function public.generate_due_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.generate_due_notifications(timestamptz) to service_role;
revoke all on function public.pending_push_notifications(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.pending_push_notifications(timestamptz, integer) to service_role;
revoke all on function public.purge_notifications() from public, anon, authenticated;
grant execute on function public.purge_notifications() to service_role;
