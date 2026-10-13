-- Spec 7 §1: export_my_data, delete_my_account, purge_expired_data and the account_deletions log.
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}');

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Tables a later migration might add (study_sessions, activity_days, user_badges, analytics_events) are
-- found by name. Point the list at test tables, rolled back with the test, that cover every branch:
-- an FK to auth.users that sets null, a user_id with no FK at all, and a path child that sets null.
create or replace function public.account_optional_tables() returns text[] language sql immutable set search_path = ''
as $$ select array['h1_optional_setnull', 'h1_optional_nofk', 'h1_optional_missing']; $$;
create table public.h1_optional_setnull (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  note text
);
create table public.h1_optional_nofk (user_id uuid not null, note text);
create table public.h1_path_child_setnull (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid references public.learning_paths (id) on delete set null
);
alter table public.h1_optional_setnull enable row level security;
alter table public.h1_optional_nofk enable row level security;
alter table public.h1_path_child_setnull enable row level security;

-- ===== Schema and privileges =====
select has_table('public', 'account_deletions', 'account_deletions exists');
select has_table('public', 'account_export_requests', 'account_export_requests exists');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
  where table_schema = 'public' and table_name = 'account_deletions'),
  array['id', 'deleted_at', 'reason_code'], 'account_deletions keeps no user id or email');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('account_deletions', 'account_export_requests') and c.relrowsecurity), 2,
  'RLS enabled on both tables');
