-- Teacher tools, second pass (PRD P2 "Công cụ giáo viên"). Builds on 20261017000400_teacher_tools.sql, whose function
-- bodies are the starting point of every function recreated here (teacher_create_class already accepts de since
-- 20261018210000_german.sql and is not touched). Mirrors packages/shared/src/teacher (contract.ts, limits.ts);
-- supabase/tests/teacher.test.sql and teacher_assignments.test.sql cover this file.
--
-- What changes
--   exam assignments carry the mode: assignments.exam_mode ('full' | 'section') and exam_section ('listening' |
--     'reading' | 'writing'), both optional. Without a mode the learner picks one, as before. A section must have
--     published questions in that form. (question_type drills span forms and are never an assignment.)
--   assignments can be edited and closed: teacher_update_assignment changes the due date and the note and closes or
--     reopens the assignment (closed_at). A closed assignment stops asking for work: learners see it as 'closed' (not
--     pending, not overdue) and work done after closed_at no longer counts; reopening counts it again.
--   completion is computed set-based by teacher_completions (one pass for the whole class instead of one subquery per
--     member and assignment, which took seconds for a 200-member class with 300 assignments). It is the single source
--     of the rules; teacher_assignment_done_at is now a thin wrapper kept for the learner helpers and the tests.
--     An exam counts when a full / section attempt of that form (and of the assigned mode / section) is submitted, or
--     expired with at least one saved answer: an attempt that was merely superseded by starting another no longer
--     completes the assignment, and question_type drills never do.
--   learner_list_assignments gains state 'closed'; learner_class_json.pending_count ignores closed assignments.
--
-- Errors: adds invalid_exam_mode (P0001) to TEACHER_ERROR_CODES.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column exam_mode text check (exam_mode in ('full', 'section')),
  add column exam_section text check (exam_section in ('listening', 'reading', 'writing')),
  add column closed_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table public.assignments add constraint assignments_exam_mode_shape check (
  (exam_mode is null and exam_section is null)
  or (kind = 'exam' and ((exam_mode = 'full' and exam_section is null) or (exam_mode = 'section' and exam_section is not null))));

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Completion: one pass for a class (or one member of it)
-- ---------------------------------------------------------------------------

