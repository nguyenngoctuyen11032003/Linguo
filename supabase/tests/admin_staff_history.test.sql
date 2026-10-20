begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- 20261021000200_admin_staff_history.sql: admin_staff_history reads role and teacher grants/revokes from
-- admin_audit_log with readable emails. Admin only, audited, paged.

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'learner@test.dev', '{}', now()),
  ('33333333-3333-4333-8333-333333333333', 'reviewer@test.dev', '{}', now()),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.dev', '{}', now()),
  ('55555555-5555-4555-8555-555555555551', 'teacher@test.dev', '{}', now());
insert into public.staff_roles (user_id, role, granted_by) values
  ('33333333-3333-4333-8333-333333333333', 'reviewer', '44444444-4444-4444-8444-444444444444'),
  ('44444444-4444-4444-8444-444444444444', 'admin', null);

create function public.hs_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function public.hs_err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function public.hs_as(uuid), public.hs_err(text) to authenticated;

-- ===== Privileges =====
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_staff_history'),
  'admin_staff_history is security definer with an empty search_path');
select ok(not has_function_privilege('anon', 'public.admin_staff_history(integer, integer)', 'execute'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.admin_staff_history(integer, integer)', 'execute'), 'signed-in users can call it (role checked inside)');

-- ===== Below admin: refused =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.admin_staff_history()', '42501', 'not_authenticated', 'it needs a user');
select public.hs_as('11111111-1111-4111-8111-111111111111');
select is(public.hs_err('select public.admin_staff_history()'), 'P0001 staff_forbidden', 'a learner cannot read the history');
select public.hs_as('33333333-3333-4333-8333-333333333333');
select is(public.hs_err('select public.admin_staff_history()'), 'P0001 staff_forbidden', 'a reviewer cannot read the history');

-- ===== Admin: empty, then real changes =====
select public.hs_as('44444444-4444-4444-8444-444444444444');
select is(public.admin_staff_history(), jsonb_build_object('total', 0, 'entries', '[]'::jsonb), 'no history before any change');
select public.admin_grant_role('11111111-1111-4111-8111-111111111111', 'editor');
select public.admin_grant_role('11111111-1111-4111-8111-111111111111', 'reviewer');
select public.admin_grant_role('11111111-1111-4111-8111-111111111111', null);
select public.grant_teacher_role('55555555-5555-4555-8555-555555555551', true);
select public.grant_teacher_role('55555555-5555-4555-8555-555555555551', false);
select set_config('test.h', public.admin_staff_history()::text, true);
select is((current_setting('test.h')::jsonb ->> 'total')::integer, 5, 'five changes are counted');
select is((select array_agg(e ->> 'action' order by o) from jsonb_array_elements(current_setting('test.h')::jsonb -> 'entries') with ordinality x (e, o)),
  array['revoke_teacher', 'grant_teacher', 'revoke_role', 'grant_role', 'grant_role'], 'newest first');
select is((current_setting('test.h')::jsonb -> 'entries' -> 2) - 'id' - 'created_at',
  jsonb_build_object('action', 'revoke_role', 'actor_id', '44444444-4444-4444-8444-444444444444', 'actor_email', 'admin@test.dev',
    'target_id', '11111111-1111-4111-8111-111111111111', 'target_email', 'learner@test.dev', 'role', null, 'previous_role', 'reviewer',
    'was_teacher', null), 'a revoke names actor, target and the role that was removed');
select is((current_setting('test.h')::jsonb -> 'entries' -> 4) - 'id' - 'created_at',
  jsonb_build_object('action', 'grant_role', 'actor_id', '44444444-4444-4444-8444-444444444444', 'actor_email', 'admin@test.dev',
    'target_id', '11111111-1111-4111-8111-111111111111', 'target_email', 'learner@test.dev', 'role', 'editor', 'previous_role', null,
    'was_teacher', null), 'a first grant has no previous role');
select is((current_setting('test.h')::jsonb -> 'entries' -> 0 ->> 'was_teacher'), 'true', 'a teacher revoke records that they were a teacher');
select ok(not (current_setting('test.h')::text like '%list_staff%'), 'reads of the lists are not part of the history');

-- ===== Paging =====
select is(jsonb_array_length(public.admin_staff_history(2, 0) -> 'entries'), 2, 'p_limit pages');
select is((public.admin_staff_history(2, 4) -> 'entries' -> 0 ->> 'action'), 'grant_role', 'p_offset skips');
select is(jsonb_array_length(public.admin_staff_history(2, 5) -> 'entries'), 0, 'past the end is empty');
select is(jsonb_array_length(public.admin_staff_history(1000, -3) -> 'entries'), 5, 'limits are clamped (limit <= 100, offset >= 0)');

-- ===== Audit =====
reset role;
select is((select count(*)::integer from public.admin_audit_log where action = 'list_staff_history'), 1,
  'reading the history is audited once per 10 minutes');
select is((select detail from public.admin_audit_log where action = 'list_staff_history'), '{"total": 0}'::jsonb,
  'and records only a count, never emails');
-- A changed account that was deleted later keeps its row, with no email.
delete from auth.users where id = '55555555-5555-4555-8555-555555555551';
set local role authenticated;
select public.hs_as('44444444-4444-4444-8444-444444444444');
select is((public.admin_staff_history() -> 'entries' -> 0 ->> 'target_email'), null, 'a deleted account has no email in the history');

select * from finish();
rollback;