select ok(not has_table_privilege('authenticated', 'public.account_deletions', 'select'), 'learners cannot read account_deletions');
select ok(not has_table_privilege('authenticated', 'public.account_export_requests', 'select'), 'learners cannot read export requests');
select ok(not has_table_privilege('anon', 'public.account_deletions', 'select'), 'anon cannot read account_deletions');
select ok(not has_table_privilege('authenticated', 'public.account_export_requests', 'insert'), 'learners cannot write export requests');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proconfig @> array['search_path=""']
    and p.proname in ('export_my_data', 'delete_my_account', 'purge_expired_data')), 3,
  'the 3 RPCs are security definer with search_path=''''');

select ok(not has_function_privilege('anon', 'public.export_my_data()', 'execute'), 'anon cannot execute export_my_data');
select ok(not has_function_privilege('anon', 'public.delete_my_account(text)', 'execute'), 'anon cannot execute delete_my_account');
select ok(not has_function_privilege('anon', 'public.purge_expired_data()', 'execute'), 'anon cannot execute purge_expired_data');
select ok(has_function_privilege('authenticated', 'public.export_my_data()', 'execute'), 'authenticated can export');
select ok(has_function_privilege('authenticated', 'public.delete_my_account(text)', 'execute'), 'authenticated can delete own account');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_data()', 'execute'), 'authenticated cannot purge');
select ok(has_function_privilege('service_role', 'public.purge_expired_data()', 'execute'), 'service_role can purge');

set local role anon;
select throws_ok('select public.export_my_data()', '42501', null, 'anon: export denied');
select throws_ok('select public.delete_my_account(''XOA TAI KHOAN'')', '42501', null, 'anon: delete denied');
select throws_ok('select public.purge_expired_data()', '42501', null, 'anon: purge denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.export_my_data()', '42501', 'not_authenticated', 'export needs a user');
select throws_ok('select public.delete_my_account(''XOA TAI KHOAN'')', '42501', 'not_authenticated', 'delete needs a user');
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok('select public.purge_expired_data()', '42501', null, 'learner cannot purge');
reset role;

-- ===== Data for A and B =====
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.pa', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select set_config('test.la', (select lesson_id::text from public.path_lessons(current_setting('test.pa')::uuid)
  where prerequisites_met order by unit_order, lesson_order limit 1), true);
select set_config('test.ra', public.start_lesson(current_setting('test.la')::uuid, current_setting('test.pa')::uuid) ->> 'id', true);
select set_config('test.sa', public.start_diagnostic(current_setting('test.pa')::uuid, 'foundation')::text, true);
select set_config('test.aa', current_setting('test.sa')::jsonb ->> 'attempt_id', true);
select public.answer_diagnostic(current_setting('test.aa')::uuid, (current_setting('test.sa')::jsonb #>> '{item,id}')::uuid, null) is not null;
select public.ai_quota_consume(20) is not null;
select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('test.pb', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select set_config('test.rb', public.start_lesson(current_setting('test.la')::uuid, current_setting('test.pb')::uuid) ->> 'id', true);
select public.ai_quota_consume(20) is not null;
reset role;

-- An attempt (unrevealed: feedback carries the answer, which the export must drop), review state, AI usage.
insert into public.attempts (user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version,
  idempotency_key, payload_hash, response_json, verdict, is_correct, score, attempt_no, revealed, after_reveal, gave_up,
  feedback_json, stage, exercise_type, response_ms, hint_count)
select u.uid, u.path, u.run, current_setting('test.la')::uuid, e.id, e.version, 1, gen_random_uuid(), 'h', '{"choice": "x"}',
  'incorrect', false, 0, 1, false, false, false,
  '{"verdict": "incorrect", "display_answer": "SECRET-ANSWER", "explanation": {"vi": "SECRET-EXPLANATION"}}',
  'recognition', 'mcq', 1000, 0
from public.exercises e,
  (values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, current_setting('test.pa')::uuid, current_setting('test.ra')::uuid),
          ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, current_setting('test.pb')::uuid, current_setting('test.rb')::uuid)) as u (uid, path, run)
where e.id = (select r.queue[1] from public.lesson_runs r where r.id = current_setting('test.ra')::uuid);
select set_config('test.li', (select id::text from public.learning_items where language_code = 'en' and status = 'published' order by key limit 1), true);
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, due_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, current_setting('test.li')::uuid, 'recognize', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, current_setting('test.li')::uuid, 'recognize', now());
insert into public.review_item_mastery (user_id, learning_path_id, learning_item_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, current_setting('test.li')::uuid),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, current_setting('test.li')::uuid);
insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash)
select c.user_id, c.learning_path_id, c.id, 'grade', 3, 3, current_date, gen_random_uuid(), 'h' from public.review_cards c;
set local role service_role;
select set_config('test.ua', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'explain_concept', 'v1', 'm', 'ok', 200, 10, 1, 10, false, false)::text, true);
select public.ai_usage_log('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'explain_concept', 'v1', 'm', 'ok', 200, 10, 1, 10, false, false) is not null;
reset role;
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.ai_report(current_setting('test.ua')::uuid, 'unclear', 'note from A') is not null;
reset role;
insert into public.h1_optional_setnull (user_id, note) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'opt-a'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'opt-b');
insert into public.h1_optional_nofk (user_id, note) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nofk-a'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'nofk-b');
insert into public.h1_path_child_setnull (learning_path_id) values (current_setting('test.pa')::uuid), (current_setting('test.pb')::uuid);

-- ===== Export: only the caller's data =====
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.x', public.export_my_data()::text, true);
reset role;
select is(current_setting('test.x')::jsonb ->> 'format', 'linguo-export', 'export has a format tag');
select is(current_setting('test.x')::jsonb #>> '{account,id}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'export is A''s account');
select is(current_setting('test.x')::jsonb #>> '{account,email}', 'a@test.dev', 'export includes A''s email');
select is(current_setting('test.x')::jsonb #>> '{profile,id}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'export includes A''s profile');
select is(current_setting('test.x')::jsonb #>> '{preferences,user_id}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'export includes A''s preferences');
select ok(current_setting('test.x')::jsonb ?& array['learning_paths', 'skill_estimates', 'lesson_runs', 'review_cards',
  'review_item_mastery', 'review_logs', 'assessment_attempts', 'ai_usage', 'ai_reports', 'ai_quota'], 'export has every section');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'learning_paths'), 1, 'one learning path');
select is(current_setting('test.x')::jsonb #>> '{learning_paths,0,id}', current_setting('test.pa'), 'it is A''s path');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'skill_estimates'), 6, 'A''s 6 skill estimates');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'lesson_runs'), 1, 'one lesson run');
select is(jsonb_array_length(current_setting('test.x')::jsonb #> '{lesson_runs,0,attempts}'), 1, 'its attempt is nested');
select ok(not (current_setting('test.x')::jsonb #> '{lesson_runs,0,attempts,0,feedback_json}' ?| array['display_answer', 'explanation']),
  'unrevealed feedback loses the answer and explanation');
select ok(position('SECRET-' in current_setting('test.x')) = 0, 'no answer key anywhere in the export');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'review_cards'), 1, 'one review card');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'review_logs'), 1, 'one review log');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'review_item_mastery'), 1, 'one mastery row');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'assessment_attempts'), 1, 'one diagnostic attempt');
select is(jsonb_array_length(current_setting('test.x')::jsonb #> '{assessment_attempts,0,responses}'), 1, 'its response is nested');
select ok(not (current_setting('test.x')::jsonb #> '{assessment_attempts,0,responses,0}' ? 'is_correct'),
  'diagnostic responses carry no correctness');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'ai_usage'), 1, 'one AI usage row');
select is(current_setting('test.x')::jsonb #>> '{ai_reports,0,note}', 'note from A', 'A''s AI report');
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'ai_quota'), 1, 'A''s quota day');
select is(current_setting('test.x')::jsonb -> 'h1_optional_setnull', '[]'::jsonb || jsonb_build_array(
  (select to_jsonb(t) from public.h1_optional_setnull t where t.user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  'an optional table that exists is exported, A''s rows only');
select is(current_setting('test.x')::jsonb #>> '{h1_optional_nofk,0,note}', 'nofk-a', 'optional table without FK exported');
select ok(not (current_setting('test.x')::jsonb ? 'h1_optional_missing'), 'a missing optional table is skipped');
select ok(position('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' in current_setting('test.x')) = 0
  and position(current_setting('test.pb') in current_setting('test.x')) = 0
  and position(current_setting('test.rb') in current_setting('test.x')) = 0, 'nothing of B''s is in A''s export');
select ok(position('"body"' in current_setting('test.x')) = 0 and position('"rubric"' in current_setting('test.x')) = 0,
  'no lesson content in the export');

-- ===== Export rate limit: 5 per hour per user =====
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select lives_ok('select public.export_my_data()', 'export #2');
select lives_ok('select public.export_my_data()', 'export #3');
select lives_ok('select public.export_my_data()', 'export #4');
select lives_ok('select public.export_my_data()', 'export #5');
select throws_ok('select public.export_my_data()', 'P0001', 'rate_limited', 'export #6 within the hour is rate limited');
select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select lives_ok('select public.export_my_data()', 'B is not limited by A''s exports');
reset role;
update public.account_export_requests set requested_at = requested_at - interval '61 minutes'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select lives_ok('select public.export_my_data()', 'exports are allowed again an hour later');
reset role;

-- ===== Delete account =====
-- Snapshot B's rows in every public table keyed by user_id.
create temporary table b_before as
select c.table_name::text as tbl, 0::bigint as n
from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE';
do $$ declare r record; v bigint; begin
  for r in select tbl from b_before loop
    execute format('select count(*) from public.%I where user_id = %L', r.tbl, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') into v;
    update b_before set n = v where tbl = r.tbl;
  end loop;
end $$;
select ok((select count(*) from b_before where n > 0) >= 10, 'B has rows in many user tables');
select set_config('test.deletions', (select count(*)::text from public.account_deletions), true);

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok('select public.delete_my_account(null)', 'P0001', 'invalid_confirmation', 'null confirmation rejected');
select throws_ok('select public.delete_my_account('''')', 'P0001', 'invalid_confirmation', 'empty confirmation rejected');
select throws_ok('select public.delete_my_account(''xoa tai khoan'')', 'P0001', 'invalid_confirmation', 'confirmation is case sensitive');
select throws_ok('select public.delete_my_account(''XÓA TÀI KHOẢN'')', 'P0001', 'invalid_confirmation', 'confirmation is the exact ASCII phrase');
select throws_ok('select public.delete_my_account('' XOA TAI KHOAN'')', 'P0001', 'invalid_confirmation', 'no extra whitespace');
reset role;
select ok(exists (select 1 from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'rejected confirmations delete nothing');
select is((select count(*)::text from public.account_deletions), current_setting('test.deletions'), 'and log nothing');

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select lives_ok('select public.delete_my_account(''XOA TAI KHOAN'')', 'A deletes the account');
reset role;

select ok(not exists (select 1 from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'A''s auth user is gone');
select ok(not exists (select 1 from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'A''s profile is gone');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from b_before
   where (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where user_id = %L', tbl,
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false, true, '')))[1]::text::bigint > 0),
  '{}'::text[], 'no public table keeps a row with A''s user_id');
