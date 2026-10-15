-- Staff management page /quan-tri/nhan-su (admin only). Two read RPCs next to admin_grant_role
-- (20261015000410_admin.sql, last-admin guard in 20261016000500_content_admin_hardening.sql). JSON shapes mirror
-- packages/shared/src/admin/contract.ts (adminStaffMemberSchema, adminFoundUserSchema).
--
-- Both are admin only, security definer with an empty search_path, and leave a row in admin_audit_log because they
-- reveal account emails: admin_list_staff at most one 'list_staff' row per admin every 10 minutes (the page reloads
-- the list after every change), admin_find_user one 'find_user' row per lookup. The searched text itself is never
-- logged (it may be the email of someone who is not a user); a hit logs the user id as the target.

-- adminStaffMemberSchema[]: every staff_roles row with the account email and profile display name, admins first,
-- then reviewers, then editors, oldest grant first within a role.
create or replace function public.admin_list_staff()
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
      'user_id', s.user_id,
      'email', u.email,
      'display_name', p.display_name,
      'role', s.role,
      'granted_by', s.granted_by,
      'granted_by_email', g.email,
      'granted_at', s.granted_at)
    order by admin_private.role_rank(s.role) desc, s.granted_at, s.user_id), '[]'::jsonb)
  into v_result
  from public.staff_roles s
  left join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join auth.users g on g.id = s.granted_by;

  if not exists (
    select 1 from public.admin_audit_log a
    where a.actor = auth.uid() and a.action = 'list_staff' and a.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    perform admin_private.audit('list_staff', 'staff', null, jsonb_build_object('count', jsonb_array_length(v_result)));
  end if;
  return v_result;
end;
$$;

-- adminFoundUserSchema, or null when no account matches. p_query is a user id (uuid) or an email address (exact,
-- case-insensitive, surrounding spaces ignored). Anything else, or more than 320 characters, raises invalid_user_query.
create or replace function public.admin_find_user(p_query text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_by text;
  v_user uuid;
  v_result jsonb;
begin
  perform admin_private.require_role('admin');
  if char_length(v_query) > 320 then
    raise exception using errcode = 'P0001', message = 'invalid_user_query';
  end if;
  if v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_by := 'id';
    select u.id into v_user from auth.users u where u.id = v_query::uuid;
  elsif v_query ~ '^[^@\s]+@[^@\s]+$' then
    v_by := 'email';
    select u.id into v_user from auth.users u where lower(u.email) = lower(v_query) order by u.created_at limit 1;
  else
    raise exception using errcode = 'P0001', message = 'invalid_user_query';
  end if;

  if v_user is not null then
    select jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'display_name', p.display_name,
        'role', s.role)
      into v_result
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.staff_roles s on s.user_id = u.id
    where u.id = v_user;
  end if;

  perform admin_private.audit('find_user', 'user', v_user::text, jsonb_build_object('by', v_by, 'found', v_user is not null));
  return v_result;
end;
$$;

revoke all on function public.admin_list_staff() from public, anon;
revoke all on function public.admin_find_user(text) from public, anon;
grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_find_user(text) to authenticated;
