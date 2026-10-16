begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- admin_item_open_reports (20261018120000_admin_item_reports.sql): unresolved report count of one content row.

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('a1700000-0000-4000-8000-000000000001', 'air-learner@test.dev', '{}', now()),
  ('a1700000-0000-4000-8000-000000000002', 'air-learner2@test.dev', '{}', now()),
  ('a1700000-0000-4000-8000-000000000003', 'air-editor@test.dev', '{}', now());
insert into public.staff_roles (user_id, role) values ('a1700000-0000-4000-8000-000000000003', 'editor');

create function public.air_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '{"role": "authenticated"}'
    else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
$$;
grant execute on function public.air_as(uuid) to authenticated;

select set_config('test.ex', gen_random_uuid()::text, true);
select set_config('test.other', gen_random_uuid()::text, true);
insert into public.content_reports (user_id, target_kind, target_id, reason, status) values
  ('a1700000-0000-4000-8000-000000000001', 'exercise', current_setting('test.ex')::uuid, 'wrong_answer', 'open'),
  ('a1700000-0000-4000-8000-000000000002', 'exercise', current_setting('test.ex')::uuid, 'typo', 'triaged'),
  ('a1700000-0000-4000-8000-000000000001', 'exercise', current_setting('test.ex')::uuid, 'unclear', 'fixed'),
  ('a1700000-0000-4000-8000-000000000002', 'exercise', current_setting('test.ex')::uuid, 'other', 'rejected'),
  ('a1700000-0000-4000-8000-000000000001', 'exercise', current_setting('test.other')::uuid, 'typo', 'open'),
  -- Same id under another target kind is not counted.
  ('a1700000-0000-4000-8000-000000000001', 'lesson', current_setting('test.ex')::uuid, 'typo', 'open');

select set_config('test.audit', (select count(*)::text from public.admin_audit_log), true);

-- ===== Privileges =====
select ok(not has_function_privilege('anon', 'public.admin_item_open_reports(text, uuid)', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('public', 'public.admin_item_open_reports(text, uuid)', 'execute'), 'public cannot execute');
select ok(has_function_privilege('authenticated', 'public.admin_item_open_reports(text, uuid)', 'execute'), 'authenticated can execute');
select ok((select prosecdef from pg_proc where oid = 'public.admin_item_open_reports(text, uuid)'::regprocedure), 'security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.admin_item_open_reports(text, uuid)'::regprocedure),
  'empty search_path');

set local role authenticated;

select public.air_as(null);
select throws_ok(format('select public.admin_item_open_reports(''exercise'', %L)', current_setting('test.ex')), '42501', 'not_authenticated',
  'no user: not_authenticated');

select public.air_as('a1700000-0000-4000-8000-000000000001');
select throws_ok(format('select public.admin_item_open_reports(''exercise'', %L)', current_setting('test.ex')), 'P0001', 'staff_forbidden',
  'a learner is refused');

-- ===== Editor =====
select public.air_as('a1700000-0000-4000-8000-000000000003');
select is(public.admin_item_open_reports('exercise', current_setting('test.ex')::uuid), 2, 'open and triaged reports of the row are counted');
select is(public.admin_item_open_reports('lesson', current_setting('test.ex')::uuid), 1, 'counted per target kind');
select is(public.admin_item_open_reports('exercise', gen_random_uuid()), 0, 'a row without reports has 0');
select throws_ok(format('select public.admin_item_open_reports(''unit'', %L)', current_setting('test.ex')), 'P0001', 'invalid_kind',
  'a kind learners cannot report is invalid');
reset role;
select is((select count(*)::text from public.admin_audit_log), current_setting('test.audit'), 'reading the count writes no audit row');

select * from finish();
rollback;