select ok(not exists (select 1 from public.h1_optional_setnull where user_id is null), 'a set-null FK table was deleted, not orphaned');
select is((select count(*)::integer from public.skill_estimates where learning_path_id = current_setting('test.pa')::uuid), 0, 'A''s skill estimates are gone');
select is((select count(*)::integer from public.assessment_responses where attempt_id = current_setting('test.aa')::uuid), 0, 'A''s diagnostic responses are gone');
select is((select count(*)::integer from public.h1_path_child_setnull where learning_path_id is null), 0,
  'path children behind a set-null FK were deleted too');
select is((select count(*)::integer from public.h1_path_child_setnull where learning_path_id = current_setting('test.pb')::uuid), 1,
  'B''s path child is kept');
select is((select count(*)::integer from public.account_deletions), current_setting('test.deletions')::integer + 1, 'one deletion logged');
select is((select reason_code from public.account_deletions order by deleted_at desc limit 1), 'self_service', 'with the self-service reason');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from b_before
   where (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where user_id = %L', tbl,
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), false, true, '')))[1]::text::bigint <> n),
  '{}'::text[], 'all of B''s rows are untouched');
select ok(exists (select 1 from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'B''s account is untouched');

-- ===== Purge =====
-- study_sessions comes from a separate migration; create a minimal stand-in when it is not there yet.
do $$ begin
  if to_regclass('public.study_sessions') is null then
    create table public.study_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      status text not null,
      created_at timestamptz not null default now()
    );
    insert into public.study_sessions (user_id, status, created_at) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'abandoned', now() - interval '181 days'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'planned', now() - interval '200 days'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'completed', now() - interval '400 days'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'abandoned', now() - interval '10 days');
    perform set_config('test.sessions_expected', '2', true);
  else
    perform set_config('test.sessions_expected', '', true);
  end if;
