begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Spec 9 X6 (migration 20261015000350): review_writing is an allowed task for the usage log, the cache and
-- reports; unknown task names are still refused by the RPCs and the table checks.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}');

set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select set_config('test.u', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'review_writing',
  'review_writing@1', 'gemini-test', 'ok', 200, 900, 1, 420, false, false)::text, true);
select ok(current_setting('test.u') <> '', 'ai_usage_log accepts review_writing');
select throws_ok('select public.ai_usage_log(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', ''write_essay'', ''v1'', ''m'', ''ok'', 200, 1, 1, 1, false, false)',
  '22023', 'invalid_task', 'unknown tasks are still refused');
select lives_ok(format('select public.ai_cache_put(%L, ''review_writing'', ''review_writing@1'', ''gemini-test'', ''{"overall_vi": "x"}'')',
  repeat('c', 64)), 'ai_cache_put accepts review_writing');
select throws_ok(format('select public.ai_cache_put(%L, ''write_essay'', ''v1'', ''m'', ''{}'')', repeat('d', 64)),
  '22023', 'invalid_task', 'cache refuses unknown tasks');
reset role;

select is((select task from public.ai_usage where id = current_setting('test.u')::uuid), 'review_writing', 'usage row stored');
select throws_ok($$insert into public.ai_usage (user_id, task, prompt_version, model, status)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'write_essay', 'v1', 'm', 'ok')$$, '23514', null, 'table check still refuses unknown tasks');

-- The learner can report a review_writing answer.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select lives_ok(format('select public.ai_report(%L, ''unclear'', null)', current_setting('test.u')), 'report a review_writing answer');
reset role;
select is((select task from public.ai_reports where usage_id = current_setting('test.u')::uuid), 'review_writing', 'report keeps the task');

select * from finish();
rollback;
