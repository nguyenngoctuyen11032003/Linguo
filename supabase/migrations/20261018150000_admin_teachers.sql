-- Teacher management on the staff page /quan-tri/nhan-su (admin only). Granting and revoking already exist:
-- grant_teacher_role(p_user_id, p_grant) in 20261017000400_teacher_tools.sql (audited 'grant_teacher' /
-- 'revoke_teacher'). This adds the read side: teacher_profiles is readable only by its own row, so an admin needs an
-- RPC to see who is a teacher. The JSON shape mirrors adminTeacherSchema in packages/shared/src/admin/contract.ts.
--
-- Like admin_list_staff (20261017000500_admin_staff.sql) it reveals account emails, so it is admin only, security
-- definer with an empty search_path, and leaves at most one 'list_teachers' row in admin_audit_log per admin every
-- 10 minutes (the page reloads the list after every change).

-- adminTeacherSchema[]: every teacher_profiles row with the account email, profile display name, granting admin and
-- the number of classes the teacher runs (active = not archived), oldest grant first.
create or replace function public.admin_list_teachers()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform admin_private.require_role('admin');

  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', t.user_id,
      'email', u.email,
      'display_name', p.display_name,
      'granted_by', t.granted_by,
      'granted_by_email', g.email,
      'granted_at', t.granted_at,
      'active_classes', (select count(*)::integer from public.classes c
                          where c.teacher_id = t.user_id and c.archived_at is null))
    order by t.granted_at, t.user_id), '[]'::jsonb)
  into v_result
  from public.teacher_profiles t
  left join auth.users u on u.id = t.user_id
  left join public.profiles p on p.id = t.user_id
  left join auth.users g on g.id = t.granted_by;

  if not exists (
    select 1 from public.admin_audit_log a
    where a.actor = auth.uid() and a.action = 'list_teachers' and a.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    perform admin_private.audit('list_teachers', 'teacher', null, jsonb_build_object('count', jsonb_array_length(v_result)));
  end if;
  return v_result;
end;
$$;

revoke all on function public.admin_list_teachers() from public, anon;
grant execute on function public.admin_list_teachers() to authenticated;
