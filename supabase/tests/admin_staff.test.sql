-- 20261017000500_admin_staff.sql: admin_list_staff and admin_find_user behind /quan-tri/nhan-su.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- L learner, E editor, R reviewer, A admin.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'learner@test.dev', '{}', now()),
  ('22222222-2222-4222-8222-222222222222', 'Editor@Test.dev', '{}', now()),
  ('33333333-3333-4333-8333-333333333333', 'reviewer@test.dev', '{}', now()),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.dev', '{}', now());
update public.profiles set display_name = 'Biên Tập' where id = '22222222-2222-4222-8222-222222222222';
insert into public.staff_roles (user_id, role, granted_by, granted_at) values
  ('22222222-2222-4222-8222-222222222222', 'editor', '44444444-4444-4444-8444-444444444444', now() - interval '2 days'),
  ('33333333-3333-4333-8333-333333333333', 'reviewer', '44444444-4444-4444-8444-444444444444', now() - interval '1 day'),
  ('44444444-4444-4444-8444-444444444444', 'admin', null, now() - interval '3 days');

create function public.c1s_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function public.c1s_err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function public.c1s_as(uuid), public.c1s_err(text) to authenticated;

-- ===== Privileges =====
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_list_staff', 'admin_find_user')),
  'both RPCs are security definer with an empty search_path');
select ok(not has_function_privilege('anon', 'public.admin_list_staff()', 'execute')
  and not has_function_privilege('anon', 'public.admin_find_user(text)', 'execute'), 'anon cannot call them');
select ok(has_function_privilege('authenticated', 'public.admin_list_staff()', 'execute')
  and has_function_privilege('authenticated', 'public.admin_find_user(text)', 'execute'), 'signed-in users can call them (role checked inside)');

-- ===== Below admin: refused =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.admin_list_staff()', '42501', 'not_authenticated', 'admin_list_staff needs a user');
select throws_ok('select public.admin_find_user(''admin@test.dev'')', '42501', 'not_authenticated', 'admin_find_user needs a user');
select public.c1s_as('11111111-1111-4111-8111-111111111111');
select is(public.c1s_err('select public.admin_list_staff()'), 'P0001 staff_forbidden', 'a learner cannot list staff');
select is(public.c1s_err('select public.admin_find_user(''admin@test.dev'')'), 'P0001 staff_forbidden', 'a learner cannot look users up');
select public.c1s_as('33333333-3333-4333-8333-333333333333');
select is(public.c1s_err('select public.admin_list_staff()'), 'P0001 staff_forbidden', 'a reviewer cannot list staff');
select is(public.c1s_err('select public.admin_find_user(''admin@test.dev'')'), 'P0001 staff_forbidden', 'a reviewer cannot look users up');

-- ===== Admin: list =====
select public.c1s_as('44444444-4444-4444-8444-444444444444');
select set_config('test.staff', public.admin_list_staff()::text, true);
select is((select array_agg(e ->> 'role' order by o) from jsonb_array_elements(current_setting('test.staff')::jsonb) with ordinality x (e, o)),
  array['admin', 'reviewer', 'editor'], 'staff are listed admins first, then reviewers, then editors');
-- granted_at is compared apart: staff_roles RLS hides other rows from the admin's own session.
select is((current_setting('test.staff')::jsonb -> 2) - 'granted_at',
  jsonb_build_object('user_id', '22222222-2222-4222-8222-222222222222', 'email', 'Editor@Test.dev', 'display_name', 'Biên Tập',
    'role', 'editor', 'granted_by', '44444444-4444-4444-8444-444444444444', 'granted_by_email', 'admin@test.dev'),
  'a row matches adminStaffMemberSchema with email, display name and granter');
select is(current_setting('test.staff')::jsonb -> 0 -> 'granted_by', 'null'::jsonb, 'a role granted by SQL has no granter');
select ok(not (current_setting('test.staff')::text like '%learner@test.dev%'), 'learners are not listed');
select lives_ok('select public.admin_list_staff()', 'listing again works');

-- ===== Admin: find =====
select is(public.admin_find_user('  editor@test.DEV '),
  '{"user_id": "22222222-2222-4222-8222-222222222222", "email": "Editor@Test.dev", "display_name": "Biên Tập", "role": "editor"}'::jsonb,
  'find by email is case-insensitive and ignores surrounding spaces');
select is(public.admin_find_user('11111111-1111-4111-8111-111111111111') ->> 'email', 'learner@test.dev', 'find by user id');
select is(public.admin_find_user('11111111-1111-4111-8111-111111111111') -> 'role', 'null'::jsonb, 'a learner has role null');
select is(public.admin_find_user('nobody@test.dev'), null, 'an unknown email returns null');
select is(public.admin_find_user(gen_random_uuid()::text), null, 'an unknown id returns null');
select throws_ok('select public.admin_find_user(''not an email'')', 'P0001', 'invalid_user_query', 'free text is rejected');
select throws_ok(format('select public.admin_find_user(%L)', repeat('a', 320) || '@x.dev'), 'P0001', 'invalid_user_query', 'too long');

-- ===== Audit =====
reset role;
select is((current_setting('test.staff')::jsonb -> 2 ->> 'granted_at')::timestamptz,
  (select s.granted_at from public.staff_roles s where s.user_id = '22222222-2222-4222-8222-222222222222'), 'granted_at is the grant time');
select is((select count(*)::integer from public.admin_audit_log where action = 'list_staff' and actor = '44444444-4444-4444-8444-444444444444'), 1,
  'listing staff is audited at most once per 10 minutes');
select is((select array_agg(coalesce(target_id, '-') || ':' || (detail ->> 'by') || ':' || (detail ->> 'found') order by created_at)
    from public.admin_audit_log where action = 'find_user'),
  array['22222222-2222-4222-8222-222222222222:email:true', '11111111-1111-4111-8111-111111111111:id:true',
    '11111111-1111-4111-8111-111111111111:id:true', '-:email:false', '-:id:false'],
  'every lookup is audited with the hit as target');
select ok(not exists (select 1 from public.admin_audit_log where action = 'find_user' and detail::text like '%@%'),
  'the searched text is never logged');

select * from finish();
rollback;
