-- Linguo spec 5 §4: data behind the ai-tutor Edge Function — daily quota, shared response cache,
-- content-free usage log, learner reports and the AI privacy notice acknowledgement.
-- Every RPC is security definer with an empty search_path and is never executable by anon.
-- Learner-facing RPCs (ai_quota_consume, ai_quota_status, ai_report, ack_ai_notice) are granted to
-- authenticated and take the user from auth.uid() only. RPCs that write shared or accounting state
-- (ai_cache_get/put, ai_usage_log, ai_quota_refund) are granted to service_role only, so learners cannot
-- poison the shared cache, forge usage rows or win back requests; the Edge Function calls them with a
-- service client and passes the user id it verified from the caller's token.
-- Clients never write the tables directly; ai_cache is not readable by clients at all.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.ai_quota (
  user_id uuid not null references auth.users (id) on delete cascade,
  used_on date not null,
  count integer not null default 0 check (count >= 0),
  refunded integer not null default 0 check (refunded between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, used_on)
);
create index ai_quota_used_on_idx on public.ai_quota (used_on);
comment on table public.ai_quota is 'AI requests per user per local day (learning_user_today); kept 60 days.';

create table public.ai_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  task text not null check (task in ('explain_concept', 'generate_practice', 'analyze_error')),
  prompt_version text not null check (char_length(prompt_version) between 1 and 32),
  model text not null check (char_length(model) between 1 and 100),
  payload jsonb not null check (octet_length(payload::text) <= 16384),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  hits integer not null default 0 check (hits >= 0)
);
create index ai_cache_expires_at_idx on public.ai_cache (expires_at);
comment on table public.ai_cache is 'Validated AI outputs shared across users, keyed by sha256 of the normalised request; 30-day TTL.';

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null check (task in ('explain_concept', 'generate_practice', 'analyze_error')),
  prompt_version text not null check (char_length(prompt_version) between 1 and 32),
  model text not null check (char_length(model) between 1 and 100),
  status text not null check (status ~ '^[a-z_]{1,32}$'),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  latency_ms integer not null default 0 check (latency_ms between 0 and 600000),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  input_chars integer not null default 0 check (input_chars between 0 and 100000),
  cached boolean not null default false,
  repaired boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_created_at_idx on public.ai_usage (created_at);
