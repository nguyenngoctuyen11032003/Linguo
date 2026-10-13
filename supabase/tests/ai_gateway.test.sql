begin;
create extension if not exists pgtap with schema extensions;
select plan(129);

-- Users: A starts in Pacific/Kiritimati (UTC+14) and later moves to Pacific/Pago_Pago (UTC-11) — 25 hours
-- apart, so the two local dates always differ. B is in Asia/Seoul, C has no AI activity.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}');
update public.profiles set timezone = 'Pacific/Kiritimati' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.profiles set timezone = 'Asia/Seoul' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

-- Local days computed independently of learning_user_today.
select set_config('test.a_today', ((now() at time zone 'Pacific/Kiritimati')::date)::text, true);
select set_config('test.a2_today', ((now() at time zone 'Pacific/Pago_Pago')::date)::text, true);
select set_config('test.b_today', ((now() at time zone 'Asia/Seoul')::date)::text, true);
select set_config('test.utc_today', ((now() at time zone 'UTC')::date)::text, true);

-- ===== Schema =====
select has_table('public', 'ai_quota', 'ai_quota exists');
select has_table('public', 'ai_cache', 'ai_cache exists');
select has_table('public', 'ai_usage', 'ai_usage exists');
select has_table('public', 'ai_reports', 'ai_reports exists');
select has_column('public', 'user_preferences', 'ai_notice_ack_at', 'user_preferences.ai_notice_ack_at exists');
select col_is_pk('public', 'ai_quota', array['user_id', 'used_on'], 'ai_quota PK is (user_id, used_on)');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('ai_quota', 'ai_cache', 'ai_usage', 'ai_reports') and c.relrowsecurity), 4,
  'RLS enabled on all AI tables');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
  where table_schema = 'public' and table_name = 'ai_usage'),
  array['id', 'user_id', 'task', 'prompt_version', 'model', 'status', 'http_status', 'latency_ms', 'attempts',
    'input_chars', 'cached', 'repaired', 'created_at'],
  'ai_usage holds metadata only (no prompt/output content)');

