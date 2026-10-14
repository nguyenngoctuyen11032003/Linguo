-- Linguo spec 11 §2: learners report problems with published content ("Báo lỗi nội dung").
--   report_content(p_target_kind, p_target_id, p_reason, p_note)  → {report_id, status: 'open' | 'duplicate'}
--   list_my_reports(p_limit default 50)                            → the caller's reports, newest first
-- JSON shapes and limits mirror packages/shared/src/admin/contract.ts (reportContentResultSchema, myReportSchema,
-- REPORT_RULES). Errors: 42501 not_authenticated, otherwise P0001 with a CONTENT_REPORT_ERROR_CODES message.
--
-- Learners read their own reports (and how staff resolved them) through RLS; rows are written only by
-- report_content and resolved only by the staff RPCs of 20261015000410_admin.sql. resolved_by has no foreign
-- key on purpose: delete_my_account deletes rows behind non-cascading auth.users keys, and a staff member
-- leaving must not erase the reports they resolved.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('exercise', 'learning_item', 'lesson', 'assessment_item', 'exam_question')),
  target_id uuid not null,
  -- Version of the target when it was reported (exam questions: their form's version).
  content_version integer check (content_version is null or content_version >= 1),
  reason text not null check (reason in ('wrong_answer', 'unclear', 'typo', 'audio', 'translation', 'offensive', 'other')),
  note text check (note is null or char_length(note) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'triaged', 'fixed', 'rejected', 'duplicate')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index content_reports_user_created_idx on public.content_reports (user_id, created_at desc);
create index content_reports_target_idx on public.content_reports (target_kind, target_id, created_at desc);
create index content_reports_unresolved_idx on public.content_reports (created_at desc) where status in ('open', 'triaged');

comment on table public.content_reports is 'Learner reports about published content (spec 11 §2). Learners read their own rows; written only by report_content and the staff RPCs.';

alter table public.content_reports enable row level security;

create policy "content reports: read own" on public.content_reports
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.content_reports from public, anon, authenticated;
grant select on public.content_reports to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients; scalar arguments only)
-- ---------------------------------------------------------------------------

-- Short human label of a report target (lesson title, item headword, question prompt excerpt), at most
-- p_max characters, or null when the target is gone. Never reveals an answer: a listening exercise
-- (whose fallback_text is what the learner must recognise) is labelled with its lesson title.
create or replace function public.content_target_label(p_kind text, p_id uuid, p_max integer default 80)
returns text
language sql
stable
set search_path = ''
as $$
  select left(btrim(regexp_replace(v.label, '\s+', ' ', 'g')), greatest(p_max, 1))
  from (
    select case p_kind
      when 'lesson' then (select l.title ->> 'vi' from public.lessons l where l.id = p_id)
      when 'learning_item' then (select coalesce(i.front ->> 'text', i.key) from public.learning_items i where i.id = p_id)
      when 'exercise' then (
        select coalesce(e.prompt ->> 'stem', e.prompt ->> 'template', e.prompt ->> 'instruction', e.prompt ->> 'source_text',
                        l.title ->> 'vi', e.key)
        from public.exercises e join public.lessons l on l.id = e.lesson_id
        where e.id = p_id)
      when 'assessment_item' then (select coalesce(a.prompt ->> 'stem', a.key) from public.assessment_items a where a.id = p_id)
      when 'exam_question' then (
        select coalesce(nullif(q.prompt ->> 'stem', ''), q.prompt ->> 'instruction_vi', q.key)
        from public.exam_questions q where q.id = p_id)
    end as label
  ) v;
$$;

