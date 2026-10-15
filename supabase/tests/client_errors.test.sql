-- Client error reporting (migration 20261016000700): the client_error analytics event is a strict whitelist,
-- bounded in size, rate limited per user (20/hour, excess dropped silently), respects analytics_opt_out, is isolated
-- per user and surfaces to admins only as an aggregate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin@test.dev', '{}');
insert into public.staff_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin');

-- A batch of p_n valid client_error events.
create function public.ce_batch(p_n integer) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', 'client_error',
    'props', jsonb_build_object('kind', 'render_error', 'code', 'TypeError', 'online', true),
    'at', '2026-10-13T10:00:00Z', 'route', '/app/hoc-tap/bai/:lessonId')), '[]'::jsonb)
  from generate_series(1, p_n);
$$;
create function public.ce_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.ce_batch(integer), public.ce_as(uuid) to authenticated;

set local role authenticated;
select public.ce_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- ===== Valid events =====
select is(public.track_events($$[
  {"name": "client_error", "props": {"kind": "chunk_load_error", "code": "ChunkLoadError", "build": "1.2.3+abc", "online": false}, "route": "/app/hoc-tap/bai/:lessonId"},
  {"name": "client_error", "props": {"kind": "window_error"}, "route": null}
]$$::jsonb), 2, 'valid client errors are stored');
select is((select props from public.analytics_events where props ->> 'kind' = 'chunk_load_error'),
  '{"kind": "chunk_load_error", "code": "ChunkLoadError", "build": "1.2.3+abc", "online": false}'::jsonb, 'props stored as sent');

-- ===== Whitelist (the whole batch is rejected) =====
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "boom"}}]'::jsonb)$$, 'P0001', 'invalid_event', 'unknown kind');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {}}]'::jsonb)$$, 'P0001', 'invalid_event', 'kind is required');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error", "message": "x"}}]'::jsonb)$$,
  'P0001', 'invalid_event', 'extra prop keys (message) are rejected');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error", "email": "a@b.c"}}]'::jsonb)$$,
  'P0001', 'invalid_event', 'an email prop is rejected');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error", "code": "Cannot read x of user text"}}]'::jsonb)$$,
  'P0001', 'invalid_event', 'a code with free text is rejected');
select throws_ok(format('select public.track_events(%L::jsonb)', jsonb_build_array(jsonb_build_object('name', 'client_error',
  'props', jsonb_build_object('kind', 'render_error', 'code', repeat('x', 61))))), 'P0001', 'invalid_event', 'code longer than 60');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error", "online": "yes"}}]'::jsonb)$$,
  'P0001', 'invalid_event', 'online must be a boolean');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error", "build": "a b"}}]'::jsonb)$$,
  'P0001', 'invalid_event', 'build must be a token');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error"}, "route": "/app/bai/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab"}]'::jsonb)$$,
  'P0001', 'invalid_event', 'a route with an id is rejected');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error"}, "route": "/app/bai?token=abc"}]'::jsonb)$$,
  'P0001', 'invalid_event', 'a route with a query is rejected');
select throws_ok($$select public.track_events('[{"name": "client_error", "props": {"kind": "render_error"}, "route": "/app/bai/a b"}]'::jsonb)$$,
  'P0001', 'invalid_event', 'a route with spaces is rejected');
select is((select count(*)::integer from public.analytics_events), 2, 'rejected batches stored nothing');

-- ===== Rate limit: 20 per hour, the excess dropped silently =====
select public.ce_as('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is(public.track_events(public.ce_batch(15)), 15, '15 client errors stored');
select is(public.track_events(public.ce_batch(10)), 5, 'only 5 more fit in the hourly budget; the rest is dropped without error');
select is(public.track_events(public.ce_batch(3)), 0, 'beyond the budget nothing is stored and nothing is raised');
select is((select count(*)::integer from public.analytics_events where name = 'client_error'), 20, 'B has exactly 20 stored');
select is(public.track_events('[{"name": "page_view"}]'::jsonb), 1, 'other events are not affected by the client_error budget');

-- ===== Isolation and opt-out =====
select is((select count(*)::integer from public.analytics_events where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'B cannot read A''s error rows');
select public.ce_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
update public.user_preferences set analytics_opt_out = true where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is(public.track_events(public.ce_batch(2)), 0, 'opted-out learner: client errors are not stored');

-- ===== Admin aggregate =====
select public.ce_as('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select set_config('test.an', public.admin_analytics(7)::text, true);
select is((current_setting('test.an')::jsonb #>> '{client_errors,total}')::integer, 22, 'admin sees the total of client errors');
select is(current_setting('test.an')::jsonb #> '{client_errors,by_kind,0}', '{"kind": "render_error", "count": 20}'::jsonb, 'counts by kind, largest first');
select ok(position('bbbbbbbb' in current_setting('test.an')) = 0 and position('user_id' in current_setting('test.an')) = 0,
  'the aggregate carries no user id');

select * from finish();
rollback;