-- Every RPC is security definer with an empty search_path.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proconfig @> array['search_path=""']
    and p.proname in ('ai_quota_consume', 'ai_quota_refund', 'ai_quota_status', 'ai_cache_get', 'ai_cache_put',
      'ai_usage_log', 'ai_report', 'ack_ai_notice')), 8, 'all 8 RPCs are security definer with search_path=''''');

-- ===== Privileges =====
select ok(not has_function_privilege('anon', 'public.ai_quota_consume(integer)', 'execute'), 'anon cannot execute ai_quota_consume');
select ok(not has_function_privilege('anon', 'public.ai_quota_refund()', 'execute'), 'anon cannot execute ai_quota_refund');
select ok(not has_function_privilege('anon', 'public.ai_quota_status(integer)', 'execute'), 'anon cannot execute ai_quota_status');
select ok(not has_function_privilege('anon', 'public.ai_cache_get(text)', 'execute'), 'anon cannot execute ai_cache_get');
select ok(not has_function_privilege('anon', 'public.ai_cache_put(text, text, text, text, jsonb)', 'execute'), 'anon cannot execute ai_cache_put');
select ok(not has_function_privilege('anon', 'public.ai_usage_log(text, text, text, text, integer, integer, integer, integer, boolean, boolean)', 'execute'), 'anon cannot execute ai_usage_log');
select ok(not has_function_privilege('anon', 'public.ai_report(uuid, text, text)', 'execute'), 'anon cannot execute ai_report');
select ok(not has_function_privilege('anon', 'public.ack_ai_notice()', 'execute'), 'anon cannot execute ack_ai_notice');

select ok(has_function_privilege('authenticated', 'public.ai_quota_consume(integer)', 'execute'), 'authenticated can execute ai_quota_consume');
select ok(has_function_privilege('authenticated', 'public.ai_quota_refund()', 'execute'), 'authenticated can execute ai_quota_refund');
select ok(has_function_privilege('authenticated', 'public.ai_quota_status(integer)', 'execute'), 'authenticated can execute ai_quota_status');
select ok(has_function_privilege('authenticated', 'public.ai_cache_get(text)', 'execute'), 'authenticated can execute ai_cache_get');
select ok(has_function_privilege('authenticated', 'public.ai_cache_put(text, text, text, text, jsonb)', 'execute'), 'authenticated can execute ai_cache_put');
select ok(has_function_privilege('authenticated', 'public.ai_usage_log(text, text, text, text, integer, integer, integer, integer, boolean, boolean)', 'execute'), 'authenticated can execute ai_usage_log');
select ok(has_function_privilege('authenticated', 'public.ai_report(uuid, text, text)', 'execute'), 'authenticated can execute ai_report');
select ok(has_function_privilege('authenticated', 'public.ack_ai_notice()', 'execute'), 'authenticated can execute ack_ai_notice');

select ok(not has_function_privilege('authenticated', 'public.ai_quota_resets_at(uuid)', 'execute'), 'ai_quota_resets_at is internal');
select ok(not has_function_privilege('authenticated', 'public.ai_check_limit(integer)', 'execute'), 'ai_check_limit is internal');

select ok(not has_table_privilege('authenticated', 'public.ai_cache', 'select'), 'authenticated has no select on ai_cache');
select ok(not has_table_privilege('authenticated', 'public.ai_cache', 'insert'), 'authenticated has no insert on ai_cache');
select ok(not has_table_privilege('anon', 'public.ai_cache', 'select'), 'anon has no select on ai_cache');
select ok(not has_table_privilege('authenticated', 'public.ai_quota', 'select'), 'authenticated has no select on ai_quota');
select ok(not has_table_privilege('authenticated', 'public.ai_quota', 'update'), 'authenticated has no update on ai_quota');
select ok(has_table_privilege('authenticated', 'public.ai_usage', 'select'), 'authenticated may select ai_usage (RLS: own)');
select ok(not has_table_privilege('authenticated', 'public.ai_usage', 'insert'), 'authenticated has no insert on ai_usage');
select ok(has_table_privilege('authenticated', 'public.ai_reports', 'select'), 'authenticated may select ai_reports (RLS: own)');
select ok(not has_table_privilege('authenticated', 'public.ai_reports', 'insert'), 'authenticated has no insert on ai_reports');
select ok(not has_table_privilege('anon', 'public.ai_usage', 'select'), 'anon has no select on ai_usage');
select ok(not has_column_privilege('authenticated', 'public.user_preferences', 'ai_notice_ack_at', 'update'),
  'ai_notice_ack_at is not client-updatable');

-- anon cannot call an RPC at all.
set local role anon;
select throws_ok('select public.ai_quota_consume(5)', '42501', null, 'anon: ai_quota_consume denied');
select throws_ok('select public.ai_cache_get(repeat(''a'', 64))', '42501', null, 'anon: ai_cache_get denied');
reset role;

-- ===== Authentication required =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.ai_quota_consume(5)', '42501', 'not_authenticated', 'consume needs a user');
select throws_ok('select public.ai_quota_refund()', '42501', 'not_authenticated', 'refund needs a user');
select throws_ok('select public.ai_quota_status(5)', '42501', 'not_authenticated', 'status needs a user');
select throws_ok('select public.ai_cache_get(repeat(''a'', 64))', '42501', 'not_authenticated', 'cache get needs a user');
select throws_ok('select public.ai_cache_put(repeat(''a'', 64), ''explain_concept'', ''v1'', ''m'', ''{}'')', '42501', 'not_authenticated', 'cache put needs a user');
select throws_ok('select public.ai_usage_log(''explain_concept'', ''v1'', ''m'', ''ok'', 200, 1, 1, 1, false, false)', '42501', 'not_authenticated', 'usage log needs a user');
select throws_ok(format('select public.ai_report(%L, ''wrong'', null)', gen_random_uuid()), '42501', 'not_authenticated', 'report needs a user');
select throws_ok('select public.ack_ai_notice()', '42501', 'not_authenticated', 'ack needs a user');

-- ===== Quota: consume to the limit (user A, Kiritimati) =====
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.a_resets', ((current_setting('test.a_today')::date + 1)::timestamp at time zone 'Pacific/Kiritimati')::text, true);

select set_config('test.q', public.ai_quota_status(3)::text, true);
select is((current_setting('test.q')::jsonb - 'resets_at'), '{"used": 0, "limit": 3}'::jsonb, 'status before any use: 0 of 3');
select is((current_setting('test.q')::jsonb ->> 'resets_at')::timestamptz, current_setting('test.a_resets')::timestamptz,
  'resets_at is the next local midnight (Kiritimati)');

select set_config('test.q', public.ai_quota_consume(3)::text, true);
select is((current_setting('test.q')::jsonb - 'resets_at'), '{"allowed": true, "used": 1, "limit": 3}'::jsonb, 'consume #1 allowed');
select is((current_setting('test.q')::jsonb ->> 'resets_at')::timestamptz, current_setting('test.a_resets')::timestamptz,
  'consume returns resets_at');
select is(public.ai_quota_consume(3) - 'resets_at', '{"allowed": true, "used": 2, "limit": 3}'::jsonb, 'consume #2 allowed');
select is(public.ai_quota_consume(3) - 'resets_at', '{"allowed": true, "used": 3, "limit": 3}'::jsonb, 'consume #3 allowed (limit reached)');
select is(public.ai_quota_consume(3) - 'resets_at', '{"allowed": false, "used": 3, "limit": 3}'::jsonb, 'consume #4 refused, count unchanged');
select is(public.ai_quota_consume(3) - 'resets_at', '{"allowed": false, "used": 3, "limit": 3}'::jsonb, 'consume #5 still refused');
select is(public.ai_quota_status(3) - 'resets_at', '{"used": 3, "limit": 3}'::jsonb, 'status: 3 of 3');
select is(public.ai_quota_consume(5) - 'resets_at', '{"allowed": true, "used": 4, "limit": 5}'::jsonb, 'a higher limit allows more');
select is(public.ai_quota_consume(0) - 'resets_at', '{"allowed": false, "used": 4, "limit": 0}'::jsonb, 'limit 0 never allows');
select throws_ok('select public.ai_quota_consume(-1)', '22023', 'invalid_limit', 'negative limit rejected');
select throws_ok('select public.ai_quota_consume(null)', '22023', 'invalid_limit', 'null limit rejected');
select throws_ok('select public.ai_quota_consume(1001)', '22023', 'invalid_limit', 'limit above 1000 rejected');
select throws_ok('select public.ai_quota_status(-1)', '22023', 'invalid_limit', 'status: negative limit rejected');

-- No direct access to the quota table.
select throws_ok('select * from public.ai_quota', '42501', null, 'ai_quota is not readable directly');
select throws_ok('update public.ai_quota set count = 0', '42501', null, 'ai_quota is not writable directly');

-- ===== Refund: at most 10 per local day =====
reset role;
update public.ai_quota set count = 15 where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select is(public.ai_quota_refund(), true, 'refund #1 succeeds');
select is(public.ai_quota_status(20) ->> 'used', '14', 'refund gives back one request');
select is((select count(*)::integer from generate_series(2, 10) g where public.ai_quota_refund()), 9, 'refunds #2..#10 succeed');
select is(public.ai_quota_refund(), false, 'refund #11 refused');
select is(public.ai_quota_status(20) ->> 'used', '5', 'used = 15 - 10 refunds');
reset role;
select is((select array[count, refunded] from public.ai_quota where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and used_on = current_setting('test.a_today')::date), array[5, 10], 'row stores count 5, refunded 10');
set local role authenticated;

-- Nothing to refund: user C has no row today.
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
select is(public.ai_quota_refund(), false, 'refund without usage today refused');
select is(public.ai_quota_status(20) - 'resets_at', '{"used": 0, "limit": 20}'::jsonb, 'C unaffected by A (A/B isolation)');

-- ===== Local-day boundary =====
-- A moves to Pago_Pago: a different local date, so a fresh quota day.
reset role;
update public.profiles set timezone = 'Pacific/Pago_Pago' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is(public.ai_quota_status(3) ->> 'used', '0', 'new local day after the time zone change: 0 used');
select set_config('test.q', public.ai_quota_consume(3)::text, true);
select is(current_setting('test.q')::jsonb - 'resets_at', '{"allowed": true, "used": 1, "limit": 3}'::jsonb, 'consume counts on the new local day');
select is((current_setting('test.q')::jsonb ->> 'resets_at')::timestamptz,
  (current_setting('test.a2_today')::date + 1)::timestamp at time zone 'Pacific/Pago_Pago', 'resets_at is the next Pago_Pago midnight');
reset role;
select is((select array_agg(used_on::text || ':' || count order by used_on) from public.ai_quota
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  array[current_setting('test.a2_today') || ':1', current_setting('test.a_today') || ':5'],
  'rows are keyed by local date; the Kiritimati day is untouched');

-- B (Seoul) hit the limit yesterday and has old rows: today is fresh, rows > 60 days are dropped.
insert into public.ai_quota (user_id, used_on, count) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.b_today')::date - 1, 3),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.utc_today')::date - 62, 3),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.utc_today')::date - 59, 3);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select set_config('test.q', public.ai_quota_consume(3)::text, true);
select is(current_setting('test.q')::jsonb - 'resets_at', '{"allowed": true, "used": 1, "limit": 3}'::jsonb,
  'yesterday''s exhausted quota does not carry over');
select is((current_setting('test.q')::jsonb ->> 'resets_at')::timestamptz,
  (current_setting('test.b_today')::date + 1)::timestamp at time zone 'Asia/Seoul', 'resets_at is the next Seoul midnight');
select is(public.ai_quota_refund(), true, 'B refunds own request');
reset role;
select is((select array_agg(used_on order by used_on) from public.ai_quota where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  array[current_setting('test.utc_today')::date - 59, current_setting('test.b_today')::date - 1, current_setting('test.b_today')::date],
  'quota rows older than 60 days dropped, recent ones kept');
select is((select sum(count)::integer from public.ai_quota where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 6,
  'B''s consume/refund did not touch A');
set local role authenticated;

-- ===== Cache =====
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.k1', repeat('a', 64), true);
select set_config('test.k2', repeat('b', 64), true);
select is(public.ai_cache_get(current_setting('test.k1')), null, 'cache miss returns null');
select lives_ok(format('select public.ai_cache_put(%L, ''explain_concept'', ''v1'', ''gemini-test'', ''{"summary": "x"}'')',
  current_setting('test.k1')), 'cache put');
select is(public.ai_cache_get(current_setting('test.k1')), '{"summary": "x"}'::jsonb, 'cache hit returns the payload');
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is(public.ai_cache_get(current_setting('test.k1')), '{"summary": "x"}'::jsonb, 'cache is shared across users');
reset role;
select is((select array[hits::text, task, prompt_version, model, (expires_at = now() + interval '30 days')::text]
  from public.ai_cache where key = current_setting('test.k1')),
  array['2', 'explain_concept', 'v1', 'gemini-test', 'true'], 'entry counts hits and expires after 30 days');
set local role authenticated;
select lives_ok(format('select public.ai_cache_put(%L, ''explain_concept'', ''v2'', ''gemini-test'', ''{"summary": "y"}'')',
  current_setting('test.k1')), 'cache put replaces an entry');
select is(public.ai_cache_get(current_setting('test.k1')), '{"summary": "y"}'::jsonb, 'replaced payload returned');

select throws_ok('select public.ai_cache_put(''abc'', ''explain_concept'', ''v1'', ''m'', ''{}'')', '22023', 'invalid_key', 'short key rejected');
select throws_ok(format('select public.ai_cache_put(%L, ''explain_concept'', ''v1'', ''m'', ''{}'')', repeat('A', 64)), '22023', 'invalid_key', 'uppercase key rejected');
select throws_ok(format('select public.ai_cache_put(%L, ''chat'', ''v1'', ''m'', ''{}'')', current_setting('test.k2')), '22023', 'invalid_task', 'unknown task rejected');
select throws_ok(format('select public.ai_cache_put(%L, ''explain_concept'', '''', ''m'', ''{}'')', current_setting('test.k2')), '22023', 'invalid_argument', 'empty prompt_version rejected');
select throws_ok(format('select public.ai_cache_put(%L, ''explain_concept'', ''v1'', ''m'', null)', current_setting('test.k2')), '22023', 'invalid_payload', 'null payload rejected');
select throws_ok(format('select public.ai_cache_put(%L, ''explain_concept'', ''v1'', ''m'', jsonb_build_object(''s'', repeat(''x'', 16400)))',
  current_setting('test.k2')), '22023', 'payload_too_large', 'payload over 16 KB rejected');
