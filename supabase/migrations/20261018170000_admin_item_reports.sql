-- Spec 11 §4 content detail, "Báo lỗi liên quan": the number of unresolved (open or triaged) learner reports on
-- one content row, so /quan-tri/noi-dung/:kind/:id shows it on a refresh or a direct link, not only when opened
-- from the list. Counted exactly like admin_list_content's open_reports.
--
-- Editor+ (admin_private.require_role), security definer, empty search_path; read-only, so no audit row (only
-- RPCs that change data write admin_audit_log). Errors: not_authenticated, staff_forbidden, invalid_kind (p_kind
-- must be a report target kind: content_reports.target_kind). No language codes are involved.

create or replace function public.admin_item_open_reports(p_kind text, p_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform admin_private.require_role('editor');
  if p_kind is null or p_kind not in ('exercise', 'learning_item', 'lesson', 'assessment_item', 'exam_question') then
    raise exception using errcode = 'P0001', message = 'invalid_kind';
  end if;
  return (
    select count(*)::integer from public.content_reports r
    where r.target_kind = p_kind and r.target_id = p_id and admin_private.is_unresolved(r.status)
  );
end;
$$;

comment on function public.admin_item_open_reports(text, uuid) is
  'Spec 11: unresolved (open/triaged) report count of one content row. Editor+.';

-- Supabase grants EXECUTE on new public functions to anon/authenticated by default.
revoke all on function public.admin_item_open_reports(text, uuid) from public, anon;
grant execute on function public.admin_item_open_reports(text, uuid) to authenticated;