-- Version of a published, learner-visible report target, or null when it does not exist or is not
-- published (an exercise needs its lesson published too, an exam question its form).
create or replace function public.content_report_target_version(p_kind text, p_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'lesson' then (select l.version from public.lessons l where l.id = p_id and l.status = 'published')
    when 'learning_item' then (select i.version from public.learning_items i where i.id = p_id and i.status = 'published')
    when 'exercise' then (
      select e.version from public.exercises e join public.lessons l on l.id = e.lesson_id
      where e.id = p_id and e.status = 'published' and l.status = 'published')
    when 'assessment_item' then (select a.version from public.assessment_items a where a.id = p_id and a.status = 'published')
    when 'exam_question' then (
      select f.version from public.exam_questions q join public.exam_forms f on f.id = q.form_id
      where q.id = p_id and q.status = 'published' and f.status = 'published')
  end;
$$;

-- ---------------------------------------------------------------------------
-- report_content
-- ---------------------------------------------------------------------------
-- Checks, in order: signed in; kind (invalid_target); reason (invalid_reason); note ≤ 500 after trimming,
-- blank = none (note_too_long); target exists and is published (target_not_found); at most 20 reports in
-- the last 24 hours (rate_limited). A target already reported (by anyone) in the last 24 hours is still
-- recorded, with status 'duplicate'.
create or replace function public.report_content(p_target_kind text, p_target_id uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(btrim(p_note), '');
  v_version integer;
  v_recent integer;
  v_status text := 'open';
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_target_kind is null
     or p_target_kind not in ('exercise', 'learning_item', 'lesson', 'assessment_item', 'exam_question')
     or p_target_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_target';
  end if;
  if p_reason is null
     or p_reason not in ('wrong_answer', 'unclear', 'typo', 'audio', 'translation', 'offensive', 'other') then
    raise exception using errcode = 'P0001', message = 'invalid_reason';
  end if;
  if char_length(v_note) > 500 then
    raise exception using errcode = 'P0001', message = 'note_too_long';
  end if;

  v_version := public.content_report_target_version(p_target_kind, p_target_id);
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'target_not_found';
  end if;

  -- Serialise one learner's reports so the daily limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('report_content:' || v_uid::text, 0));
  select count(*) into v_recent
  from public.content_reports r
  where r.user_id = v_uid and r.created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  if exists (
    select 1 from public.content_reports r
    where r.target_kind = p_target_kind and r.target_id = p_target_id and r.created_at > now() - interval '24 hours'
  ) then
    v_status := 'duplicate';
  end if;

  insert into public.content_reports (user_id, target_kind, target_id, content_version, reason, note, status)
  values (v_uid, p_target_kind, p_target_id, v_version, p_reason, v_note, v_status)
  returning id into v_id;

  return jsonb_build_object('report_id', v_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_my_reports
-- ---------------------------------------------------------------------------
-- The caller's reports, newest first, at most p_limit (1..200, default 50).
create or replace function public.list_my_reports(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'target_kind', r.target_kind,
        'target_id', r.target_id,
        'target_label', public.content_target_label(r.target_kind, r.target_id, 80),
        'reason', r.reason,
        'note', r.note,
        'status', r.status,
        'resolution_note', r.resolution_note,
        'created_at', r.created_at,
        'resolved_at', r.resolved_at)
      order by r.created_at desc, r.id)
    from (
      select * from public.content_reports c
      where c.user_id = v_uid
      order by c.created_at desc, c.id
      limit v_limit
    ) r
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account export: content_reports joins the optional user tables
-- ---------------------------------------------------------------------------
-- export_my_data adds every table named here that exists and has a user_id column, so the list may name
-- tables of other spec 10/11 migrations that are not created yet (notification_prefs, push_subscriptions,
-- notifications): they are picked up as soon as they exist.
create or replace function public.account_optional_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['study_sessions', 'activity_days', 'user_badges', 'analytics_events', 'content_reports',
    'notification_prefs', 'push_subscriptions', 'notifications'];
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.content_target_label(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.content_report_target_version(text, uuid) from public, anon, authenticated;
revoke all on function public.account_optional_tables() from public, anon, authenticated;
revoke all on function public.report_content(text, uuid, text, text) from public, anon;
revoke all on function public.list_my_reports(integer) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.list_my_reports(integer) to authenticated;