select lives_ok(format('select public.ai_cache_put(%L, ''generate_practice'', ''v1'', ''m'', jsonb_build_object(''s'', repeat(''x'', 16000)))',
  current_setting('test.k2')), 'payload under 16 KB accepted');

-- Expiry: an expired entry is a miss and is dropped by the next put.
reset role;
update public.ai_cache set expires_at = now() - interval '1 second' where key = current_setting('test.k1');
set local role authenticated;
select is(public.ai_cache_get(current_setting('test.k1')), null, 'expired entry is a miss');
select lives_ok(format('select public.ai_cache_put(%L, ''analyze_error'', ''v1'', ''m'', ''{}'')', repeat('c', 64)), 'put another entry');
reset role;
select is((select count(*)::integer from public.ai_cache where key = current_setting('test.k1')), 0, 'expired entries are pruned on put');
set local role authenticated;

-- No direct table access.
select throws_ok('select * from public.ai_cache', '42501', null, 'ai_cache is not readable directly');
select throws_ok(format('insert into public.ai_cache (key, task, prompt_version, model, payload) values (%L, ''explain_concept'', ''v1'', ''m'', ''{}'')',
  repeat('d', 64)), '42501', null, 'ai_cache is not writable directly');
select throws_ok('delete from public.ai_cache', '42501', null, 'ai_cache cannot be deleted directly');

