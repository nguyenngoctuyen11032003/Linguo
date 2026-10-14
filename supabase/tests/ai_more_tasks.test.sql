begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Spec 8.2 (migration 20261016000200): analyze_sentence, summarize_session and plan_review are allowed tasks
-- for the usage log, the cache and reports; unknown task names are still refused.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}');

set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select set_config('test.u1', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'analyze_sentence',
  'analyze_sentence@1', 'gemini-test', 'ok', 200, 900, 1, 40, false, false)::text, true);
select set_config('test.u2', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'summarize_session',
  'summarize_session@1', 'gemini-test', 'ok', 200, 900, 1, 120, false, false)::text, true);
select set_config('test.u3', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'plan_review',
  'plan_review@1', 'gemini-test', 'ok', 200, 900, 1, 200, true, false)::text, true);
select ok(current_setting('test.u1') <> '' and current_setting('test.u2') <> '' and current_setting('test.u3') <> '',
  'ai_usage_log accepts the three new tasks');
select throws_ok('select public.ai_usage_log(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', ''write_essay'', ''v1'', ''m'', ''ok'', 200, 1, 1, 1, false, false)',
  '22023', 'invalid_task', 'unknown tasks are still refused by the usage log');
select lives_ok(format('select public.ai_cache_put(%L, ''analyze_sentence'', ''analyze_sentence@1'', ''gemini-test'', ''{"translation_vi": "x"}'')',
  repeat('a', 64)), 'ai_cache_put accepts analyze_sentence');
select lives_ok(format('select public.ai_cache_put(%L, ''plan_review'', ''plan_review@1'', ''gemini-test'', ''{"summary_vi": "x"}'')',
  repeat('b', 64)), 'ai_cache_put accepts plan_review');
select lives_ok(format('select public.ai_cache_put(%L, ''summarize_session'', ''summarize_session@1'', ''gemini-test'', ''{}'')',
  repeat('c', 64)), 'ai_cache_put accepts summarize_session (never used, but allowed)');
select throws_ok(format('select public.ai_cache_put(%L, ''write_essay'', ''v1'', ''m'', ''{}'')', repeat('d', 64)),
  '22023', 'invalid_task', 'cache refuses unknown tasks');
select throws_ok(format('select public.ai_cache_put(%L, ''plan_review'', ''v1'', ''m'', %L::jsonb)', repeat('e', 64),
  json_build_object('x', repeat('y', 17000))::text), '22023', 'payload_too_large', 'payload size cap is kept');
reset role;

select is((select task from public.ai_usage where id = current_setting('test.u2')::uuid), 'summarize_session', 'usage row stored');
select is((select count(*)::int from public.ai_cache where task in ('analyze_sentence', 'plan_review', 'summarize_session')), 3,
  'cache rows stored for the new tasks');
select throws_ok($$insert into public.ai_usage (user_id, task, prompt_version, model, status)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'write_essay', 'v1', 'm', 'ok')$$, '23514', null, 'table check still refuses unknown tasks');
select throws_ok($$insert into public.ai_cache (key, task, prompt_version, model, payload, expires_at)
  values (repeat('f', 64), 'write_essay', 'v1', 'm', '{}', now() + interval '1 day')$$, '23514', null, 'cache table check still refuses unknown tasks');

-- The learner can report an answer of each new task.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select lives_ok(format('select public.ai_report(%L, ''wrong'', null)', current_setting('test.u1')), 'report an analyze_sentence answer');
select lives_ok(format('select public.ai_report(%L, ''unclear'', null)', current_setting('test.u3')), 'report a plan_review answer');
reset role;

select * from finish();
rollback;
