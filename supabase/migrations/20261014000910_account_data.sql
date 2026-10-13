-- Linguo spec 7 §1: learners export and delete their own data; a service-only job purges expired rows.
--   export_my_data()           every row the caller owns as one JSON document (no lesson content, no answer
--                              keys); at most 5 exports per hour ('rate_limited').
--   delete_my_account(text)    deletes the caller's auth.users row after the typed confirmation
--                              'XOA TAI KHOAN'; every user table goes with it and one anonymous row is
--                              written to account_deletions.
--   purge_expired_data()       retention job (service_role only, .github/workflows/maintenance.yml).
-- Tables added by later migrations (study_sessions, activity_days, user_badges, analytics_events, ...) are
-- handled through to_regclass + dynamic SQL so this file does not depend on them existing.
-- All RPCs are security definer with an empty search_path and never executable by anon.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per export, used only for the 5/hour limit; rows older than a day are purged.
create table public.account_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index account_export_requests_user_requested_idx on public.account_export_requests (user_id, requested_at desc);
create index account_export_requests_requested_at_idx on public.account_export_requests (requested_at);
comment on table public.account_export_requests is 'export_my_data calls, for its rate limit; kept 1 day.';

-- Deliberately anonymous: no user id, no email, nothing that links back to the deleted account.
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  reason_code text not null default 'self_service' check (reason_code ~ '^[a-z_]{1,32}$')
);
comment on table public.account_deletions is 'Anonymous log of account deletions (count and time only, never user_id or email).';

alter table public.account_export_requests enable row level security;
alter table public.account_deletions enable row level security;
revoke all on public.account_export_requests, public.account_deletions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Optional user tables (created by later migrations)
-- ---------------------------------------------------------------------------

-- Names of public tables that may or may not exist yet and are owned through a user_id column.
create or replace function public.account_optional_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['study_sessions', 'activity_days', 'user_badges', 'analytics_events'];
$$;

-- ---------------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------------