-- ===== Usage log =====
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.ua', public.ai_usage_log('explain_concept', 'v1', 'gemini-test', 'ok', 200, 1234, 2, 87, false, true)::text, true);
select isnt(current_setting('test.ua'), '', 'usage log returns an id');
select is((select array[user_id::text, task, status, http_status::text, latency_ms::text, attempts::text, input_chars::text, cached::text, repaired::text]
  from public.ai_usage where id = current_setting('test.ua')::uuid),
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'explain_concept', 'ok', '200', '1234', '2', '87', 'false', 'true'],
  'A reads own usage row');
select set_config('test.ua2', public.ai_usage_log('analyze_error', 'v1', 'gemini-test', 'ai_unavailable', null, null, null, null, null, null)::text, true);
select is((select array[http_status::text, latency_ms::text, attempts::text, cached::text]
  from public.ai_usage where id = current_setting('test.ua2')::uuid), array[null, '0', '0', 'false'], 'null metrics default to 0/false');
select throws_ok('select public.ai_usage_log(''chat'', ''v1'', ''m'', ''ok'', 200, 1, 1, 1, false, false)', '22023', 'invalid_task', 'usage: unknown task');
select throws_ok('select public.ai_usage_log(''explain_concept'', ''v1'', ''m'', ''Not OK'', 200, 1, 1, 1, false, false)', '22023', 'invalid_argument', 'usage: bad status');
select throws_ok('select public.ai_usage_log(''explain_concept'', ''v1'', ''m'', ''ok'', 700, 1, 1, 1, false, false)', '22023', 'invalid_argument', 'usage: bad http status');
select throws_ok('select public.ai_usage_log(''explain_concept'', ''v1'', ''m'', ''ok'', 200, -1, 1, 1, false, false)', '22023', 'invalid_argument', 'usage: negative latency');
select throws_ok('insert into public.ai_usage (user_id, task, prompt_version, model, status) values (''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', ''explain_concept'', ''v1'', ''m'', ''ok'')',
  '42501', null, 'ai_usage is not writable directly');
