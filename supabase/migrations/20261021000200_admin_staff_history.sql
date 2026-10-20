-- Staff page /quan-tri/nhan-su: who granted and revoked what. admin_audit_log already records every role and teacher
-- change ('grant_role', 'revoke_role' from admin_grant_role, 20261016000500; 'grant_teacher', 'revoke_teacher' from
-- grant_teacher_role, 20261017000400) but the log page shows opaque ids. admin_staff_history returns those four
-- actions, newest first, with the actor's and the target's email, so the staff page can show a readable history.
-- JSON shape mirrors adminStaffHistorySchema in packages/shared/src/admin/contract.ts.
--
-- Like admin_list_staff (20261017000500_admin_staff.sql) it reveals account emails, so it is admin only, security
-- definer with an empty search_path, and leaves at most one 'list_staff_history' row in admin_audit_log per admin every
-- 10 minutes. Reading a later page (p_offset > 0) is not logged again within that window either.

-- {total, entries}: total counts every matching row; entries are at most p_limit (1..100, default 25) starting at
-- p_offset (>= 0). Each entry: id, created_at, action, actor_id/actor_email (null for changes made by SQL),
-- target_id/target_email (email null once the account is deleted), role / previous_role (role actions, null = none)
-- and was_teacher (teacher actions).
create or replace function public.admin_staff_history(p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_entries jsonb;
begin
  perform admin_private.require_role('admin');

  select count(*)::integer into v_total
  from public.admin_audit_log l
  where l.action in ('grant_role', 'revoke_role', 'grant_teacher', 'revoke_teacher');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'created_at', e.created_at,
      'action', e.action,
      'actor_id', e.actor,
      'actor_email', ua.email,
      'target_id', e.target_uuid,
      'target_email', ut.email,
      'role', e.detail ->> 'role',
      'previous_role', e.detail ->> 'previous_role',
      'was_teacher', case when e.action in ('grant_teacher', 'revoke_teacher') then (e.detail ->> 'was_teacher')::boolean end)
    order by e.created_at desc, e.id), '[]'::jsonb)
  into v_entries
  from (
    select l.id, l.created_at, l.action, l.actor, l.detail,
      case when l.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then l.target_id::uuid end as target_uuid
    from public.admin_audit_log l
    where l.action in ('grant_role', 'revoke_role', 'grant_teacher', 'revoke_teacher')
    order by l.created_at desc, l.id
    limit v_limit offset v_offset
  ) e
  left join auth.users ua on ua.id = e.actor
  left join auth.users ut on ut.id = e.target_uuid;

  if not exists (
    select 1 from public.admin_audit_log a
    where a.actor = auth.uid() and a.action = 'list_staff_history' and a.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    perform admin_private.audit('list_staff_history', 'staff', null, jsonb_build_object('total', v_total));
  end if;
  return jsonb_build_object('total', v_total, 'entries', v_entries);
end;
$$;

revoke all on function public.admin_staff_history(integer, integer) from public, anon;
grant execute on function public.admin_staff_history(integer, integer) to authenticated;
