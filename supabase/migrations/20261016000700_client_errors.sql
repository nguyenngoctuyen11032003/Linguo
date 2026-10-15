-- Linguo: privacy-preserving client error reporting inside the analytics system. Adds the `client_error` event
-- (strict props whitelist: kind enum, code/build tokens, online flag; route template only; <= 20 stored per user
-- per hour, the excess silently dropped), keeps the opt-out and 180-day retention of analytics_events, and adds a
-- `client_errors` aggregate to admin_analytics. client_error rows do not count as user activity (DAU/WAU).

alter table public.analytics_events drop constraint analytics_events_name_check;
alter table public.analytics_events add constraint analytics_events_name_check check (name in (
  'page_view', 'onboarding_completed', 'diagnostic_started', 'diagnostic_completed', 'lesson_started',
  'lesson_completed', 'review_session_completed', 'ai_sheet_opened', 'progress_viewed', 'exam_started',
  'exam_completed', 'badge_earned', 'client_error'
));

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
    'exam_completed', 'badge_earned', 'client_error'];
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
  v_keep boolean[] := '{}'::boolean[];
  v_ce_budget integer;
  v_kept integer;
  v_k text;
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

    if (v_ev ->> 'name') = 'client_error' then
      -- Strict whitelist: kind (enum), optional code / build (short tokens, never free text), optional online.
      if octet_length(v_props::text) > 300
         or jsonb_typeof(v_props -> 'kind') is distinct from 'string'
         or (v_props ->> 'kind') <> all (array['render_error', 'unhandled_rejection', 'window_error', 'chunk_load_error', 'rpc_error']) then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
      for v_k in select k from jsonb_object_keys(v_props) as t(k) loop
        if v_k not in ('kind', 'code', 'build', 'online') then
          raise exception using errcode = 'P0001', message = 'invalid_event';
        end if;
      end loop;
      if (v_props -> 'code') is not null
         and (jsonb_typeof(v_props -> 'code') <> 'string' or (v_props ->> 'code') !~ '^[A-Za-z0-9_.:-]{1,60}$') then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
      if (v_props -> 'build') is not null
         and (jsonb_typeof(v_props -> 'build') <> 'string' or (v_props ->> 'build') !~ '^[A-Za-z0-9_.+-]{1,40}$') then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
      if (v_props -> 'online') is not null and jsonb_typeof(v_props -> 'online') <> 'boolean' then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
      -- Route template only: no ids, queries or hashes.
      if (v_ev -> 'route') is not null and jsonb_typeof(v_ev -> 'route') = 'string'
         and ((v_ev ->> 'route') !~ '^/[A-Za-z0-9_:*/-]*$'
              or (v_ev ->> 'route') ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}') then
        raise exception using errcode = 'P0001', message = 'invalid_event';
      end if;
    end if;

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

  -- client_error: at most 20 stored per user per hour; the excess is dropped silently (never raised).
  select greatest(0, 20 - count(*))::integer into v_ce_budget
  from public.analytics_events a
  where a.user_id = v_uid and a.name = 'client_error' and a.created_at > now() - interval '1 hour';
  for v_i in 1 .. v_count loop
    if v_names_in[v_i] = 'client_error' then
      v_keep := array_append(v_keep, v_ce_budget > 0);
      v_ce_budget := v_ce_budget - 1;
    else
      v_keep := array_append(v_keep, true);
    end if;
  end loop;

  insert into public.analytics_events (user_id, name, props, route, client_at)
  select v_uid, v_names_in[i], v_props_in[i], v_routes_in[i], v_at_in[i]
  from generate_series(1, v_count) as i
  where v_keep[i];
  get diagnostics v_kept = row_count;
  return v_kept;
end;
$$;

create or replace function public.admin_analytics(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_days integer;
  v_today date;
  v_from date;
  v_from_ts timestamptz;
  v_result jsonb;
begin
  perform admin_private.require_role('admin');
  v_days := admin_private.check_range(p_days);
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - (v_days - 1);
  v_from_ts := v_from::timestamp at time zone v_tz;

  with active as (
    select a.user_id, a.local_day as day from public.activity_days a where a.local_day >= v_from
    union
    select e.user_id, (e.created_at at time zone v_tz)::date from public.analytics_events e where e.created_at >= v_from_ts and e.name <> 'client_error'
  ), cohort as (
    select u.id, (u.created_at at time zone v_tz)::date as signup_day
    from auth.users u where u.created_at >= v_from_ts
  ), cohort_stats as (
    select c.id,
      exists (select 1 from public.learning_paths lp where lp.user_id = c.id) as onboarded,
      (select count(*) from public.lesson_runs r where r.user_id = c.id and r.status = 'completed') as lessons,
      exists (select 1 from active a where a.user_id = c.id and a.day >= c.signup_day + 7) as returned
    from cohort c
  )
  select jsonb_build_object(
    'days', v_days,
    'daily', (
      select jsonb_agg(jsonb_build_object(
          'day', to_char(d.day, 'YYYY-MM-DD'),
          'dau', (select count(distinct a.user_id)::integer from active a where a.day = d.day),
          'lessons_completed', (
            select count(*)::integer from public.lesson_runs r
            where r.status = 'completed' and (r.completed_at at time zone v_tz)::date = d.day),
          'review_sessions', (
            select count(*)::integer from public.analytics_events e
            where e.name = 'review_session_completed' and (e.created_at at time zone v_tz)::date = d.day),
          'exam_attempts', (
            select count(*)::integer from public.exam_attempts x where (x.started_at at time zone v_tz)::date = d.day))
        order by d.day)
      from (select gs::date as day from generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') gs) d
    ),
    'wau', (select count(distinct a.user_id)::integer from active a where a.day > v_today - 7),
    'onboarding_completed', (
      select count(*)::integer from (
        select lp.user_id from public.learning_paths lp group by lp.user_id having min(lp.created_at) >= v_from_ts) o),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*)::integer from cohort_stats),
      'onboarded', (select count(*)::integer from cohort_stats s where s.onboarded),
      'first_lesson', (select count(*)::integer from cohort_stats s where s.lessons >= 1),
      'third_lesson', (select count(*)::integer from cohort_stats s where s.lessons >= 3),
      'returned_day7', (select count(*)::integer from cohort_stats s where s.returned)),
    'client_errors', jsonb_build_object(
      'total', (select count(*)::integer from public.analytics_events e where e.name = 'client_error' and e.created_at >= v_from_ts),
      'by_kind', coalesce((
        select jsonb_agg(jsonb_build_object('kind', k.kind, 'count', k.n) order by k.n desc, k.kind)
        from (select e.props ->> 'kind' as kind, count(*)::integer as n from public.analytics_events e
              where e.name = 'client_error' and e.created_at >= v_from_ts group by 1) k), '[]'::jsonb),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('kind', t.kind, 'route', t.route, 'count', t.n) order by t.n desc, t.kind, t.route)
        from (select e.props ->> 'kind' as kind, e.route, count(*)::integer as n from public.analytics_events e
              where e.name = 'client_error' and e.created_at >= v_from_ts group by 1, 2
              order by n desc, 1, 2 limit 10) t), '[]'::jsonb))
  ) into v_result;
  return v_result;
end;
$$;


revoke all on function public.track_events(jsonb) from public, anon;
grant execute on function public.track_events(jsonb) to authenticated;
revoke all on function public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_analytics(integer) to authenticated;
