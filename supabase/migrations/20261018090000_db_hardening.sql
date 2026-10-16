-- Low-severity findings of the DB security audit (2026-10-16):
--   1. public.attempts had no index starting with learning_path_id, so the path cascade of delete_my_account (and of
--      deleting a learning path) scanned the whole table.
--   2. delete_my_account could delete the last admin, leaving /quan-tri without anyone able to grant roles. It now
--      raises last_admin_required, under the same advisory lock as admin_grant_role.
--   3. A learner could read content_reports.resolved_by (the staff member's user id) of their own reports through
--      RLS. Learners now get every column except resolved_by; staff read reports only through the admin RPCs.

-- 1 ------------------------------------------------------------------------
create index if not exists attempts_learning_path_idx on public.attempts (learning_path_id);

-- 2 ------------------------------------------------------------------------
-- Same function as 20261014000910_account_data.sql plus the last-admin guard.
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_confirm is distinct from 'XOA TAI KHOAN' then
    raise exception using errcode = 'P0001', message = 'invalid_confirmation';
  end if;

  -- The last admin cannot leave (they must grant admin to someone else first). Serialised with admin_grant_role so
  -- two admins cannot delete or demote each other at the same time.
  perform pg_advisory_xact_lock(hashtextextended('admin_grant_role', 0));
  if exists (select 1 from public.staff_roles s where s.user_id = v_uid and s.role = 'admin')
     and not exists (select 1 from public.staff_roles s where s.role = 'admin' and s.user_id <> v_uid) then
    raise exception using errcode = 'P0001', message = 'last_admin_required';
  end if;

  -- Every current user table cascades from auth.users (directly or through learning_paths). Rows behind a
  -- foreign key that would not cascade (set null / restrict / no action, e.g. in a later migration) are
  -- deleted explicitly first: path children, then direct auth.users children.
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.learning_paths'::regclass and c.confdeltype <> 'c'
      and cardinality(c.conkey) = 1 and n.nspname = 'public'
      and c.conrelid <> 'public.profiles'::regclass -- current_learning_path_id (set null); profiles cascades
  loop
    execute format('delete from %s where %I in (select lp.id from public.learning_paths lp where lp.user_id = $1)', r.tbl, r.col)
      using v_uid;
  end loop;

  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype <> 'c'
      and cardinality(c.conkey) = 1 and n.nspname = 'public'
  loop
    execute format('delete from %s where %I = $1', r.tbl, r.col) using v_uid;
  end loop;

  delete from auth.users u where u.id = v_uid;

  -- Tables keyed by user_id without any foreign key (none today) are swept last.
  for r in
    select format('%I.%I', c.table_schema, c.table_name) as tbl
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and c.data_type = 'uuid'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from %s where user_id = $1', r.tbl) using v_uid;
  end loop;

  insert into public.account_deletions (reason_code) values ('self_service');
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- 3 ------------------------------------------------------------------------
-- Column grants instead of a table grant: a select naming resolved_by (or select *) is refused for learners.
revoke select on public.content_reports from authenticated;
grant select (id, user_id, target_kind, target_id, content_version, reason, note, status, resolution_note,
  resolved_at, created_at) on public.content_reports to authenticated;