select throws_ok('update public.ai_usage set status = ''x''', '42501', null, 'ai_usage is not updatable directly');

-- 90-day retention: B has an old and a recent row; the next log drops the old one.
reset role;
insert into public.ai_usage (id, user_id, task, prompt_version, model, status, created_at) values
  ('e1000000-0000-4000-8000-000000000091', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'explain_concept', 'v1', 'm', 'ok', now() - interval '91 days'),
  ('e1000000-0000-4000-8000-000000000089', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'explain_concept', 'v1', 'm', 'ok', now() - interval '89 days');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select set_config('test.ub', public.ai_usage_log('generate_practice', 'v1', 'gemini-test', 'ok', 200, 10, 1, 5, true, false)::text, true);
select is((select array_agg(id::text order by created_at) from public.ai_usage),
  array['e1000000-0000-4000-8000-000000000089', current_setting('test.ub')],
  'B sees only own rows; rows older than 90 days pruned');
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is((select count(*)::integer from public.ai_usage), 2, 'A sees only own usage rows');

-- ===== Reports =====
select set_config('test.r1', public.ai_report(current_setting('test.ua')::uuid, 'wrong', '  sai nghĩa  ')::text, true);
select is((select array[user_id::text, usage_id::text, task, prompt_version, reason, note] from public.ai_reports where id = current_setting('test.r1')::uuid),
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.ua'), 'explain_concept', 'v1', 'wrong', 'sai nghĩa'],
  'report stores task/version from the usage row and a trimmed note');
