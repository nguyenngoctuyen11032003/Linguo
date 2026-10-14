begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}');

-- A batch of p_n valid events.
create function public.c9_batch(p_n integer) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', 'page_view', 'props', '{}'::jsonb, 'at', '2026-10-13T10:00:00Z', 'route', '/app')), '[]'::jsonb)
  from generate_series(1, p_n);
$$;

-- ===== Privileges =====
select ok(not has_table_privilege('anon', 'public.analytics_events', 'select'), 'anon cannot read events');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'insert'), 'clients cannot insert events directly');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'update'), 'clients cannot update events');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'delete'), 'clients cannot delete events');
select ok(not has_function_privilege('anon', 'public.track_events(jsonb)', 'execute'), 'anon cannot track');
select ok(has_function_privilege('authenticated', 'public.track_events(jsonb)', 'execute'), 'authenticated can track');
select ok(not has_function_privilege('authenticated', 'public.purge_analytics()', 'execute'), 'clients cannot purge');
select ok(not has_function_privilege('anon', 'public.purge_analytics()', 'execute'), 'anon cannot purge');
select ok(has_function_privilege('service_role', 'public.purge_analytics()', 'execute'), 'service_role can purge');

-- ===== Valid batches =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$select public.track_events('[]'::jsonb)$$, '42501', 'not_authenticated', 'tracking needs a user');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is(public.track_events($$[
  {"name": "lesson_completed", "props": {"lesson_key": "en:lesson:x", "score": 0.8, "first_try": true}, "at": "2026-10-13T10:00:00+07:00", "route": "/app/hoc-tap/bai/:lessonId"},
  {"name": "progress_viewed", "props": null, "at": null, "route": null},
  {"name": "page_view"}
]$$::jsonb), 3, 'three events stored');
select is(public.track_events('[]'::jsonb), 0, 'an empty batch stores nothing');
select is((select count(*)::integer from public.analytics_events), 3, 'the learner reads back own events');
select is((select props from public.analytics_events where name = 'lesson_completed'),
  '{"lesson_key": "en:lesson:x", "score": 0.8, "first_try": true}'::jsonb, 'props stored as sent');
select is((select client_at from public.analytics_events where name = 'lesson_completed'), '2026-10-13T03:00:00Z'::timestamptz, 'client time kept as client_at');
select is((select props from public.analytics_events where name = 'page_view'), '{}'::jsonb, 'missing props stored as an empty object');

-- ===== Invalid events (the whole batch is rejected) =====
select throws_ok($$select public.track_events('[{"name": "signup_clicked"}]'::jsonb)$$, 'P0001', 'invalid_event', 'unknown event name');
select throws_ok($$select public.track_events('{"name": "page_view"}'::jsonb)$$, 'P0001', 'invalid_event', 'batch must be an array');
select throws_ok(format('select public.track_events(%L::jsonb)', public.c9_batch(21)), 'P0001', 'invalid_event', 'more than 20 events');
select throws_ok($$select public.track_events('[{"name": "page_view", "props": {"a": 1, "b": 1, "c": 1, "d": 1, "e": 1, "f": 1, "g": 1, "h": 1, "i": 1}}]'::jsonb)$$,
  'P0001', 'invalid_event', 'more than 8 props');
select throws_ok(format('select public.track_events(%L::jsonb)', jsonb_build_array(jsonb_build_object('name', 'page_view', 'props', jsonb_build_object('note', repeat('x', 65))))),
  'P0001', 'invalid_event', 'string prop longer than 64');
select throws_ok($$select public.track_events('[{"name": "page_view", "props": {"Email": "x"}}]'::jsonb)$$, 'P0001', 'invalid_event', 'prop key outside ^[a-z_]{1,32}$');
select throws_ok($$select public.track_events('[{"name": "page_view", "props": {"user": {"email": "a@b.c"}}}]'::jsonb)$$, 'P0001', 'invalid_event', 'nested prop value');
select throws_ok($$select public.track_events('[{"name": "page_view", "route": "/app/bai?id=1"}]'::jsonb)$$, 'P0001', 'invalid_event', 'route with a query');
select throws_ok($$select public.track_events('[{"name": "page_view", "at": "yesterday-ish"}]'::jsonb)$$, 'P0001', 'invalid_event', 'unparseable client time');
select throws_ok($$select public.track_events('[{"name": "page_view"}, {"name": "nope"}]'::jsonb)$$, 'P0001', 'invalid_event', 'one bad element rejects the batch');
select is((select count(*)::integer from public.analytics_events), 3, 'rejected batches stored nothing');

-- ===== Rate limit: 120 events per minute =====
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is((select sum(public.track_events(public.c9_batch(20)))::integer from generate_series(1, 6)), 120, '120 events within a minute are accepted');
select throws_ok(format('select public.track_events(%L::jsonb)', public.c9_batch(1)), 'P0001', 'rate_limited', 'the 121st event is rate limited');
select is((select count(*)::integer from public.analytics_events where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'B cannot read A''s events');

-- ===== Opt-out =====
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
update public.user_preferences set analytics_opt_out = true where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is(public.track_events(public.c9_batch(2)), 0, 'opted-out learner: returns 0');

-- ===== Purge (service_role only) =====
reset role;
update public.analytics_events set created_at = now() - interval '181 days' where name = 'lesson_completed';
select is((select count(*)::integer from public.analytics_events where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0, 'nothing stored for the opted-out learner');
set local role service_role;
select is(public.purge_analytics(), 1, 'purge deletes events older than 180 days');
reset role;

select * from finish();
rollback;