create or replace function public.export_my_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_recent integer;
  v_result jsonb;
  v_name text;
  v_tbl regclass;
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  -- Serialise concurrent exports of the same user so the limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('export_my_data:' || v_uid::text, 0));
  delete from public.account_export_requests r where r.user_id = v_uid and r.requested_at < v_now - interval '1 day';
  select count(*) into v_recent
  from public.account_export_requests r
  where r.user_id = v_uid and r.requested_at > v_now - interval '1 hour';
  if v_recent >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  insert into public.account_export_requests (user_id, requested_at) values (v_uid, v_now);

  v_result := jsonb_build_object(
    'format', 'linguo-export',
    'version', 1,
    'exported_at', v_now,
    'account', (
      select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
      from auth.users u where u.id = v_uid
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'preferences', (select to_jsonb(p) from public.user_preferences p where p.user_id = v_uid),
    'learning_paths', coalesce((
      select jsonb_agg(to_jsonb(lp) order by lp.created_at, lp.id)
      from public.learning_paths lp where lp.user_id = v_uid
    ), '[]'::jsonb),
    'skill_estimates', coalesce((
      select jsonb_agg(to_jsonb(se) order by se.assessed_at, se.id)
      from public.skill_estimates se
      join public.learning_paths lp on lp.id = se.learning_path_id
      where lp.user_id = v_uid
    ), '[]'::jsonb),
    -- Attempts are nested in their run. Unrevealed feedback loses the answer, as in get_lesson.
    'lesson_runs', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object('attempts', coalesce((
          select jsonb_agg(
            to_jsonb(a) || jsonb_build_object('feedback_json',
              case when a.revealed then a.feedback_json else a.feedback_json - 'display_answer' - 'explanation' end)
            order by a.created_at, a.id)
          from public.attempts a
          where a.lesson_run_id = r.id and a.user_id = v_uid
        ), '[]'::jsonb))
        order by r.started_at, r.id)
      from public.lesson_runs r where r.user_id = v_uid
    ), '[]'::jsonb),
    'review_cards', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.review_cards c where c.user_id = v_uid
    ), '[]'::jsonb),
    'review_item_mastery', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.learning_path_id, m.learning_item_id)
      from public.review_item_mastery m where m.user_id = v_uid
    ), '[]'::jsonb),
    'review_logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
      from public.review_logs l where l.user_id = v_uid
    ), '[]'::jsonb),
    -- Diagnostic responses never carry is_correct: it would reveal the item bank's answer key.
    'assessment_attempts', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('responses', coalesce((
          select jsonb_agg(jsonb_build_object(
              'seq', ar.seq, 'item_id', ar.item_id, 'skill', ar.skill, 'choice', ar.choice,
              'served_at', ar.served_at, 'answered_at', ar.answered_at)
            order by ar.seq)
          from public.assessment_responses ar where ar.attempt_id = t.id
        ), '[]'::jsonb))
        order by t.started_at, t.id)
      from public.assessment_attempts t where t.user_id = v_uid
    ), '[]'::jsonb),
    'ai_usage', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.created_at, u.id)
      from public.ai_usage u where u.user_id = v_uid
    ), '[]'::jsonb),
    'ai_reports', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
      from public.ai_reports r where r.user_id = v_uid
    ), '[]'::jsonb),
    'ai_quota', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.used_on)
      from public.ai_quota q where q.user_id = v_uid
    ), '[]'::jsonb)
  );

  -- Only optional tables that exist and have a user_id column (looked up in the catalog at run time).
  for v_name, v_tbl in
    select c.relname::text, c.oid::regclass
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = any (public.account_optional_tables())
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped
      )
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %s t where t.user_id = $1', v_tbl)
      into v_rows using v_uid;
    v_result := v_result || jsonb_build_object(v_name, v_rows);
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete account
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_confirm is distinct from 'XOA TAI KHOAN' then
    raise exception using errcode = 'P0001', message = 'invalid_confirmation';
  end if;

  -- Every current user table cascades from auth.users (directly or through learning_paths). Rows behind a
  -- foreign key that would not cascade (set null / restrict / no action, e.g. in a later migration) are
  -- deleted explicitly first: path children, then direct auth.users children.
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.learning_paths'::regclass and c.confdeltype <> 'c'
      and cardinality(c.conkey) = 1 and n.nspname = 'public'
      and c.conrelid <> 'public.profiles'::regclass -- current_learning_path_id (set null); profiles cascades
  loop
    execute format('delete from %s where %I in (select lp.id from public.learning_paths lp where lp.user_id = $1)', r.tbl, r.col)
      using v_uid;
  end loop;

  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype <> 'c'
      and cardinality(c.conkey) = 1 and n.nspname = 'public'
  loop
    execute format('delete from %s where %I = $1', r.tbl, r.col) using v_uid;
  end loop;

  delete from auth.users u where u.id = v_uid;

  -- Tables keyed by user_id without any foreign key (none today) are swept last.
  for r in
    select format('%I.%I', c.table_schema, c.table_name) as tbl
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and c.data_type = 'uuid'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from %s where user_id = $1', r.tbl) using v_uid;
  end loop;

  insert into public.account_deletions (reason_code) values ('self_service');
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------

-- Deletes expired rows and returns how many went from each table:
--   ai_cache past expires_at; ai_usage older than 90 days; ai_quota older than 60 days;
--   account_export_requests older than 1 day; study_sessions never completed (planned / in_progress /
--   abandoned) and created more than 180 days ago, when that table exists.
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cache integer;
  v_usage integer;
  v_quota integer;
  v_exports integer;
  v_sessions integer := 0;
  v_sessions_tbl regclass;
begin
  delete from public.ai_cache c where c.expires_at < now();
  get diagnostics v_cache = row_count;
  delete from public.ai_usage u where u.created_at < now() - interval '90 days';
  get diagnostics v_usage = row_count;
  delete from public.ai_quota q where q.used_on < (now() at time zone 'UTC')::date - 60;
  get diagnostics v_quota = row_count;
  delete from public.account_export_requests r where r.requested_at < now() - interval '1 day';
  get diagnostics v_exports = row_count;

  -- study_sessions comes from another migration: resolved from the catalog at run time.
  select c.oid::regclass into v_sessions_tbl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'study_sessions' and c.relkind in ('r', 'p')
    and (
      select count(*) from pg_catalog.pg_attribute a
      where a.attrelid = c.oid and a.attname in ('status', 'created_at') and a.attnum > 0 and not a.attisdropped
    ) = 2;
  if v_sessions_tbl is not null then
    execute format('delete from %s s where s.status <> ''completed'' and s.created_at < now() - interval ''180 days''', v_sessions_tbl);
    get diagnostics v_sessions = row_count;
  end if;

  return jsonb_build_object(
    'ai_cache', v_cache,
    'ai_usage', v_usage,
    'ai_quota', v_quota,
    'account_export_requests', v_exports,
    'study_sessions', v_sessions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.account_optional_tables() from public, anon, authenticated;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account(text) from public, anon;
revoke all on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
grant execute on function public.purge_expired_data() to service_role;