select is(public.ai_report(current_setting('test.ua')::uuid, 'unclear', '   ')::text, current_setting('test.r1'), 'reporting again returns the same id');
select is((select array[reason, coalesce(note, '<null>')] from public.ai_reports where id = current_setting('test.r1')::uuid),
  array['unclear', '<null>'], 'repeat report updates reason; blank note becomes null');
select is((select count(*)::integer from public.ai_reports), 1, 'one report per response');
select throws_ok(format('select public.ai_report(%L, ''rude'', null)', current_setting('test.ua')), '22023', 'invalid_reason', 'unknown reason rejected');
select throws_ok(format('select public.ai_report(%L, ''other'', %L)', current_setting('test.ua'), repeat('x', 501)), '22023', 'invalid_note', 'note over 500 chars rejected');
select lives_ok(format('select public.ai_report(%L, ''other'', %L)', current_setting('test.ua2'), repeat('x', 500)), 'note of 500 chars accepted');
select throws_ok(format('select public.ai_report(%L, ''wrong'', null)', gen_random_uuid()), 'P0001', 'usage_not_found', 'unknown usage rejected');
select throws_ok('insert into public.ai_reports (user_id, task, prompt_version, reason) values (''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', ''explain_concept'', ''v1'', ''wrong'')',
  '42501', null, 'ai_reports is not writable directly');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select throws_ok(format('select public.ai_report(%L, ''wrong'', null)', current_setting('test.ua')), 'P0001', 'usage_not_found', 'B cannot report A''s response');
select is((select count(*)::integer from public.ai_reports), 0, 'B cannot read A''s reports');

-- ===== Privacy notice =====
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is((select ai_notice_ack_at from public.user_preferences), null, 'notice not acknowledged yet');
select is(public.ack_ai_notice(), now(), 'ack_ai_notice returns the acknowledgement time');
select is((select ai_notice_ack_at from public.user_preferences), now(), 'A reads own acknowledgement');
select throws_ok('update public.user_preferences set ai_notice_ack_at = null', '42501', null, 'ai_notice_ack_at cannot be set directly');
reset role;
select is((select ai_notice_ack_at from public.user_preferences where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), null, 'B''s notice untouched');

select * from finish();
rollback;