end $$;
insert into public.ai_cache (key, task, prompt_version, model, payload, expires_at) values
  (repeat('a', 64), 'explain_concept', 'v1', 'm', '{}', now() - interval '1 minute'),
  (repeat('b', 64), 'explain_concept', 'v1', 'm', '{}', now() + interval '1 day');
insert into public.ai_usage (user_id, task, prompt_version, model, status, created_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'explain_concept', 'v1', 'm', 'ok', now() - interval '91 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'explain_concept', 'v1', 'm', 'ok', now() - interval '89 days');
insert into public.ai_quota (user_id, used_on, count) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date - 61, 3),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date - 59, 3);
insert into public.account_export_requests (user_id, requested_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now() - interval '25 hours');

set local role service_role;
select set_config('test.purge', public.purge_expired_data()::text, true);
reset role;
select is((current_setting('test.purge')::jsonb - 'study_sessions'),
  '{"ai_cache": 1, "ai_usage": 1, "ai_quota": 1, "account_export_requests": 1}'::jsonb, 'purge reports what it deleted');
select ok(current_setting('test.sessions_expected') = ''
  or (current_setting('test.purge')::jsonb ->> 'study_sessions') = current_setting('test.sessions_expected'),
  'unfinished study sessions older than 180 days are purged');
select is((select count(*)::integer from public.ai_cache where key in (repeat('a', 64), repeat('b', 64))), 1, 'unexpired cache kept');
select is((select count(*)::integer from public.ai_usage where created_at < now() - interval '90 days'), 0, 'old usage purged');
select is((select count(*)::integer from public.ai_usage where created_at >= now() - interval '90 days'
  and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 2, 'recent usage kept');
select is((select count(*)::integer from public.ai_quota where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 2, 'recent quota days kept');

select * from finish();
rollback;
