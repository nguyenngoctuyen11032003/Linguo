begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{"display_name": "A"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}');

-- ===== User A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok($$select public.create_learning_path('en', 'some', 'daily_communication', 'a2', 'b1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates an EN path (no deadline)');
select is((select count(*)::int from public.learning_paths), 1, 'A sees one path');
select is((select estimate->>'feasibility' from public.learning_paths where language_code = 'en'), 'no_deadline', 'estimate stored');
select is((select (estimate->>'hours_needed')::int from public.learning_paths where language_code = 'en'), 185, 'hours needed from the reference table');
select is((select count(*)::int from public.skill_estimates), 6, 'six self-reported skill estimates');
select is((select current_learning_path_id from public.profiles), (select id from public.learning_paths where language_code = 'en'), 'new path becomes current');

select throws_ok($$select public.create_learning_path('en', 'some', 'cefr', 'a2', 'b2', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'path_exists_for_language', 'one open path per language');
select throws_ok($$select public.create_learning_path('ko', 'new', 'cefr', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'invalid_goal_for_language', 'goal must match language');
select throws_ok($$select public.create_learning_path('ko', 'some', 'communication', 'topik3', 'topik2', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'target_not_above_current', 'target above current');
select throws_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[0,0,0,0,0,0,0]::smallint[])$$, 'P0001', 'invalid_schedule', 'schedule needs study time');
select throws_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[], current_date - 2)$$, 'P0001', 'target_date_in_past', 'no past deadlines');
select throws_ok($$select public.create_learning_path('ko', 'some', 'topik_i', 'topik1', 'topik3', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'target_not_allowed_for_goal', 'TOPIK I band');
select throws_ok($$select public.create_learning_path('en', 'some', 'cefr', 'a2', 'z9', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'invalid_level', 'unknown level');

select lives_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[15,15,15,15,15,15,15]::smallint[])$$, 'A creates a KO path');
select is((select current_learning_path_id from public.profiles), (select id from public.learning_paths where language_code = 'ko'), 'KO becomes current');
select lives_ok(format('select public.set_current_learning_path(%L)', (select id from public.learning_paths where language_code = 'en')), 'A switches back to EN');
select is((select current_learning_path_id from public.profiles), (select id from public.learning_paths where language_code = 'en'), 'EN is current again');

select throws_ok($$insert into public.learning_paths (user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, estimate)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[], '{}')$$, '42501', null, 'no direct insert');
select throws_ok($$update public.learning_paths set status = 'archived'$$, '42501', null, 'no direct update');
select throws_ok($$update public.profiles set current_learning_path_id = null$$, '42501', null, 'current path only via RPC');

select lives_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', (select id from public.learning_paths where language_code = 'en'), 'daily_communication', 'b2', '{60,60,60,60,60,60,60}'), 'A updates the EN plan');
select is((select (estimate->>'hours_needed')::int from public.learning_paths where language_code = 'en'), 385, 'estimate recomputed');

select lives_ok(format('select public.set_learning_path_status(%L, %L)', (select id from public.learning_paths where language_code = 'ko'), 'paused'), 'A pauses KO');
select throws_ok(format('select public.set_learning_path_status(%L, %L)', (select id from public.learning_paths where language_code = 'ko'), 'completed'), 'P0001', 'invalid_status_transition', 'paused cannot complete');

select set_config('test.a_ko', (select id::text from public.learning_paths where language_code = 'ko'), true);
select set_config('test.a_en', (select id::text from public.learning_paths where language_code = 'en'), true);
select lives_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_en'), 'archived'), 'A archives the current EN path');
select is((select current_learning_path_id from public.profiles), current_setting('test.a_ko')::uuid, 'current moves to the remaining path');
select lives_ok($$select public.create_learning_path('en', 'rusty', 'cefr', 'b1', 'b2', array[30,30,30,30,30,30,30]::smallint[], current_date + 100)$$, 'archived language can be started again');
select set_config('test.a_en2', (select id::text from public.learning_paths where language_code = 'en' and status <> 'archived'), true);

-- archived paths are read-only and cannot become current
select throws_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', current_setting('test.a_en'), 'daily_communication', 'b2', '{30,30,30,30,30,30,30}'), 'P0001', 'invalid_status_transition', 'archived path cannot be edited');
select throws_ok(format('select public.set_current_learning_path(%L)', current_setting('test.a_en')), 'P0001', 'path_not_found', 'archived path cannot become current');

-- self-reported skill estimates of the first EN path
select is((select count(*)::int from public.skill_estimates where learning_path_id = current_setting('test.a_en')::uuid), 6, 'first EN path has six skill estimates');
select is(
  (select count(*)::int from public.skill_estimates e join public.learning_paths p on p.id = e.learning_path_id
    where e.level_code <> p.current_level or e.confidence <> 'self_reported' or e.source <> 'self_report'),
  0, 'every skill estimate starts at the current level, self-reported');
select is((select estimate->'assumptions' from public.learning_paths where id = current_setting('test.a_en')::uuid),
  '{"weekly_minutes": 420, "hours_needed": 385, "reference_reviewed": false, "multiplier_range": [0.8, 1.3]}'::jsonb, 'estimate assumptions are stored');