comment on table public.ai_usage is 'One row per AI request: metadata only, never prompt or output content; kept 90 days.';

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_id uuid unique references public.ai_usage (id) on delete set null,
  task text not null check (task in ('explain_concept', 'generate_practice', 'analyze_error')),
  prompt_version text not null check (char_length(prompt_version) between 1 and 32),
  reason text not null check (reason in ('wrong', 'unclear', 'unsafe', 'other')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index ai_reports_user_idx on public.ai_reports (user_id, created_at desc);
comment on table public.ai_reports is 'Learner reports about an AI response (one per response).';

alter table public.user_preferences add column ai_notice_ack_at timestamptz;
comment on column public.user_preferences.ai_notice_ack_at is 'When the learner acknowledged the AI privacy notice (set only by ack_ai_notice).';

-- ---------------------------------------------------------------------------
-- RLS and table privileges
-- ---------------------------------------------------------------------------

alter table public.ai_quota enable row level security;
alter table public.ai_cache enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_reports enable row level security;

create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_reports: read own" on public.ai_reports
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.ai_quota, public.ai_cache, public.ai_usage, public.ai_reports from public, anon, authenticated;
grant select on public.ai_usage, public.ai_reports to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Start of the learner's next local day (when today's quota resets).
create or replace function public.ai_quota_resets_at(p_user uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((public.learning_user_today(p_user) + 1)::timestamp)
    at time zone coalesce((select p.timezone from public.profiles p where p.id = p_user), 'Asia/Ho_Chi_Minh');
$$;

create or replace function public.ai_check_limit(p_limit integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 0 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'invalid_limit';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quota
-- ---------------------------------------------------------------------------

-- Takes one request from today's quota when fewer than p_limit were used. Atomic: concurrent calls never
-- exceed p_limit. Also drops quota rows older than 60 days.
create or replace function public.ai_quota_consume(p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_used integer;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform public.ai_check_limit(p_limit);
  v_today := public.learning_user_today(v_uid);

  delete from public.ai_quota q where q.used_on < (now() at time zone 'UTC')::date - 61;

  if p_limit > 0 then
    insert into public.ai_quota as q (user_id, used_on, count, updated_at)
    values (v_uid, v_today, 1, now())
    on conflict (user_id, used_on) do update
      set count = q.count + 1, updated_at = now()
      where q.count < p_limit
    returning q.count into v_used;
    v_allowed := v_used is not null;
  end if;

  if not v_allowed then
    select q.count into v_used from public.ai_quota q where q.user_id = v_uid and q.used_on = v_today;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'used', coalesce(v_used, 0),
    'limit', p_limit,
    'resets_at', public.ai_quota_resets_at(v_uid)
  );
end;
$$;

-- Gives back one request taken today after a failed AI call; at most 10 refunds per local day.
-- Service role only (the Edge Function passes the verified user id).
create or replace function public.ai_quota_refund(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_user';
  end if;
  update public.ai_quota q
  set count = q.count - 1, refunded = q.refunded + 1, updated_at = now()
  where q.user_id = p_user_id and q.used_on = public.learning_user_today(p_user_id)
    and q.count > 0 and q.refunded < 10;
  return found;
end;
$$;

create or replace function public.ai_quota_status(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_used integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform public.ai_check_limit(p_limit);
  select q.count into v_used from public.ai_quota q
  where q.user_id = v_uid and q.used_on = public.learning_user_today(v_uid);
  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'limit', p_limit,
    'resets_at', public.ai_quota_resets_at(v_uid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cache
-- ---------------------------------------------------------------------------

-- Payload of an unexpired entry (and counts the hit), or null. Service role only.
create or replace function public.ai_cache_get(p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  update public.ai_cache c
  set hits = c.hits + 1
  where c.key = p_key and c.expires_at > now()
  returning c.payload into v_payload;
  return v_payload;
end;
$$;

-- Stores (or replaces) an entry for 30 days and drops expired entries. Service role only: entries are
-- shared across users, so only the Edge Function may write validated outputs.
create or replace function public.ai_cache_put(
  p_key text, p_task text, p_prompt_version text, p_model text, p_payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_key';
  end if;
  if p_task is null or p_task not in ('explain_concept', 'generate_practice', 'analyze_error') then
    raise exception using errcode = '22023', message = 'invalid_task';
  end if;
  if p_prompt_version is null or char_length(p_prompt_version) not between 1 and 32
     or p_model is null or char_length(p_model) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_argument';
  end if;
  if p_payload is null then
    raise exception using errcode = '22023', message = 'invalid_payload';
  end if;
  if octet_length(p_payload::text) > 16384 then
    raise exception using errcode = '22023', message = 'payload_too_large';
  end if;

  delete from public.ai_cache c where c.expires_at <= now();

  insert into public.ai_cache as c (key, task, prompt_version, model, payload, created_at, expires_at, hits)
  values (p_key, p_task, p_prompt_version, p_model, p_payload, now(), now() + interval '30 days', 0)
  on conflict (key) do update
    set task = excluded.task, prompt_version = excluded.prompt_version, model = excluded.model,
        payload = excluded.payload, created_at = excluded.created_at, expires_at = excluded.expires_at, hits = 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usage log and reports
-- ---------------------------------------------------------------------------

-- Records one request (metadata only) for p_user_id and drops rows older than 90 days. Returns the row id,
-- which the function hands to the client as response_id. Service role only.
create or replace function public.ai_usage_log(
  p_user_id uuid, p_task text, p_prompt_version text, p_model text, p_status text, p_http_status integer,
  p_latency_ms integer, p_attempts integer, p_input_chars integer, p_cached boolean, p_repaired boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = '22023', message = 'invalid_user';
  end if;
  if p_task is null or p_task not in ('explain_concept', 'generate_practice', 'analyze_error') then
    raise exception using errcode = '22023', message = 'invalid_task';
  end if;
  if p_prompt_version is null or char_length(p_prompt_version) not between 1 and 32
     or p_model is null or char_length(p_model) not between 1 and 100
     or p_status is null or p_status !~ '^[a-z_]{1,32}$'
     or (p_http_status is not null and p_http_status not between 100 and 599)
     or coalesce(p_latency_ms, 0) not between 0 and 600000
     or coalesce(p_attempts, 0) not between 0 and 10
     or coalesce(p_input_chars, 0) not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'invalid_argument';
  end if;

  delete from public.ai_usage u where u.created_at < now() - interval '90 days';

  insert into public.ai_usage (user_id, task, prompt_version, model, status, http_status, latency_ms, attempts,
    input_chars, cached, repaired)
  values (p_user_id, p_task, p_prompt_version, p_model, p_status, p_http_status, coalesce(p_latency_ms, 0),
    coalesce(p_attempts, 0), coalesce(p_input_chars, 0), coalesce(p_cached, false), coalesce(p_repaired, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- Reports one of the caller's AI responses. Reporting the same response again replaces the reason/note
-- and returns the same id.
create or replace function public.ai_report(p_usage_id uuid, p_reason text, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_usage public.ai_usage;
  v_note text := nullif(btrim(p_note), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_reason is null or p_reason not in ('wrong', 'unclear', 'unsafe', 'other') then
    raise exception using errcode = '22023', message = 'invalid_reason';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'invalid_note';
  end if;
  select u.* into v_usage from public.ai_usage u where u.id = p_usage_id and u.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'usage_not_found';
  end if;

  insert into public.ai_reports as r (user_id, usage_id, task, prompt_version, reason, note)
  values (v_uid, v_usage.id, v_usage.task, v_usage.prompt_version, p_reason, v_note)
  on conflict (usage_id) do update set reason = excluded.reason, note = excluded.note, created_at = now()
  returning r.id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacy notice
-- ---------------------------------------------------------------------------

create or replace function public.ack_ai_notice()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  insert into public.user_preferences as p (user_id, ai_notice_ack_at)
  values (v_uid, now())
  on conflict (user_id) do update set ai_notice_ack_at = now(), updated_at = now()
  returning p.ai_notice_ack_at into v_at;
  return v_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.ai_quota_resets_at(uuid) from public, anon, authenticated;
revoke all on function public.ai_check_limit(integer) from public, anon, authenticated;

-- Learner-facing RPCs: authenticated only.
revoke all on function public.ai_quota_consume(integer) from public, anon;
revoke all on function public.ai_quota_status(integer) from public, anon;
revoke all on function public.ai_report(uuid, text, text) from public, anon;
revoke all on function public.ack_ai_notice() from public, anon;
grant execute on function public.ai_quota_consume(integer) to authenticated;
grant execute on function public.ai_quota_status(integer) to authenticated;
grant execute on function public.ai_report(uuid, text, text) to authenticated;
grant execute on function public.ack_ai_notice() to authenticated;

-- Edge-Function-only RPCs: service_role only.
revoke all on function public.ai_quota_refund(uuid) from public, anon, authenticated;
revoke all on function public.ai_cache_get(text) from public, anon, authenticated;
revoke all on function public.ai_cache_put(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ai_usage_log(uuid, text, text, text, text, integer, integer, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.ai_quota_refund(uuid) to service_role;
grant execute on function public.ai_cache_get(text) to service_role;
grant execute on function public.ai_cache_put(text, text, text, text, jsonb) to service_role;
grant execute on function public.ai_usage_log(uuid, text, text, text, text, integer, integer, integer, integer, boolean, boolean) to service_role;