-- (assignment, member, when the member completed it) for every completed pair of class p_class_id; p_user restricts
-- the members to one user. Only work at or after the assignment's creation counts, and not after it was closed.
create or replace function public.teacher_completions(p_class_id uuid, p_user uuid default null)
returns table (assignment_id uuid, user_id uuid, done_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with c as (
    select cl.language_code from public.classes cl where cl.id = p_class_id
  ), a as (
    select x.* from public.assignments x where x.class_id = p_class_id
  ), m as (
    select mm.user_id from public.class_members mm
    where mm.class_id = p_class_id and (p_user is null or mm.user_id = p_user)
  )
  select a.id, r.user_id, min(r.completed_at)
  from a
  cross join m
  join public.lesson_runs r on r.user_id = m.user_id and r.lesson_id = a.lesson_id
  where a.kind = 'lesson' and r.status = 'completed' and r.completed_at >= a.created_at
    and (a.closed_at is null or r.completed_at <= a.closed_at)
  group by a.id, r.user_id
  union all
  select a.id, e.user_id, min(e.submitted_at)
  from a
  cross join m
  join public.exam_attempts e on e.user_id = m.user_id and e.form_id = a.exam_form_id
  where a.kind = 'exam' and e.status in ('submitted', 'expired') and e.submitted_at >= a.created_at
    and (a.closed_at is null or e.submitted_at <= a.closed_at)
    and e.mode in ('full', 'section')
    and (a.exam_mode is null or e.mode = a.exam_mode)
    and (a.exam_section is null or e.section = a.exam_section)
    and (e.status = 'submitted' or exists (
      select 1 from public.exam_answers x where x.attempt_id = e.id and x.answer is not null))
  group by a.id, e.user_id
  union all
  select a.id, m.user_id, x.created_at
  from a
  cross join m
  cross join c
  cross join lateral (
    select l.created_at
    from public.review_logs l
    join public.learning_paths lp on lp.id = l.learning_path_id
    where l.user_id = m.user_id and l.kind = 'grade' and l.created_at >= a.created_at and lp.language_code = c.language_code
    order by l.created_at, l.id
    offset a.target_count - 1 limit 1
  ) x
  where a.kind = 'review' and (a.closed_at is null or x.created_at <= a.closed_at);
$$;

-- When p_user completed assignment p_a (null = not yet). p_language is unused: the class language is read from the
-- class (the argument stays so that existing callers and tests keep working).
create or replace function public.teacher_assignment_done_at(p_a public.assignments, p_language text, p_user uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select t.done_at from public.teacher_completions(p_a.class_id, p_user) t where t.assignment_id = p_a.id;
$$;

-- teacherAssignmentSchema without the per-class counts.
create or replace function public.teacher_assignment_json(p_a public.assignments)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_a.id, 'class_id', p_a.class_id, 'kind', p_a.kind,
    'ref_id', coalesce(p_a.lesson_id, p_a.exam_form_id), 'title', public.teacher_assignment_title(p_a),
    'target_count', p_a.target_count, 'exam_mode', p_a.exam_mode, 'exam_section', p_a.exam_section,
    'due_at', p_a.due_at, 'closed_at', p_a.closed_at, 'note', p_a.note, 'created_at', p_a.created_at);
$$;

-- Aggregates a teacher may see about one member (teacherRosterMemberSchema minus identity fields). p_done / p_total
-- are the member's completed and total assignments, computed once for the whole class by the caller.
create or replace function public.teacher_member_stats(p_user uuid, p_class public.classes, p_done integer, p_total integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_path uuid := public.teacher_member_path(p_user, p_class.language_code);
  v_today date := public.learning_user_today(p_user);
  v_now timestamptz := now();
  v_streak record;
  v_current integer := 0;
  v_best integer := 0;
  v_min7 bigint := 0;
  v_min30 bigint := 0;
  v_last date;
  v_lessons integer := 0;
  v_lessons7 integer := 0;
  v_due integer := 0;
  v_rev integer := 0;
  v_rev_ok integer := 0;
begin
  if v_path is not null then
    select s.* into v_streak from public.progress_streak(p_user, v_path) as s;
    v_current := v_streak.current;
    v_best := v_streak.best;
    select coalesce(sum(a.active_ms) filter (where a.local_day >= v_today - 6), 0),
           coalesce(sum(a.active_ms) filter (where a.local_day >= v_today - 29), 0),
           max(a.local_day) filter (where a.active_ms > 0 or a.lessons > 0 or a.reviews > 0 or a.answers > 0)
      into v_min7, v_min30, v_last
    from public.activity_days a
    where a.user_id = p_user and a.learning_path_id = v_path and a.local_day <= v_today;
    select count(distinct r.lesson_id)::integer,
           (count(distinct r.lesson_id) filter (where r.completed_at >= v_now - interval '7 days'))::integer
      into v_lessons, v_lessons7
    from public.lesson_runs r
    where r.user_id = p_user and r.learning_path_id = v_path and r.status = 'completed';
    select count(*)::integer into v_due
    from public.review_cards c
    where c.user_id = p_user and c.learning_path_id = v_path and c.suspended_at is null
      and c.fsrs_state <> 'new' and c.due_at <= v_now;
    select count(*)::integer, (count(*) filter (where l.rating_effective > 1))::integer into v_rev, v_rev_ok
    from public.review_logs l
    where l.user_id = p_user and l.learning_path_id = v_path and l.kind = 'grade'
      and l.created_at >= v_now - interval '30 days';
  end if;

  return jsonb_build_object(
    'has_path', v_path is not null,
    'streak_current', coalesce(v_current, 0),
    'streak_best', coalesce(v_best, 0),
    'minutes_7d', (v_min7 / 60000)::integer,
    'minutes_30d', (v_min30 / 60000)::integer,
    'last_active_day', v_last,
    'lessons_completed', v_lessons,
    'lessons_completed_7d', v_lessons7,
    'reviews_due', v_due,
    'reviews_30d', v_rev,
    -- Same minimum sample as the progress dashboard (10).
    'review_accuracy_30d', case when v_rev >= 10 then round(v_rev_ok::numeric / v_rev, 4) end,
    'assignments_done', p_done,
    'assignments_total', p_total);
end;
$$;

-- teacherRosterSchema: the class, its current members with aggregates only, and its assignments with completion
-- counts (open ones first, then closed, each by due date). Works on archived classes too.
create or replace function public.teacher_class_roster(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_class public.classes;
  v_result jsonb;
begin
  select c.* into v_class from public.classes c where c.id = p_class_id and c.teacher_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'class_not_found';
  end if;
  with done as materialized (
    select t.assignment_id, t.user_id from public.teacher_completions(v_class.id) t
  ), per_member as (
    select d.user_id, count(*)::integer as n from done d group by d.user_id
  ), per_assignment as (
    select d.assignment_id, count(*)::integer as n from done d group by d.assignment_id
  ), totals as (
    select (select count(*)::integer from public.class_members m where m.class_id = v_class.id) as members,
           (select count(*)::integer from public.assignments a where a.class_id = v_class.id) as assignments
  )
  select jsonb_build_object(
    'class', public.teacher_class_json(v_class),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name, 'joined_at', m.joined_at)
          || public.teacher_member_stats(m.user_id, v_class, coalesce(pm.n, 0), t.assignments)
        order by m.joined_at, m.user_id)
      from public.class_members m
      left join public.profiles p on p.id = m.user_id
      left join per_member pm on pm.user_id = m.user_id
      cross join totals t
      where m.class_id = v_class.id
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(public.teacher_assignment_json(a) || jsonb_build_object(
          'completed_count', coalesce(pa.n, 0), 'member_count', t.members)
        order by (a.closed_at is not null), a.due_at nulls last, a.created_at, a.id)
      from public.assignments a
      left join per_assignment pa on pa.assignment_id = a.id
      cross join totals t
      where a.class_id = v_class.id
    ), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;

drop function public.teacher_member_stats(uuid, public.classes);

-- ---------------------------------------------------------------------------
-- Create (with an optional exam mode) and update
-- ---------------------------------------------------------------------------
drop function public.teacher_create_assignment(uuid, text, uuid, timestamptz, text, integer);

-- teacherAssignmentSchema (completed_count 0). lesson/exam need p_ref_id (published, same language as the class);
-- review needs p_target_count 1..200 and no p_ref_id. p_due_at null or in the next 366 days; p_note up to 500.
-- p_exam_mode / p_exam_section only for exam: null (the learner picks), 'full', or 'section' with a section that has
-- published questions in the form.
create or replace function public.teacher_create_assignment(p_class_id uuid, p_kind text, p_ref_id uuid default null,
  p_due_at timestamptz default null, p_note text default null, p_target_count integer default null,
  p_exam_mode text default null, p_exam_section text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_class public.classes;
  v_note text := public.personal_clean(p_note);
  v_a public.assignments;
begin
  if p_kind is null or p_kind not in ('lesson', 'review', 'exam') then
    raise exception using errcode = 'P0001', message = 'invalid_kind';
  end if;
  v_class := public.teacher_class_for(v_uid, p_class_id, true);
  if p_kind = 'review' then
    if p_ref_id is not null then
      raise exception using errcode = 'P0001', message = 'invalid_ref';
    end if;
    if p_target_count is null or p_target_count not between 1 and 200 then
      raise exception using errcode = 'P0001', message = 'invalid_target';
    end if;
  else
    if p_target_count is not null then
      raise exception using errcode = 'P0001', message = 'invalid_target';
    end if;
    if p_ref_id is null
       or (p_kind = 'lesson' and not exists (
         select 1 from public.lessons l
         where l.id = p_ref_id and l.status = 'published' and l.language_code = v_class.language_code))
       or (p_kind = 'exam' and not exists (
         select 1 from public.exam_forms f
         where f.id = p_ref_id and f.status = 'published' and f.language_code = v_class.language_code)) then
      raise exception using errcode = 'P0001', message = 'invalid_ref';
    end if;
  end if;
  if p_kind <> 'exam' then
    if p_exam_mode is not null or p_exam_section is not null then
      raise exception using errcode = 'P0001', message = 'invalid_exam_mode';
    end if;
  elsif p_exam_mode is null then
    if p_exam_section is not null then
      raise exception using errcode = 'P0001', message = 'invalid_exam_mode';
    end if;
  elsif p_exam_mode = 'full' then
    if p_exam_section is not null then
      raise exception using errcode = 'P0001', message = 'invalid_exam_mode';
    end if;
  elsif p_exam_mode = 'section' then
    if p_exam_section is null or p_exam_section not in ('listening', 'reading', 'writing') or not exists (
      select 1 from public.exam_questions q
      where q.form_id = p_ref_id and q.section = p_exam_section and q.status = 'published') then
      raise exception using errcode = 'P0001', message = 'invalid_exam_mode';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'invalid_exam_mode';
  end if;
  if p_due_at is not null and (p_due_at <= now() or p_due_at > now() + interval '366 days') then
    raise exception using errcode = 'P0001', message = 'invalid_due';
  end if;
  if char_length(v_note) > 500 then
    raise exception using errcode = 'P0001', message = 'note_too_long';
  end if;
  if (select count(*) from public.assignments a where a.class_id = v_class.id) >= 300 then
    raise exception using errcode = 'P0001', message = 'assignment_limit';
  end if;

  insert into public.assignments (class_id, kind, lesson_id, exam_form_id, target_count, due_at, note, exam_mode, exam_section)
  values (v_class.id, p_kind,
    case when p_kind = 'lesson' then p_ref_id end,
    case when p_kind = 'exam' then p_ref_id end,
    case when p_kind = 'review' then p_target_count end,
    p_due_at, v_note, p_exam_mode, p_exam_section)
  returning * into v_a;
  return public.teacher_assignment_json(v_a) || jsonb_build_object(
    'completed_count', 0,
    'member_count', (select count(*)::integer from public.class_members m where m.class_id = v_class.id));
end;
$$;

-- teacherAssignmentSchema of the updated assignment. The note is always replaced (null or blank clears it); the due
-- date only when p_set_due is true (then p_due_at null clears it, otherwise it must be in the next 366 days, as when
-- creating); p_closed true closes (closed_at keeps the first closing time), false reopens. The class must not be
-- archived. The kind, the content and the exam mode cannot change: delete and give a new assignment instead.
create or replace function public.teacher_update_assignment(p_assignment_id uuid, p_note text, p_closed boolean,
  p_due_at timestamptz default null, p_set_due boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_a public.assignments;
  v_class public.classes;
  v_note text := public.personal_clean(p_note);
begin
  select a.* into v_a from public.assignments a
  join public.classes c on c.id = a.class_id
  where a.id = p_assignment_id and c.teacher_id = v_uid
  for update of a;
  if not found then
    raise exception using errcode = 'P0001', message = 'assignment_not_found';
  end if;
  v_class := public.teacher_class_for(v_uid, v_a.class_id, true);
  if char_length(v_note) > 500 then
    raise exception using errcode = 'P0001', message = 'note_too_long';
  end if;
  if coalesce(p_set_due, false) and p_due_at is not null and (p_due_at <= now() or p_due_at > now() + interval '366 days') then
    raise exception using errcode = 'P0001', message = 'invalid_due';
  end if;

  update public.assignments a
  set note = v_note,
      due_at = case when coalesce(p_set_due, false) then p_due_at else a.due_at end,
      closed_at = case when coalesce(p_closed, false) then coalesce(a.closed_at, now()) end
  where a.id = v_a.id
  returning * into v_a;
  return public.teacher_assignment_json(v_a) || jsonb_build_object(
    'completed_count', (select count(*)::integer from public.teacher_completions(v_class.id) t where t.assignment_id = v_a.id),
    'member_count', (select count(*)::integer from public.class_members m where m.class_id = v_class.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Learner side: closed assignments, set-based completion
-- ---------------------------------------------------------------------------

-- learnerClassSchema for one class of the caller. pending_count: open (not closed) assignments not yet done.
create or replace function public.learner_class_json(p_class public.classes, p_user uuid, p_joined_at timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_class.id, 'name', p_class.name, 'language_code', p_class.language_code,
    'teacher_name', (select p.display_name from public.profiles p where p.id = p_class.teacher_id),
    'joined_at', p_joined_at,
    'assignment_count', (select count(*)::integer from public.assignments a where a.class_id = p_class.id),
    'pending_count', (
      select count(*)::integer from public.assignments a
      where a.class_id = p_class.id and a.closed_at is null
        and not exists (select 1 from public.teacher_completions(p_class.id, p_user) t where t.assignment_id = a.id)));
$$;

-- learnerAssignmentListSchema: assignments of the caller's active classes (or of p_class_id, not_member when the
-- caller is not in it) with their state: done, closed (not done and closed by the teacher), overdue or pending.
-- Open ones first (by due date), then closed, then done.
create or replace function public.learner_list_assignments(p_class_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.class_members m join public.classes c on c.id = m.class_id
    where m.class_id = p_class_id and m.user_id = v_uid and c.archived_at is null) then
    raise exception using errcode = 'P0001', message = 'not_member';
  end if;
  return coalesce((
    with my as (
      select c.* from public.class_members m
      join public.classes c on c.id = m.class_id
      where m.user_id = v_uid and c.archived_at is null and (p_class_id is null or c.id = p_class_id)
    ), done as (
      select t.assignment_id, t.done_at from my c cross join lateral public.teacher_completions(c.id, v_uid) t
    )
    select jsonb_agg(public.teacher_assignment_json(x.a) || jsonb_build_object(
        'class_name', x.class_name,
        'state', case when x.done_at is not null then 'done' when (x.a).closed_at is not null then 'closed'
          when (x.a).due_at < v_now then 'overdue' else 'pending' end,
        'completed_at', x.done_at,
        'progress_count', case when (x.a).kind = 'review'
          then least((x.a).target_count, public.teacher_reviews_since(v_uid, x.language_code, (x.a).created_at))
          else case when x.done_at is not null then 1 else 0 end end)
      order by (x.done_at is not null), ((x.a).closed_at is not null), (x.a).due_at nulls last, (x.a).created_at, (x.a).id)
    from (
      select a, c.name as class_name, c.language_code, d.done_at
      from my c
      join public.assignments a on a.class_id = c.id
      left join done d on d.assignment_id = a.id
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.teacher_completions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.teacher_assignment_done_at(public.assignments, text, uuid) from public, anon, authenticated;
revoke all on function public.teacher_assignment_json(public.assignments) from public, anon, authenticated;
revoke all on function public.teacher_member_stats(uuid, public.classes, integer, integer) from public, anon, authenticated;
revoke all on function public.learner_class_json(public.classes, uuid, timestamptz) from public, anon, authenticated;

revoke all on function public.teacher_class_roster(uuid) from public, anon;
revoke all on function public.teacher_create_assignment(uuid, text, uuid, timestamptz, text, integer, text, text) from public, anon;
revoke all on function public.teacher_update_assignment(uuid, text, boolean, timestamptz, boolean) from public, anon;
revoke all on function public.learner_list_assignments(uuid) from public, anon;
grant execute on function public.teacher_class_roster(uuid) to authenticated;
grant execute on function public.teacher_create_assignment(uuid, text, uuid, timestamptz, text, integer, text, text) to authenticated;
grant execute on function public.teacher_update_assignment(uuid, text, boolean, timestamptz, boolean) to authenticated;
grant execute on function public.learner_list_assignments(uuid) to authenticated;
