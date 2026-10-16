-- 20261018090000_db_hardening.sql: attempts path index, last-admin guard in delete_my_account, resolved_by hidden
-- from learners.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- A1, A2 admins, L learner.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('d1000000-0000-4000-8000-000000000001', 'admin1@test.dev', '{}', now()),
  ('d1000000-0000-4000-8000-000000000002', 'admin2@test.dev', '{}', now()),
  ('d1000000-0000-4000-8000-000000000003', 'learner@test.dev', '{}', now());
insert into public.staff_roles (user_id, role, granted_by, granted_at) values
  ('d1000000-0000-4000-8000-000000000001', 'admin', null, now()),
  ('d1000000-0000-4000-8000-000000000002', 'admin', null, now());

create function public.dh_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.dh_as(uuid) to authenticated;

-- ===== 1. Index =====
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'attempts'
    and indexname = 'attempts_learning_path_idx'), 'attempts has an index on learning_path_id');

-- ===== 3. resolved_by =====
select ok(not has_column_privilege('authenticated', 'public.content_reports', 'resolved_by', 'select'),
  'learners cannot read resolved_by');
select ok(has_column_privilege('authenticated', 'public.content_reports', 'status', 'select')
  and has_column_privilege('authenticated', 'public.content_reports', 'resolution_note', 'select')
  and has_column_privilege('authenticated', 'public.content_reports', 'resolved_at', 'select'),
  'learners still read the status, resolution note and time of their reports');
select ok(not has_table_privilege('authenticated', 'public.content_reports', 'insert')
  and not has_table_privilege('authenticated', 'public.content_reports', 'update'), 'learners still cannot write reports');

-- ===== 2. Last admin =====
-- Two admins: the first one may delete their account.
select public.dh_as('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$select public.delete_my_account('XOA TAI KHOAN')$$, 'an admin can leave while another admin remains');
reset role;
select ok(not exists (select 1 from auth.users where id = 'd1000000-0000-4000-8000-000000000001'), 'and their account is gone');

-- Now A2 is the last admin.
select public.dh_as('d1000000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok($$select public.delete_my_account('XOA TAI KHOAN')$$, 'P0001', 'last_admin_required',
  'the last admin cannot delete their account');
reset role;
select ok(exists (select 1 from auth.users where id = 'd1000000-0000-4000-8000-000000000002'), 'and the last admin stays');

-- Learners are unaffected.
select public.dh_as('d1000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select public.delete_my_account('XOA TAI KHOAN')$$, 'a learner can still delete their account');
reset role;

select * from finish();
rollback;
