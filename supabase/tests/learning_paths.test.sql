begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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
select lives_ok(format('select public.set_learning_path_status(%L, %L)', (select id from public.learning_paths where language_code = 'en'), 'archived'), 'A archives the current EN path');
select is((select current_learning_path_id from public.profiles), current_setting('test.a_ko')::uuid, 'current moves to the remaining path');
select lives_ok($$select public.create_learning_path('en', 'rusty', 'cefr', 'b1', 'b2', array[30,30,30,30,30,30,30]::smallint[], current_date + 100)$$, 'archived language can be started again');

-- ===== User B =====
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is((select count(*)::int from public.learning_paths), 0, 'B sees none of A''s paths');
select is((select count(*)::int from public.skill_estimates), 0, 'B sees none of A''s skill estimates');
select throws_ok(format('select public.set_current_learning_path(%L)', current_setting('test.a_ko')), 'P0001', 'path_not_found', 'B cannot point at A''s path');
select throws_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])', current_setting('test.a_ko'), 'hangul_basics', 'topik2', '{30,30,30,30,30,30,30}'), 'P0001', 'path_not_found', 'B cannot edit A''s path');

-- ===== anon =====
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.level_reference_hours), 14, 'anon can read the reference table');
select throws_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, '42501', null, 'anon cannot create paths');

select * from finish();
rollback;
