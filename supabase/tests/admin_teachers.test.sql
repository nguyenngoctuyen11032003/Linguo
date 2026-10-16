-- 20261018150000_admin_teachers.sql: admin_list_teachers behind the teacher section of /quan-tri/nhan-su, with
-- grant_teacher_role (20261017000400_teacher_tools.sql) granting and revoking from the same page.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- L learner, R reviewer, A admin, T1/T2 teachers.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'learner@test.dev', '{}', now()),
  ('33333333-3333-4333-8333-333333333333', 'reviewer@test.dev', '{}', now()),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.dev', '{}', now()),
  ('55555555-5555-4555-8555-555555555551', 'Teacher1@Test.dev', '{}', now()),
  ('55555555-5555-4555-8555-555555555552', 'teacher2@test.dev', '{}', now());
update public.profiles set display_name = 'Cô Lan' where id = '55555555-5555-4555-8555-555555555551';
insert into public.staff_roles (user_id, role, granted_by, granted_at) values
  ('33333333-3333-4333-8333-333333333333', 'reviewer', '44444444-4444-4444-8444-444444444444', now() - interval '1 day'),
  ('44444444-4444-4444-8444-444444444444', 'admin', null, now() - interval '3 days');
-- T1 granted by SQL two days ago with one active and one archived class.
insert into public.teacher_profiles (user_id, granted_by, granted_at) values
  ('55555555-5555-4555-8555-555555555551', null, now() - interval '2 days');
insert into public.classes (teacher_id, name, language_code, archived_at) values
  ('55555555-5555-4555-8555-555555555551', 'Hàn 1', 'ko', null),
  ('55555555-5555-4555-8555-555555555551', 'Hàn cũ', 'ko', now());

create function public.c1t_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function public.c1t_err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function public.c1t_as(uuid), public.c1t_err(text) to authenticated;

-- ===== Privileges =====
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_list_teachers'),
  'admin_list_teachers is security definer with an empty search_path');
select ok(not has_function_privilege('anon', 'public.admin_list_teachers()', 'execute'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.admin_list_teachers()', 'execute'), 'signed-in users can call it (role checked inside)');

-- ===== Below admin: refused =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.admin_list_teachers()', '42501', 'not_authenticated', 'admin_list_teachers needs a user');
select public.c1t_as('11111111-1111-4111-8111-111111111111');
select is(public.c1t_err('select public.admin_list_teachers()'), 'P0001 staff_forbidden', 'a learner cannot list teachers');
select public.c1t_as('55555555-5555-4555-8555-555555555551');
select is(public.c1t_err('select public.admin_list_teachers()'), 'P0001 staff_forbidden', 'a teacher cannot list teachers');
select public.c1t_as('33333333-3333-4333-8333-333333333333');
select is(public.c1t_err('select public.admin_list_teachers()'), 'P0001 staff_forbidden', 'a reviewer cannot list teachers');

-- ===== Admin: list, grant, list again, revoke =====
select public.c1t_as('44444444-4444-4444-8444-444444444444');
select set_config('test.t', public.admin_list_teachers()::text, true);
select is(jsonb_array_length(current_setting('test.t')::jsonb), 1, 'one teacher before any grant');
select is((current_setting('test.t')::jsonb -> 0) - 'granted_at',
  jsonb_build_object('user_id', '55555555-5555-4555-8555-555555555551', 'email', 'Teacher1@Test.dev', 'display_name', 'Cô Lan',
    'granted_by', null, 'granted_by_email', null, 'active_classes', 1),
  'a row matches adminTeacherSchema: email, display name, no granter for SQL, archived classes not counted');

select is(public.grant_teacher_role('55555555-5555-4555-8555-555555555552', true) ->> 'is_teacher', 'true', 'admin grants T2');
select set_config('test.t', public.admin_list_teachers()::text, true);
select is((select array_agg(e ->> 'email' order by o) from jsonb_array_elements(current_setting('test.t')::jsonb) with ordinality x (e, o)),
  array['Teacher1@Test.dev', 'teacher2@test.dev'], 'teachers are listed oldest grant first');
select is(current_setting('test.t')::jsonb -> 1 ->> 'granted_by_email', 'admin@test.dev', 'a grant from the page names the admin');
select is((current_setting('test.t')::jsonb -> 1 ->> 'active_classes')::integer, 0, 'a new teacher runs no class');
select ok(not (current_setting('test.t')::text like '%learner@test.dev%'), 'learners are not listed');

select is(public.grant_teacher_role('55555555-5555-4555-8555-555555555551', false) ->> 'is_teacher', 'false', 'admin revokes T1');
select is((select array_agg(e ->> 'user_id') from jsonb_array_elements(public.admin_list_teachers()) e),
  array['55555555-5555-4555-8555-555555555552'], 'a revoked teacher leaves the list');

-- ===== Audit =====
reset role;
select is((select count(*)::integer from public.admin_audit_log where action = 'list_teachers' and actor = '44444444-4444-4444-8444-444444444444'), 1,
  'listing teachers is audited at most once per 10 minutes');
select is((select detail from public.admin_audit_log where action = 'list_teachers'), '{"count": 1}'::jsonb,
  'the audit row records how many teachers were listed, never emails');
select is((select array_agg(action || ':' || target_id order by created_at) from public.admin_audit_log
    where action in ('grant_teacher', 'revoke_teacher')),
  array['grant_teacher:55555555-5555-4555-8555-555555555552', 'revoke_teacher:55555555-5555-4555-8555-555555555551'],
  'grant and revoke from the page are audited');

select * from finish();
rollback;
