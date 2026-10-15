begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Spec 8.2 #6 (migration 20261016000600): roleplay_turn is an allowed task for the usage log, the cache and
-- reports; unknown task names are still refused.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}');

set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select set_config('test.u1', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'roleplay_turn',
  'roleplay_turn@1', 'gemini-test', 'ok', 200, 1200, 1, 85, false, false)::text, true);
select ok(current_setting('test.u1') <> '', 'ai_usage_log accepts roleplay_turn');
select throws_ok('select public.ai_usage_log(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', ''write_essay'', ''v1'', ''m'', ''ok'', 200, 1, 1, 1, false, false)',
  '22023', 'invalid_task', 'unknown tasks are still refused by the usage log');
select lives_ok(format('select public.ai_cache_put(%L, ''roleplay_turn'', ''roleplay_turn@1'', ''gemini-test'', ''{}'')', repeat('a', 64)),
  'ai_cache_put accepts roleplay_turn');
select lives_ok(format('select public.ai_cache_put(%L, ''plan_review'', ''plan_review@1'', ''gemini-test'', ''{}'')', repeat('b', 64)),
  'earlier tasks are still accepted');
select throws_ok(format('select public.ai_cache_put(%L, ''write_essay'', ''v1'', ''m'', ''{}'')', repeat('d', 64)),
  '22023', 'invalid_task', 'cache refuses unknown tasks');
reset role;

select is((select task from public.ai_usage where id = current_setting('test.u1')::uuid), 'roleplay_turn', 'usage row stored');
select throws_ok($$insert into public.ai_usage (user_id, task, prompt_version, model, status)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'write_essay', 'v1', 'm', 'ok')$$, '23514', null, 'table check still refuses unknown tasks');
select throws_ok($$insert into public.ai_cache (key, task, prompt_version, model, payload, expires_at)
  values (repeat('f', 64), 'write_essay', 'v1', 'm', '{}', now() + interval '1 day')$$, '23514', null, 'cache table check still refuses unknown tasks');

-- The learner can report a role-play answer.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select lives_ok(format('select public.ai_report(%L, ''unsafe'', null)', current_setting('test.u1')), 'report a roleplay_turn answer');
reset role;

select * from finish();
rollback;