-- validation error codes
select throws_ok($$select public.create_learning_path('en', 'bogus', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'invalid_start_point', 'start point is validated');
select throws_ok($$select public.create_learning_path('fr', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])$$, 'P0001', 'invalid_language', 'language is validated');
select throws_ok($$select public.create_learning_path('en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[], current_date + 4000)$$, 'P0001', 'target_date_too_far', 'deadline within ten years');

-- ===== User B =====
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is((select count(*)::int from public.learning_paths), 0, 'B sees none of A''s paths');
select is((select count(*)::int from public.skill_estimates), 0, 'B sees none of A''s skill estimates');
select throws_ok(format('select public.set_current_learning_path(%L)', current_setting('test.a_ko')), 'P0001', 'path_not_found', 'B cannot point at A''s path');
select throws_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', current_setting('test.a_ko'), 'hangul_basics', 'topik2', '{30,30,30,30,30,30,30}'), 'P0001', 'path_not_found', 'B cannot edit A''s path');

-- B's deadline is evaluated in B's own timezone (UTC+14 here), by hand for b1 -> b2 at 60 min/day:
-- 200 hours -> 29 weeks mid, 38 weeks max. 100 days left = 14 weeks -> needs_more_time,
-- ceil(12000 / (14 * 7)) = 123 min/day, suggested date = today + 29 * 7 = today + 203.
update public.profiles set timezone = 'Pacific/Kiritimati';
select set_config('test.b_today', ((now() at time zone 'Pacific/Kiritimati')::date)::text, true);
select lives_ok(format('select public.create_learning_path(%L, %L, %L, %L, %L, %L::smallint[], %L::date)', 'en', 'some', 'cefr', 'b1', 'b2', '{60,60,60,60,60,60,60}', (current_setting('test.b_today')::date + 100)::text), 'B creates a path with a deadline');
select is((select estimate->>'feasibility' from public.learning_paths), 'needs_more_time', 'B: deadline too close');
select is((select (estimate->>'suggested_minutes_per_day')::int from public.learning_paths), 123, 'B: suggested minutes per day');
select is((select estimate->>'suggested_date' from public.learning_paths), (current_setting('test.b_today')::date + 203)::text, 'B: suggested date uses B''s timezone');
select is((select estimate from public.learning_paths),
  public.estimate_learning_path('en', 'b1', 'b2', array[60,60,60,60,60,60,60]::smallint[], current_setting('test.b_today')::date + 100, current_setting('test.b_today')::date),
  'B: stored estimate equals estimate_learning_path for the same today');
select lives_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[], %L::date)', (select id from public.learning_paths), 'cefr', 'b2', '{60,60,60,60,60,60,60}', (current_setting('test.b_today')::date + 400)::text), 'B moves the deadline out');
select is((select estimate->>'feasibility' from public.learning_paths), 'feasible', 'B: 57 weeks left is feasible');
select is((select estimate->'suggested_date' from public.learning_paths), 'null'::jsonb, 'B: no suggested date when feasible');

-- helpers are not callable by clients
select throws_ok($$select public.learning_user_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'authenticated cannot call learning_user_today');
select throws_ok($$select public.learning_path_validate('en', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[], null, current_date)$$, '42501', null, 'authenticated cannot call learning_path_validate');

-- claims without a subject are not authenticated
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, '42501', 'not_authenticated', 'create needs a subject');
select throws_ok(format('select public.set_current_learning_path(%L)', current_setting('test.a_ko')), '42501', 'not_authenticated', 'set current needs a subject');
select throws_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', current_setting('test.a_ko'), 'hangul_basics', 'topik2', '{30,30,30,30,30,30,30}'), '42501', 'not_authenticated', 'update plan needs a subject');
select throws_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_ko'), 'paused'), '42501', 'not_authenticated', 'set status needs a subject');

-- ===== User A: status flow =====
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select lives_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_ko'), 'active'), 'paused -> active');
select lives_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_ko'), 'completed'), 'active -> completed');
select throws_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_ko'), 'paused'), 'P0001', 'invalid_status_transition', 'completed cannot be paused');
select lives_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_ko'), 'archived'), 'completed -> archived');
select throws_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_ko'), 'active'), 'P0001', 'invalid_status_transition', 'archived is final');
select is((select current_learning_path_id from public.profiles), current_setting('test.a_en2')::uuid, 'archiving a non-current path keeps current');
select lives_ok(format('select public.set_learning_path_status(%L, %L)', current_setting('test.a_en2'), 'archived'), 'A archives the last open path');
select is((select current_learning_path_id from public.profiles), null::uuid, 'no open path leaves current null');

-- ===== table constraint and null today (superuser) =====
reset role;
select throws_ok($$insert into public.learning_paths (user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, estimate)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[30,30,30,30,30,30,721]::smallint[], '{}')$$, '23514', null, 'weekly minutes above 720 violate the table check');
select throws_ok($$select public.estimate_learning_path('en', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[], current_date + 30, null)$$, 'P0001', 'invalid_date', 'a deadline needs today');

-- ===== anon =====
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.estimate_learning_path('en', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[], null, current_date)$$, '42501', null, 'anon cannot call estimate_learning_path');
select is((select count(*)::int from public.level_reference_hours), 14, 'anon can read the reference table');
select throws_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, '42501', null, 'anon cannot create paths');

select * from finish();
rollback;
