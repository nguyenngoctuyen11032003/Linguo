begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- save_session_plan(p_replace => true) on a started session ("Rút gọn còn 10 phút") keeps the same row, its
-- started_at and its status (20261018110000_session_shorten_keeps_start.sql). Plans use review/recap activities
-- only, so no lesson content is needed.

create function public.ss_as(p_sub text) returns void language sql volatile as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
$$;

create function public.ss_act(p_id text, p_kind text, p_minutes integer, p_status text default 'pending', p_seconds integer default 0)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'kind', p_kind, 'minutes', p_minutes, 'lesson_id', null,
    'review_limit', case when p_kind = 'review' then 20 end, 'title_vi', 'Hoạt động ' || p_id, 'reason_vi', 'Lý do ' || p_id,
    'priority', 50, 'status', p_status, 'seconds_spent', p_seconds);
$$;

create function public.ss_plan(p_acts jsonb, p_minutes integer) returns jsonb language sql immutable as $$
  select jsonb_build_object('minutes', p_minutes, 'activities', p_acts, 'focus_vi', 'Ôn tập', 'backlog_mode', false);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('5e550000-0000-4000-8000-00000000000a', 'ss-a@test.dev', '{}');

set local role authenticated;
select public.ss_as('5e550000-0000-4000-8000-00000000000a');
select set_config('test.p', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array_fill(30::smallint, array[7]))).id::text, true);

-- A 30-minute session: three reviews and a recap.
select set_config('test.s1', public.save_session_plan(current_setting('test.p')::uuid, public.ss_plan(jsonb_build_array(
  public.ss_act('a1', 'review', 10), public.ss_act('a2', 'review', 10), public.ss_act('a3', 'review', 7),
  public.ss_act('a4', 'recap', 3)), 30), false)::text, true);
select set_config('test.id', current_setting('test.s1')::jsonb ->> 'id', true);
select is(current_setting('test.s1')::jsonb ->> 'status', 'planned', 'new session is planned');

-- ===== Not started: replace still abandons and creates a new row =====
select set_config('test.s0', public.save_session_plan(current_setting('test.p')::uuid, public.ss_plan(jsonb_build_array(
  public.ss_act('a1', 'review', 10), public.ss_act('a2', 'review', 10), public.ss_act('a3', 'review', 7),
  public.ss_act('a4', 'recap', 3)), 30), true)::text, true);
select isnt(current_setting('test.s0')::jsonb ->> 'id', current_setting('test.id'), 'replacing an unstarted session creates a new row');
select is((select status from public.study_sessions where id = current_setting('test.id')::uuid), 'abandoned', 'the unstarted session is abandoned');
select set_config('test.id', current_setting('test.s0')::jsonb ->> 'id', true);

-- ===== Start it: a1 done with 300 seconds =====
select set_config('test.u', public.update_session_item(current_setting('test.id')::uuid, 'a1', 'done', 300)::text, true);
select set_config('test.started', current_setting('test.u')::jsonb ->> 'started_at', true);
select is(current_setting('test.u')::jsonb ->> 'status', 'in_progress', 'first update starts the session');

-- ===== Shorten: a1 (done) kept, 10 more minutes =====
select set_config('test.s2', public.save_session_plan(current_setting('test.p')::uuid, public.ss_plan(jsonb_build_array(
  public.ss_act('a1', 'review', 10, 'done', 300), public.ss_act('a2', 'review', 7), public.ss_act('a4', 'recap', 3)), 20), true)::text, true);
select is(current_setting('test.s2')::jsonb ->> 'id', current_setting('test.id'), 'shortening a started session keeps the same row');
select is(current_setting('test.s2')::jsonb ->> 'status', 'in_progress', 'the shortened session stays in progress');
select is(current_setting('test.s2')::jsonb ->> 'started_at', current_setting('test.started'), 'started_at is kept');
select is(current_setting('test.s2')::jsonb ->> 'created_at', current_setting('test.s0')::jsonb ->> 'created_at', 'created_at is kept');
select ok(current_setting('test.s2')::jsonb ->> 'completed_at' is null, 'the shortened session is still open');
select is((current_setting('test.s2')::jsonb ->> 'minutes_planned')::integer, 20, 'minutes_planned follows the new plan');
select is(array(select e ->> 'id' from jsonb_array_elements(current_setting('test.s2')::jsonb #> '{plan,activities}') as e), array['a1', 'a2', 'a4'], 'the new plan is stored');
select is((select count(*)::integer from public.study_sessions where path_id = current_setting('test.p')::uuid and status = 'abandoned'), 1,
  'no extra abandoned row');
select is(public.get_today_session(current_setting('test.p')::uuid) -> 'studied_seconds_today', '300'::jsonb,
  'the carried-over seconds are counted once');
select is(public.get_today_session(current_setting('test.p')::uuid) #>> '{session,id}', current_setting('test.id'), 'today''s session is the same row');

-- p_replace=false still returns the open session unchanged.
select is(public.save_session_plan(current_setting('test.p')::uuid, public.ss_plan(jsonb_build_array(public.ss_act('a1', 'review', 5)), 5), false) ->> 'minutes_planned',
  '20', 'p_replace=false returns the open session unchanged');

-- The session keeps working: finishing a2 and a4 completes it.
select is(public.update_session_item(current_setting('test.id')::uuid, 'a2', 'done', 60) ->> 'status', 'in_progress', 'update after shortening');
select set_config('test.u', public.update_session_item(current_setting('test.id')::uuid, 'a4', 'done', 30)::text, true);
select is(current_setting('test.u')::jsonb ->> 'status', 'completed', 'finishing the last activity completes it');
select is(current_setting('test.u')::jsonb ->> 'started_at', current_setting('test.started'), 'started_at survives to completion');

-- ===== A started session whose new plan has nothing pending is completed =====
select set_config('test.s3', public.save_session_plan(current_setting('test.p')::uuid, public.ss_plan(jsonb_build_array(
  public.ss_act('a1', 'review', 10), public.ss_act('a2', 'review', 10)), 20), false)::text, true);
select set_config('test.id3', current_setting('test.s3')::jsonb ->> 'id', true);
select public.update_session_item(current_setting('test.id3')::uuid, 'a1', 'skipped', 0);
select set_config('test.s4', public.save_session_plan(current_setting('test.p')::uuid, public.ss_plan(jsonb_build_array(
  public.ss_act('a1', 'review', 10, 'skipped', 0)), 10), true)::text, true);
select is(current_setting('test.s4')::jsonb ->> 'id', current_setting('test.id3'), 'same row when nothing is left');
select is(current_setting('test.s4')::jsonb ->> 'status', 'completed', 'a plan with nothing pending completes the session');
select ok(current_setting('test.s4')::jsonb ->> 'completed_at' is not null, 'completed_at set');

-- ===== Invalid plans are still rejected =====
select throws_ok(format('select public.save_session_plan(%L, %L, true)', current_setting('test.p'),
  public.ss_plan('[]'::jsonb, 10)), 'P0001', 'invalid_plan', 'invalid plan rejected');

select * from finish();
rollback;
