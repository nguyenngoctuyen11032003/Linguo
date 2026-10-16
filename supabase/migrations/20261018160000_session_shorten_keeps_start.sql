-- Shortening a started session ("Rút gọn còn 10 phút") keeps the same study_sessions row.
--
-- save_session_plan(p_replace => true) used to abandon the open session and insert a fresh 'planned' row, so a
-- session already under way lost its started_at and its 'in_progress' status, and the finished activities the
-- shortened plan carries over were counted twice in studied_seconds_today (once in the abandoned row, once in the
-- new one).
--
-- Now, when today's open session has been started (status 'in_progress' or started_at set), p_replace=true stores
-- the new plan on that same row: id, created_at, started_at and status are kept. As in update_session_item, the
-- session is completed when the new plan has no pending activity. A session that has not been started is still
-- abandoned and replaced by a new 'planned' row ("Lập lại kế hoạch"), as before.
--
-- Same function as 20261014000900_session_planner.sql apart from the started-session branch. It does not
-- validate language codes (the path checks stay in review_path_for_user / session_plan_normalize).

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
  v_open public.study_sessions;
  v_id uuid;
  v_done boolean;
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

  select s.* into v_open
  from public.study_sessions s
  where s.path_id = v_path.id and s.local_date = v_today and s.status in ('planned', 'in_progress')
  for update;
  if v_open.id is not null then
    if not coalesce(p_replace, false) then
      return public.study_session_json(v_open.id);
    end if;

    if v_open.status = 'in_progress' or v_open.started_at is not null then
      v_done := not exists (select 1 from jsonb_array_elements(v_plan -> 'activities') as e where e ->> 'status' = 'pending');
      update public.study_sessions
      set plan = v_plan,
          minutes_planned = (v_plan ->> 'minutes')::integer,
          status = case when v_done then 'completed' else 'in_progress' end,
          started_at = coalesce(started_at, v_now),
          completed_at = case when v_done then v_now end
      where id = v_open.id;
      return public.study_session_json(v_open.id);
    end if;

    update public.study_sessions set status = 'abandoned', completed_at = v_now where id = v_open.id;
  end if;

  insert into public.study_sessions (user_id, path_id, local_date, status, minutes_planned, plan, created_at)
  values (v_uid, v_path.id, v_today, 'planned', (v_plan ->> 'minutes')::integer, v_plan, v_now)
  returning id into v_id;
  return public.study_session_json(v_id);
end;
$$;

revoke all on function public.save_session_plan(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_session_plan(uuid, jsonb, boolean) to authenticated;
