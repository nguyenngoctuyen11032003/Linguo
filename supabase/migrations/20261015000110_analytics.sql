-- Linguo spec 8 §3: minimal internal analytics (PRD §13.1). Events carry an allowlisted name, a small PII-free
-- props bag and a route pattern; names and limits mirror ANALYTICS_EVENTS / analyticsEventSchema in
-- packages/shared/src/progress/contract.ts. Clients write only through track_events (never directly) and may
-- read back their own rows through RLS; user_preferences.analytics_opt_out makes track_events store nothing.
-- purge_analytics (service_role only) enforces the 180-day retention.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name in (
    'page_view', 'onboarding_completed', 'diagnostic_started', 'diagnostic_completed', 'lesson_started',
    'lesson_completed', 'review_session_completed', 'ai_sheet_opened', 'progress_viewed', 'exam_started',
    'exam_completed', 'badge_earned'
  )),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1024),
  route text check (route is null or (char_length(route) <= 80 and strpos(route, '?') = 0 and strpos(route, '#') = 0)),
  client_at timestamptz,
  created_at timestamptz not null default now()
);

create index analytics_events_user_created_idx on public.analytics_events (user_id, created_at desc);
create index analytics_events_created_at_idx on public.analytics_events (created_at);
comment on table public.analytics_events is 'Internal product events without PII (name, allowlisted props, route pattern); kept 180 days.';

alter table public.analytics_events enable row level security;

create policy "analytics events: read own" on public.analytics_events
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.analytics_events from public, anon, authenticated;
grant select on public.analytics_events to authenticated;

-- ---------------------------------------------------------------------------
-- track_events
-- ---------------------------------------------------------------------------

-- Stores a batch of at most 20 events for the caller and returns how many rows were stored (0 when the caller
-- opted out). The whole batch is validated first; any malformed element rejects it with invalid_event:
--   * element: object with name in ANALYTICS_EVENTS; props absent/null or an object of <= 8 keys matching
--     ^[a-z_]{1,32}$ whose values are strings <= 64 chars, numbers or booleans (<= 1 KB serialised);
--     route absent/null or a string <= 80 chars without '?' or '#'; at absent/null or an ISO timestamp.
-- More than 120 events per user in the last minute (including this batch) raises rate_limited.
create or replace function public.track_events(p_events jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_names constant text[] := array[
    'page_view', 'onboarding_completed', 'diagnostic_started', 'diagnostic_completed', 'lesson_started',
    'lesson_completed', 'review_session_completed', 'ai_sheet_opened', 'progress_viewed', 'exam_started',
    'exam_completed', 'badge_earned'];
  v_ev jsonb;
  v_props jsonb;
  v_key text;
  v_val jsonb;
  v_count integer;
  v_recent integer;
  v_names_in text[] := '{}'::text[];
  v_props_in jsonb[] := '{}'::jsonb[];
  v_routes_in text[] := '{}'::text[];
  v_at_in timestamptz[] := '{}'::timestamptz[];
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if coalesce((select up.analytics_opt_out from public.user_preferences up where up.user_id = v_uid), false) then
    return 0;
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 20 then
    raise exception using errcode = 'P0001', message = 'invalid_event';
  end if;
  v_count := jsonb_array_length(p_events);
  if v_count = 0 then
    return 0;
  end if;

  for v_ev in select e from jsonb_array_elements(p_events) as e loop
    if jsonb_typeof(v_ev) <> 'object'
       or jsonb_typeof(v_ev -> 'name') is distinct from 'string'
       or not ((v_ev ->> 'name') = any (v_names)) then
      raise exception using errcode = 'P0001', message = 'invalid_event';
    end if;

    v_props := coalesce(nullif(v_ev -> 'props', 'null'::jsonb), '{}'::jsonb);
    if jsonb_typeof(v_props) <> 'object'
       or (select count(*) from jsonb_object_keys(v_props)) > 8
       or octet_length(v_props::text) > 1024 then
      raise exception using errcode = 'P0001', message = 'invalid_event';
    end if;
    for v_key, v_val in select k, v from jsonb_each(v_props) as t(k, v) loop
      if v_key !~ '^[a-z_]{1,32}$'
         or not (
           (jsonb_typeof(v_val) = 'string' and char_length(v_val #>> '{}') <= 64)
           or jsonb_typeof(v_val) in ('number', 'boolean')
         ) then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
    end loop;

    if (v_ev -> 'route') is not null and jsonb_typeof(v_ev -> 'route') <> 'null'
       and (jsonb_typeof(v_ev -> 'route') <> 'string'
            or char_length(v_ev ->> 'route') > 80
            or strpos(v_ev ->> 'route', '?') > 0
            or strpos(v_ev ->> 'route', '#') > 0) then
      raise exception using errcode = 'P0001', message = 'invalid_event';
    end if;

    v_at := null;
    if (v_ev -> 'at') is not null and jsonb_typeof(v_ev -> 'at') <> 'null' then
      if jsonb_typeof(v_ev -> 'at') <> 'string' then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
      begin
        v_at := (v_ev ->> 'at')::timestamptz;
      exception when others then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end;
    end if;

    v_names_in := array_append(v_names_in, v_ev ->> 'name');
    v_props_in := array_append(v_props_in, v_props);
    v_routes_in := array_append(v_routes_in, v_ev ->> 'route');
    v_at_in := array_append(v_at_in, v_at);
  end loop;

  -- Serialise a user's concurrent batches so the per-minute limit cannot be raced.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('track_events:' || v_uid::text, 0));
  select count(*)::integer into v_recent
  from public.analytics_events a
  where a.user_id = v_uid and a.created_at > now() - interval '1 minute';
  if v_recent + v_count > 120 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.analytics_events (user_id, name, props, route, client_at)
  select v_uid, v_names_in[i], v_props_in[i], v_routes_in[i], v_at_in[i]
  from generate_series(1, v_count) as i;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_analytics (scheduled with the service key)
-- ---------------------------------------------------------------------------
create or replace function public.purge_analytics()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.analytics_events a where a.created_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.track_events(jsonb) from public, anon;
grant execute on function public.track_events(jsonb) to authenticated;

revoke all on function public.purge_analytics() from public, anon, authenticated;
grant execute on function public.purge_analytics() to service_role;
