-- Linguo spec 11 §3: staff roles, the admin audit log and the staff RPCs behind /quan-tri.
-- JSON shapes, error codes and rules mirror packages/shared/src/admin/contract.ts (staffRoleSchema,
-- adminOverviewSchema, adminContentListSchema, adminContentDetailSchema, adminSetStatusResultSchema,
-- adminSourceSchema, adminReportListSchema, adminResolveResultSchema, adminAnalyticsSchema, adminAiUsageSchema,
-- adminAuditEntrySchema, ADMIN_STATUS_TRANSITIONS, STAFF_ROLE_RANK).
--
-- Content is still authored in the repo (content/**.yaml); staff never edit it here. They preview it with its
-- answers, move it through the review workflow, resolve learner reports and read aggregate analytics.
--
-- Roles: editor < reviewer < admin. Granted only by SQL (bootstrap, docs/DEPLOY.md "Quản trị nội dung") or by
-- admin_grant_role. Every admin_* RPC is security definer with an empty search_path, checks the caller's role
-- and raises P0001 'staff_forbidden' when it is too low (42501 'not_authenticated' without a user). Every RPC
-- that changes data writes one admin_audit_log row. Analytics return aggregates only, never a user id or email.
--
-- Internals live in the admin_private schema, which is not exposed through the API and grants nothing to
-- clients. Answer keys and revisions are read from content_private only by admin_private helpers, so no
-- client-executable public function references content_private directly (content_no_leak.test.sql).
--
-- Error codes: not_authenticated, staff_forbidden, invalid_kind, content_not_found, invalid_status_transition,
-- open_wrong_answer_reports, invalid_report_status, invalid_range, invalid_role (ADMIN_ERROR_CODES), plus
-- user_not_found (admin_grant_role) and note_too_long (admin_resolve_report).

create schema admin_private;
comment on schema admin_private is 'Spec 11 admin internals (helpers, content index). Never exposed to anon/authenticated.';
revoke all on schema admin_private from public, anon, authenticated;
alter default privileges in schema admin_private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.staff_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('editor', 'reviewer', 'admin')),
  -- No foreign key: the granting admin may delete their account later.
  granted_by uuid,
  granted_at timestamptz not null default now()
);

comment on table public.staff_roles is 'Staff roles (editor < reviewer < admin). Users read only their own row; granted by SQL or admin_grant_role.';

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- The staff member (auth.uid()), or null for changes made by SQL. No foreign key: the log outlives accounts.
  actor uuid,
  actor_role text,
  action text not null check (action ~ '^[a-z_]{1,48}$'),
  target_kind text,
  target_id text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  -- clock_timestamp(): several changes made in one transaction keep their order in admin_audit_log_recent.
  created_at timestamptz not null default clock_timestamp()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_kind, target_id);

comment on table public.admin_audit_log is 'One row per change made through the staff RPCs. No client access; admins read it through admin_audit_log_recent.';

alter table public.staff_roles enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "staff roles: read own" on public.staff_roles
  for select to authenticated using ((select auth.uid()) = user_id);
-- admin_audit_log: no policy, no grant.

revoke all on public.staff_roles, public.admin_audit_log from public, anon, authenticated;
grant select on public.staff_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Status workflow: let the review RPC send approved/published content back to review
-- ---------------------------------------------------------------------------
-- Same function as 20261014000100_content.sql, plus one clause: while admin_set_status runs it sets
-- linguo.content_import (transaction-local) to 'admin', which also allows approved → in_review and
-- published → in_review (ADMIN_STATUS_TRANSITIONS). Clients cannot update content tables at all.
create or replace function public.content_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mode text := coalesce(current_setting('linguo.content_import', true), '');
  -- Review/publication state and trigger-maintained columns; every other column is content.
  v_non_content constant text[] := array[
    'status', 'is_demo', 'reviewed_by', 'reviewed_at', 'updated_at', 'published_at', 'content_version'
  ];
begin
  if old.status = new.status then
    if new.status <> 'published'
       or (old.is_demo and new.is_demo)
       or (new.version > old.version and new.reviewed_at is distinct from old.reviewed_at)
       or v_mode = 'reorder'
       or (to_jsonb(new) - v_non_content) = (to_jsonb(old) - v_non_content) then
      return new;
    end if;
  elsif (old.status = 'draft' and new.status = 'in_review')
     or (old.status = 'in_review' and new.status in ('draft', 'approved'))
     or (old.status = 'approved' and new.status in ('published', 'draft'))
     or (old.status = 'published' and new.status = 'archived')
     or (old.status = 'archived' and new.status = 'draft')
     or (new.status = 'archived' and v_mode = 'archive')
     or (v_mode = 'admin' and old.status in ('approved', 'published') and new.status = 'in_review') then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'invalid_status_transition';
end;
$$;

revoke all on function public.content_status_transition() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_private helpers
-- ---------------------------------------------------------------------------

-- STAFF_ROLE_RANK.
create or replace function admin_private.role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'editor' then 1 when 'reviewer' then 2 when 'admin' then 3 else 0 end;
$$;

-- The caller's role when it is at least p_min; otherwise not_authenticated / staff_forbidden.
create or replace function admin_private.require_role(p_min text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select s.role into v_role from public.staff_roles s where s.user_id = v_uid;
  if v_role is null or admin_private.role_rank(v_role) < admin_private.role_rank(p_min) then
    raise exception using errcode = 'P0001', message = 'staff_forbidden';
  end if;
  return v_role;
end;
$$;

create or replace function admin_private.audit(p_action text, p_target_kind text, p_target_id text, p_detail jsonb)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.admin_audit_log (actor, actor_role, action, target_kind, target_id, detail)
  values (
    auth.uid(),
    (select s.role from public.staff_roles s where s.user_id = auth.uid()),
    p_action, p_target_kind, p_target_id, coalesce(p_detail, '{}'::jsonb)
  );
$$;

-- ADMIN_CONTENT_KINDS → table name, or null.
create or replace function admin_private.kind_table(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'program' then 'programs' when 'unit' then 'units' when 'lesson' then 'lessons'
    when 'learning_item' then 'learning_items' when 'exercise' then 'exercises'
    when 'assessment_item' then 'assessment_items' when 'exam_form' then 'exam_forms'
    when 'exam_question' then 'exam_questions'
  end;
$$;

-- Unresolved = open or triaged.
create or replace function admin_private.is_unresolved(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('open', 'triaged');
$$;

-- One row per content row of every kind, with a short label (≤ 120) and its language.
create view admin_private.content_index as
  select 'program'::text as kind, p.id, p.key, left(coalesce(p.title ->> 'vi', p.key), 120) as label, p.language_code,
    p.status, p.is_demo, p.version, p.updated_at, p.reviewed_at
  from public.programs p
  union all
  select 'unit', u.id, u.key, left(coalesce(u.title ->> 'vi', u.key), 120), p.language_code,
    u.status, u.is_demo, u.version, u.updated_at, u.reviewed_at
  from public.units u join public.programs p on p.id = u.program_id
  union all
  select 'lesson', l.id, l.key, left(coalesce(l.title ->> 'vi', l.key), 120), l.language_code,
    l.status, l.is_demo, l.version, l.updated_at, l.reviewed_at
  from public.lessons l
  union all
  select 'learning_item', i.id, i.key, left(coalesce(i.front ->> 'text', i.key), 120), i.language_code,
    i.status, i.is_demo, i.version, i.updated_at, i.reviewed_at
  from public.learning_items i
  union all
  select 'exercise', e.id, e.key,
    left(coalesce(e.prompt ->> 'stem', e.prompt ->> 'template', e.prompt ->> 'instruction', e.prompt ->> 'source_text',
                  e.prompt ->> 'fallback_text', e.key), 120),
    l.language_code, e.status, e.is_demo, e.version, e.updated_at, e.reviewed_at
  from public.exercises e join public.lessons l on l.id = e.lesson_id
  union all
  select 'assessment_item', a.id, a.key, left(coalesce(a.prompt ->> 'stem', a.key), 120), a.language_code,
    a.status, a.is_demo, a.version, a.updated_at, a.reviewed_at
  from public.assessment_items a
  union all
  select 'exam_form', f.id, f.key, left(f.title_vi, 120), f.language_code,
    f.status, f.is_demo, f.version, f.updated_at, f.reviewed_at
  from public.exam_forms f
  union all
  -- Questions have no review fields of their own: they follow their form.
  select 'exam_question', q.id, q.key, left(coalesce(nullif(q.prompt ->> 'stem', ''), q.prompt ->> 'instruction_vi', q.key), 120),
    f.language_code, q.status, f.is_demo, null::integer, q.updated_at, f.reviewed_at
  from public.exam_questions q join public.exam_forms f on f.id = q.form_id;

revoke all on admin_private.content_index from public, anon, authenticated;

-- Answer key / explanation / script of a row, or null when the kind has none.
create or replace function admin_private.answer_detail(p_kind text, p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'exercise' then (
      select jsonb_build_object(
        'version', k.version, 'answer_key', k.answer_key, 'rubric', k.rubric, 'known_wrong', k.known_wrong,
        'explanation', k.explanation, 'display_answer', k.display_answer)
      from content_private.exercise_keys k
      join public.exercises e on e.id = k.exercise_id
      where k.exercise_id = p_id
      order by (k.version = e.version) desc, k.version desc
      limit 1)
    when 'assessment_item' then (
      select jsonb_build_object('answer_key', a.answer_key, 'explanation', a.explanation, 'key_confidence', a.key_confidence)
      from public.assessment_items a where a.id = p_id)
    when 'exam_question' then (
      select jsonb_build_object(
        'answer', k.answer, 'explanation', k.explanation, 'script', k.script, 'rubric', k.rubric,
        'sample_answer', k.sample_answer)
      from content_private.exam_keys k where k.question_id = p_id)
  end;
$$;

-- Imported versions of a row (newest first). Only the lesson-bundle kinds keep revisions.
create or replace function admin_private.revision_list(p_kind text, p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'version', r.version, 'content_hash', r.content_hash, 'created_at', r.imported_at,
      'detail', jsonb_build_object('git_sha', r.git_sha, 'snapshot', r.snapshot))
    order by r.version desc), '[]'::jsonb)
  from content_private.revisions r
  where r.entity_id = p_id
    and r.entity_type = case p_kind
      when 'program' then 'programs' when 'unit' then 'units' when 'lesson' then 'lessons'
      when 'learning_item' then 'learning_items' when 'exercise' then 'exercises' end;
$$;

-- "01-" style prefix of the content/ directory and file names (scripts/content/load.mjs layout).
create or replace function admin_private.order_prefix(p_order integer, p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_order between 0 and 9 then '0' || p_order::text else p_order::text end
    || '-' || split_part(p_key, ':', 3);
$$;

-- YAML file under content/ that defines a row, derived from keys and order_index following the repo layout
-- (content/README.md): <lang>/programs/<program>/program.yaml, …/units/<NN>-<unit>/unit.yaml,
-- …/lessons/<NN>-<lesson>.yaml (exercises live in their lesson file), <lang>/items/<unit>.yaml (items file of
-- the unit that introduces the item), diagnostic/<lang>/<skill>.yaml, exams/<lang>/<form>.yaml (questions live
-- in their form file). Null when it cannot be derived.
create or replace function admin_private.repo_path(p_kind text, p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_lang text;
  v_prog_key text;
  v_unit_key text;
  v_unit_order integer;
  v_lesson_key text;
  v_lesson_order integer;
  v_lesson uuid;
  v_form uuid;
  v_skill text;
begin
  if p_kind = 'program' then
    select p.language_code, p.key into v_lang, v_prog_key from public.programs p where p.id = p_id;
    return 'content/' || v_lang || '/programs/' || split_part(v_prog_key, ':', 3) || '/program.yaml';
  elsif p_kind = 'unit' then
    select p.language_code, p.key, u.key, u.order_index into v_lang, v_prog_key, v_unit_key, v_unit_order
    from public.units u join public.programs p on p.id = u.program_id where u.id = p_id;
    return 'content/' || v_lang || '/programs/' || split_part(v_prog_key, ':', 3) || '/units/'
      || admin_private.order_prefix(v_unit_order, v_unit_key) || '/unit.yaml';
  elsif p_kind in ('lesson', 'exercise') then
    v_lesson := case when p_kind = 'lesson' then p_id else (select e.lesson_id from public.exercises e where e.id = p_id) end;
    select p.language_code, p.key, u.key, u.order_index, l.key, l.order_index
      into v_lang, v_prog_key, v_unit_key, v_unit_order, v_lesson_key, v_lesson_order
    from public.lessons l join public.units u on u.id = l.unit_id join public.programs p on p.id = u.program_id
    where l.id = v_lesson;
    return 'content/' || v_lang || '/programs/' || split_part(v_prog_key, ':', 3) || '/units/'
      || admin_private.order_prefix(v_unit_order, v_unit_key) || '/lessons/'
      || admin_private.order_prefix(v_lesson_order, v_lesson_key) || '.yaml';
  elsif p_kind = 'learning_item' then
    select i.language_code, u.key into v_lang, v_unit_key
    from public.learning_items i
    join public.lesson_items li on li.item_id = i.id and li.role = 'introduce'
    join public.lessons l on l.id = li.lesson_id
    join public.units u on u.id = l.unit_id
    where i.id = p_id
    limit 1;
    return 'content/' || v_lang || '/items/' || split_part(v_unit_key, ':', 3) || '.yaml';
  elsif p_kind = 'assessment_item' then
    select a.language_code, a.skill into v_lang, v_skill from public.assessment_items a where a.id = p_id;
    return 'content/diagnostic/' || v_lang || '/' || v_skill || '.yaml';
  elsif p_kind in ('exam_form', 'exam_question') then
    v_form := case when p_kind = 'exam_form' then p_id else (select q.form_id from public.exam_questions q where q.id = p_id) end;
    select f.language_code, f.key into v_lang, v_prog_key from public.exam_forms f where f.id = v_form;
    return 'content/exams/' || v_lang || '/' || split_part(v_prog_key, ':', 3) || '.yaml';
  end if;
  return null;
end;
$$;

-- Days → validated range (ADMIN_ANALYTICS_RANGES).
create or replace function admin_private.check_range(p_days integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_days is null or p_days not in (7, 28, 90) then
    raise exception using errcode = 'P0001', message = 'invalid_range';
  end if;
  return p_days;
end;
$$;

revoke all on all functions in schema admin_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- staff_role / admin_grant_role
-- ---------------------------------------------------------------------------

-- The caller's role ('editor' | 'reviewer' | 'admin'), or null (also when not signed in).
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff_roles s where s.user_id = auth.uid();
$$;

-- Admin only. p_role null removes the user's role. Returns {user_id, role}.
create or replace function public.admin_grant_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  perform admin_private.require_role('admin');
  if p_role is not null and p_role not in ('editor', 'reviewer', 'admin') then
    raise exception using errcode = 'P0001', message = 'invalid_role';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'user_not_found';
  end if;

  select s.role into v_previous from public.staff_roles s where s.user_id = p_user_id for update;
  if p_role is null then
    delete from public.staff_roles s where s.user_id = p_user_id;
  else
    insert into public.staff_roles (user_id, role, granted_by, granted_at)
    values (p_user_id, p_role, auth.uid(), now())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = excluded.granted_at;
  end if;

  perform admin_private.audit(case when p_role is null then 'revoke_role' else 'grant_role' end, 'user', p_user_id::text,
    jsonb_build_object('role', p_role, 'previous_role', v_previous));
  return jsonb_build_object('user_id', p_user_id, 'role', p_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPCs (editor+)
-- ---------------------------------------------------------------------------

-- adminOverviewSchema. Archived rows are counted in `counts` but not in demo_count. Open reports = open or triaged.
create or replace function public.admin_content_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform admin_private.require_role('editor');
  return jsonb_build_object(
    'counts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'language_code', c.language_code, 'status', c.status, 'count', c.n)
        order by c.kind, c.language_code, c.status)
      from (
        select x.kind, x.language_code, x.status, count(*)::integer as n
        from admin_private.content_index x
        group by x.kind, x.language_code, x.status
      ) c
    ), '[]'::jsonb),
    'demo_count', (select count(*)::integer from admin_private.content_index x where x.is_demo and x.status <> 'archived'),
    'unreviewed_published_count', (
      select count(*)::integer from admin_private.content_index x
      where x.status in ('approved', 'published') and x.reviewed_at is null),
    'open_report_count', (select count(*)::integer from public.content_reports r where admin_private.is_unresolved(r.status))
  );
end;
$$;

-- adminContentListSchema. p_kind null = every kind. p_search matches key or label (case-insensitive substring).
-- Ordered by kind then key; p_limit 1..200 (default 50), p_offset ≥ 0.
create or replace function public.admin_list_content(
  p_kind text default null,
  p_language text default null,
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_pattern text;
  v_result jsonb;
begin
  perform admin_private.require_role('editor');
  if p_kind is not null and admin_private.kind_table(p_kind) is null then
    raise exception using errcode = 'P0001', message = 'invalid_kind';
  end if;
  if nullif(btrim(p_search), '') is not null then
    v_pattern := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with f as (
    select x.*
    from admin_private.content_index x
    where (p_kind is null or x.kind = p_kind)
      and (p_language is null or x.language_code = p_language)
      and (p_status is null or x.status = p_status)
      and (v_pattern is null or x.key ilike v_pattern or x.label ilike v_pattern)
  ), page as (
    select f.* from f order by f.kind, f.key, f.id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'kind', p.kind, 'key', p.key, 'label', p.label, 'language_code', p.language_code,
          'status', p.status, 'is_demo', p.is_demo, 'version', p.version, 'updated_at', p.updated_at,
          'open_reports', (
            select count(*)::integer from public.content_reports r
            where r.target_kind = p.kind and r.target_id = p.id and admin_private.is_unresolved(r.status)))
        order by p.kind, p.key, p.id)
      from page p
    ), '[]'::jsonb),
    'total', (select count(*)::integer from f)
  ) into v_result;
  return v_result;
end;
$$;

-- adminContentDetailSchema: the stored row, its answer key / explanation / script, source, revisions and the
-- YAML file to edit. reviewed_by is returned only when it is a user id (set by admin_set_status); a reviewer
-- name written in the YAML stays visible in row.reviewed_by.
create or replace function public.admin_get_content(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table text := admin_private.kind_table(p_kind);
  v_row jsonb;
  v_source uuid;
  v_reviewed_by text;
begin
  perform admin_private.require_role('editor');
  if v_table is null then
    raise exception using errcode = 'P0001', message = 'invalid_kind';
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_row using p_id;
  if v_row is null then
    raise exception using errcode = 'P0001', message = 'content_not_found';
  end if;

  v_source := case
    when p_kind = 'exam_question' then (select f.source_id from public.exam_forms f where f.id = (v_row ->> 'form_id')::uuid)
    else (v_row ->> 'source_id')::uuid end;
  v_reviewed_by := case
    when p_kind = 'exam_question' then (select f.reviewed_by from public.exam_forms f where f.id = (v_row ->> 'form_id')::uuid)
    else v_row ->> 'reviewed_by' end;

  return jsonb_build_object(
    'kind', p_kind,
    'id', p_id,
    'key', v_row ->> 'key',
    'status', v_row ->> 'status',
    'is_demo', (select x.is_demo from admin_private.content_index x where x.kind = p_kind and x.id = p_id),
    'version', (v_row ->> 'version')::integer,
    'reviewed_by', case when v_reviewed_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_reviewed_by end,
    'reviewed_at', (select x.reviewed_at from admin_private.content_index x where x.kind = p_kind and x.id = p_id),
    'row', v_row,
    'private', admin_private.answer_detail(p_kind, p_id),
    'source', (
      select jsonb_build_object(
        'id', s.id, 'key', s.key, 'name', s.title, 'license', s.license,
        'attribution', case when s.attribution_required then s.author_or_org end, 'url', s.url)
      from public.content_sources s where s.id = v_source),
    'revisions', admin_private.revision_list(p_kind, p_id),
    'repo_path', admin_private.repo_path(p_kind, p_id)
  );
end;
$$;

-- adminSourceSchema[]: every source with the number of content rows (any kind, archived excluded) citing it.
-- attribution = author_or_org when the license requires credit, else null.
create or replace function public.admin_list_sources()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform admin_private.require_role('editor');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'name', s.title, 'license', s.license,
        'attribution', case when s.attribution_required then s.author_or_org end, 'url', s.url, 'status', s.status,
        'usage_count', (
          (select count(*) from public.programs t where t.source_id = s.id and t.status <> 'archived')
          + (select count(*) from public.units t where t.source_id = s.id and t.status <> 'archived')
          + (select count(*) from public.lessons t where t.source_id = s.id and t.status <> 'archived')
          + (select count(*) from public.learning_items t where t.source_id = s.id and t.status <> 'archived')
          + (select count(*) from public.exercises t where t.source_id = s.id and t.status <> 'archived')
          + (select count(*) from public.exam_forms t where t.source_id = s.id and t.status <> 'archived'))::integer)
      order by s.key)
    from public.content_sources s
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Review RPC (reviewer+)
-- ---------------------------------------------------------------------------
-- ADMIN_STATUS_TRANSITIONS: draft → in_review; in_review → approved | draft; approved → published | in_review;
-- published → archived | in_review; archived → draft. exam_question (published/archived only, no review
-- fields) allows published → archived alone. Moving to approved or published records the caller in
-- reviewed_by / reviewed_at. Publishing is refused while an unresolved wrong_answer report targets the row (a
-- lesson: also its exercises; an exam form: also its questions), unless an admin passes p_force.
create or replace function public.admin_set_status(
  p_kind text,
  p_id uuid,
  p_status text,
  p_note text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_table text := admin_private.kind_table(p_kind);
  v_old text;
  v_ok boolean;
  v_open integer := 0;
  v_forced boolean := false;
  v_note text := left(nullif(btrim(p_note), ''), 500);
begin
  v_role := admin_private.require_role('reviewer');
  if v_table is null then
    raise exception using errcode = 'P0001', message = 'invalid_kind';
  end if;
  execute format('select t.status from public.%I t where t.id = $1 for update', v_table) into v_old using p_id;
  if v_old is null then
    raise exception using errcode = 'P0001', message = 'content_not_found';
  end if;

  if p_kind = 'exam_question' then
    v_ok := v_old = 'published' and p_status = 'archived';
  else
    v_ok := (v_old, p_status) in (
      ('draft', 'in_review'), ('in_review', 'approved'), ('in_review', 'draft'), ('approved', 'published'),
      ('approved', 'in_review'), ('published', 'archived'), ('published', 'in_review'), ('archived', 'draft'));
  end if;
  if not coalesce(v_ok, false) then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;

  if p_status = 'published' then
    select count(*)::integer into v_open
    from public.content_reports r
    where r.reason = 'wrong_answer' and admin_private.is_unresolved(r.status)
      and ((r.target_kind = p_kind and r.target_id = p_id)
        or (p_kind = 'lesson' and r.target_kind = 'exercise'
            and r.target_id in (select e.id from public.exercises e where e.lesson_id = p_id))
        or (p_kind = 'exam_form' and r.target_kind = 'exam_question'
            and r.target_id in (select q.id from public.exam_questions q where q.form_id = p_id)));
    if v_open > 0 then
      if coalesce(p_force, false) and v_role = 'admin' then
        v_forced := true;
      else
        raise exception using errcode = 'P0001', message = 'open_wrong_answer_reports';
      end if;
    end if;
  end if;

  perform set_config('linguo.content_import', 'admin', true);
  if p_status in ('approved', 'published') then
    execute format('update public.%I set status = $1, reviewed_by = $2, reviewed_at = now() where id = $3', v_table)
      using p_status, auth.uid()::text, p_id;
  else
    execute format('update public.%I set status = $1 where id = $2', v_table) using p_status, p_id;
  end if;
  perform set_config('linguo.content_import', '', true);

  perform admin_private.audit('set_status', p_kind, p_id::text, jsonb_build_object(
    'from', v_old, 'to', p_status, 'note', v_note, 'forced', v_forced, 'open_wrong_answer_reports', v_open));
  return jsonb_build_object('status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Report RPCs (editor+)
-- ---------------------------------------------------------------------------

-- adminReportListSchema: reports grouped by target, most reported first. p_status / p_kind null = any.
-- Each group lists its (filtered) reports newest first, at most 100; reporters are never included.
create or replace function public.admin_list_reports(
  p_status text default null,
  p_kind text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform admin_private.require_role('editor');
  if p_status is not null and p_status not in ('open', 'triaged', 'fixed', 'rejected', 'duplicate') then
    raise exception using errcode = 'P0001', message = 'invalid_report_status';
  end if;
  if p_kind is not null and p_kind not in ('exercise', 'learning_item', 'lesson', 'assessment_item', 'exam_question') then
    raise exception using errcode = 'P0001', message = 'invalid_kind';
  end if;

  with f as (
    select r.* from public.content_reports r
    where (p_status is null or r.status = p_status) and (p_kind is null or r.target_kind = p_kind)
  ), g as (
    select f.target_kind, f.target_id, count(*)::integer as n, max(f.created_at) as latest_at
    from f group by f.target_kind, f.target_id
  ), page as (
    select g.* from g order by g.n desc, g.latest_at desc, g.target_id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
          'target_kind', p.target_kind,
          'target_id', p.target_id,
          'target_label', public.content_target_label(p.target_kind, p.target_id, 120),
          'report_count', p.n,
          'reasons', (
            select jsonb_object_agg(x.reason, x.c)
            from (select f.reason, count(*)::integer as c from f
                  where f.target_kind = p.target_kind and f.target_id = p.target_id group by f.reason) x),
          'latest_at', p.latest_at,
          'reports', (
            select jsonb_agg(jsonb_build_object(
                'id', y.id, 'reason', y.reason, 'note', y.note, 'status', y.status,
                'content_version', y.content_version, 'created_at', y.created_at)
              order by y.created_at desc, y.id)
            from (select f.* from f where f.target_kind = p.target_kind and f.target_id = p.target_id
                  order by f.created_at desc, f.id limit 100) y))
        order by p.n desc, p.latest_at desc, p.target_id)
      from page p
    ), '[]'::jsonb),
    'total_groups', (select count(*)::integer from g)
  ) into v_result;
  return v_result;
end;
$$;

-- Sets the status of the given reports (triaged | fixed | rejected | duplicate) with an optional note (≤ 500).
-- fixed / rejected / duplicate record resolved_by / resolved_at; triaged clears them. Returns {updated}.
create or replace function public.admin_resolve_report(p_report_ids uuid[], p_status text, p_resolution_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(p_resolution_note), '');
  v_final boolean := p_status in ('fixed', 'rejected', 'duplicate');
  v_ids uuid[];
begin
  perform admin_private.require_role('editor');
  if p_status is null or p_status not in ('triaged', 'fixed', 'rejected', 'duplicate') then
    raise exception using errcode = 'P0001', message = 'invalid_report_status';
  end if;
  if char_length(v_note) > 500 then
    raise exception using errcode = 'P0001', message = 'note_too_long';
  end if;

  with u as (
    update public.content_reports r set
      status = p_status,
      resolution_note = v_note,
      resolved_by = case when v_final then auth.uid() end,
      resolved_at = case when v_final then now() end
    where r.id = any (coalesce(p_report_ids, '{}'::uuid[]))
    returning r.id
  )
  select coalesce(array_agg(u.id order by u.id), '{}'::uuid[]) into v_ids from u;

  if cardinality(v_ids) > 0 then
    perform admin_private.audit('resolve_reports', 'content_report', null, jsonb_build_object(
      'report_ids', to_jsonb(v_ids), 'status', p_status, 'note', v_note, 'updated', cardinality(v_ids)));
  end if;
  return jsonb_build_object('updated', cardinality(v_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Statistics (admin): aggregates only
-- ---------------------------------------------------------------------------
-- adminAnalyticsSchema. Days are Asia/Ho_Chi_Minh calendar days; the window is the last p_days days
-- including today. A user is active on a day with an activity_days row or an analytics event.
--   daily: dau, lessons completed (lesson_runs), review sessions (review_session_completed events),
--          exam attempts started.
--   wau: active users in the last 7 days. onboarding_completed: users whose first learning path was created
--   in the window. funnel: users who signed up in the window → onboarded (a path) → ≥ 1 / ≥ 3 completed
--   lessons → active again on or after their 7th day.
create or replace function public.admin_analytics(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_days integer;
  v_today date;
  v_from date;
  v_from_ts timestamptz;
  v_result jsonb;
begin
  perform admin_private.require_role('admin');
  v_days := admin_private.check_range(p_days);
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - (v_days - 1);
  v_from_ts := v_from::timestamp at time zone v_tz;

  with active as (
    select a.user_id, a.local_day as day from public.activity_days a where a.local_day >= v_from
    union
    select e.user_id, (e.created_at at time zone v_tz)::date from public.analytics_events e where e.created_at >= v_from_ts
  ), cohort as (
    select u.id, (u.created_at at time zone v_tz)::date as signup_day
    from auth.users u where u.created_at >= v_from_ts
  ), cohort_stats as (
    select c.id,
      exists (select 1 from public.learning_paths lp where lp.user_id = c.id) as onboarded,
      (select count(*) from public.lesson_runs r where r.user_id = c.id and r.status = 'completed') as lessons,
      exists (select 1 from active a where a.user_id = c.id and a.day >= c.signup_day + 7) as returned
    from cohort c
  )
  select jsonb_build_object(
    'days', v_days,
    'daily', (
      select jsonb_agg(jsonb_build_object(
          'day', to_char(d.day, 'YYYY-MM-DD'),
          'dau', (select count(distinct a.user_id)::integer from active a where a.day = d.day),
          'lessons_completed', (
            select count(*)::integer from public.lesson_runs r
            where r.status = 'completed' and (r.completed_at at time zone v_tz)::date = d.day),
          'review_sessions', (
            select count(*)::integer from public.analytics_events e
            where e.name = 'review_session_completed' and (e.created_at at time zone v_tz)::date = d.day),
          'exam_attempts', (
            select count(*)::integer from public.exam_attempts x where (x.started_at at time zone v_tz)::date = d.day))
        order by d.day)
      from (select gs::date as day from generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') gs) d
    ),
    'wau', (select count(distinct a.user_id)::integer from active a where a.day > v_today - 7),
    'onboarding_completed', (
      select count(*)::integer from (
        select lp.user_id from public.learning_paths lp group by lp.user_id having min(lp.created_at) >= v_from_ts) o),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*)::integer from cohort_stats),
      'onboarded', (select count(*)::integer from cohort_stats s where s.onboarded),
      'first_lesson', (select count(*)::integer from cohort_stats s where s.lessons >= 1),
      'third_lesson', (select count(*)::integer from cohort_stats s where s.lessons >= 3),
      'returned_day7', (select count(*)::integer from cohort_stats s where s.returned))
  ) into v_result;
  return v_result;
end;
$$;

-- adminAiUsageSchema over the last p_days days (7 | 28 | 90): requests by task × status, share served from the
-- cache, latency percentiles (ms, every request) and learner AI reports by reason.
create or replace function public.admin_ai_usage(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_since timestamptz;
  v_result jsonb;
begin
  perform admin_private.require_role('admin');
  v_days := admin_private.check_range(p_days);
  v_since := now() - make_interval(days => v_days);

  with u as (select * from public.ai_usage x where x.created_at >= v_since)
  select jsonb_build_object(
    'days', v_days,
    'by_task', coalesce((
      select jsonb_agg(jsonb_build_object('task', t.task, 'status', t.status, 'count', t.n) order by t.task, t.status)
      from (select u.task, u.status, count(*)::integer as n from u group by u.task, u.status) t
    ), '[]'::jsonb),
    'cache_hit_rate', (select round(avg(case when u.cached then 1.0 else 0.0 end), 4) from u),
    'latency_p50_ms', (select round(percentile_cont(0.5) within group (order by u.latency_ms)::numeric, 1) from u),
    'latency_p95_ms', (select round(percentile_cont(0.95) within group (order by u.latency_ms)::numeric, 1) from u),
    'reports_by_reason', coalesce((
      select jsonb_object_agg(r.reason, r.n)
      from (select x.reason, count(*)::integer as n from public.ai_reports x where x.created_at >= v_since group by x.reason) r
    ), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- adminAuditEntrySchema[], newest first, at most p_limit (1..500, default 100).
create or replace function public.admin_audit_log_recent(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform admin_private.require_role('admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', l.id, 'actor', l.actor, 'actor_role', l.actor_role, 'action', l.action, 'target_kind', l.target_kind,
        'target_id', l.target_id, 'detail', l.detail, 'created_at', l.created_at)
      order by l.created_at desc, l.id)
    from (
      select * from public.admin_audit_log a
      order by a.created_at desc, a.id
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) l
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: the RPCs are for signed-in users (the role check is inside); never anon.
-- ---------------------------------------------------------------------------
revoke all on function public.staff_role() from public, anon;
revoke all on function public.admin_grant_role(uuid, text) from public, anon;
revoke all on function public.admin_content_overview() from public, anon;
revoke all on function public.admin_list_content(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_get_content(text, uuid) from public, anon;
revoke all on function public.admin_list_sources() from public, anon;
revoke all on function public.admin_set_status(text, uuid, text, text, boolean) from public, anon;
revoke all on function public.admin_list_reports(text, text, integer, integer) from public, anon;
revoke all on function public.admin_resolve_report(uuid[], text, text) from public, anon;
revoke all on function public.admin_analytics(integer) from public, anon;
revoke all on function public.admin_ai_usage(integer) from public, anon;
revoke all on function public.admin_audit_log_recent(integer) from public, anon;

grant execute on function public.staff_role() to authenticated;
grant execute on function public.admin_grant_role(uuid, text) to authenticated;
grant execute on function public.admin_content_overview() to authenticated;
grant execute on function public.admin_list_content(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_content(text, uuid) to authenticated;
grant execute on function public.admin_list_sources() to authenticated;
grant execute on function public.admin_set_status(text, uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_list_reports(text, text, integer, integer) to authenticated;
grant execute on function public.admin_resolve_report(uuid[], text, text) to authenticated;
grant execute on function public.admin_analytics(integer) to authenticated;
grant execute on function public.admin_ai_usage(integer) to authenticated;
grant execute on function public.admin_audit_log_recent(integer) to authenticated;
