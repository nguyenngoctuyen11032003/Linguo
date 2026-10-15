-- Linguo PRD P2 "Công cụ giáo viên": minimal teacher tools, data layer only.
-- JSON shapes, error codes and limits mirror packages/shared/src/teacher (contract.ts, limits.ts);
-- supabase/tests/teacher.test.sql covers this file.
--
-- Model
--   teacher_profiles   who may run classes. Granted only by SQL or grant_teacher_role (admin, audited).
--   classes            owned by a teacher; language en | ko | ja; archived classes are hidden from learners and
--                      accept no joins, invites or assignments.
--   class_members      a learner joins only with an invite code (learner_join_class) and leaves at any time
--                      (learner_leave_class); the row is the only thing that makes their progress visible.
--   class_invites      short random codes with an expiry and an optional use cap; revocable.
--   class_join_attempts  rate-limit bookkeeping for learner_join_class (10 per rolling hour, kept one day).
--   assignments        lesson | exam (a published lesson / exam form of the class language) or review (a number of
--                      graded reviews in that language), optional due date and note.
--
-- Privacy
--   Teachers never read learner tables. teacher_class_roster returns, per current member only, aggregates computed
--   here from activity_days, lesson_runs, review_cards, review_logs and exam_attempts: streak, active minutes,
--   lessons completed, reviews due, review accuracy and assignment completion. Never answers, AI conversations,
--   personal vocabulary or email. Leaving a class deletes the membership row, so visibility ends immediately.
--   Direct table reads are limited by RLS: a teacher reads their classes, invites, assignments and members' rows
--   (user id + joined_at); a learner reads their own memberships and the classes and assignments they belong to.
--   Every write goes through the SECURITY DEFINER RPCs below (empty search_path).
--
-- Completion of an assignment counts only work done at or after the assignment was created:
--   lesson: a lesson_run of that lesson completed; exam: an exam_attempt of that form closed (submitted or expired);
--   review: target_count graded review_logs on paths of the class language.
--
-- Errors (TEACHER_ERROR_CODES): 42501 not_authenticated; P0001 teacher_forbidden, staff_forbidden, user_not_found,
-- class_not_found, class_archived, invalid_name, name_taken, invalid_language, class_limit, invite_limit,
-- invite_not_found, invalid_expiry, invalid_max_uses, member_not_found, invalid_kind, invalid_ref, invalid_target,
-- invalid_due, note_too_long, assignment_limit, assignment_not_found, own_class, class_full, join_limit,
-- rate_limited, not_member. An unknown, expired, used-up or revoked code is not an error: learner_join_class returns
-- {"status": "invalid_code"} so that the failed attempt still counts against the rate limit.
--
-- Account data: teacher_profiles, class_members and class_join_attempts join account_optional_tables(); the
-- teacher's own classes (with invites and assignments, without member ids) are a new "teacher_classes" section of
-- export_my_data. Every table cascades from auth.users, so delete_my_account needs no change.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.teacher_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- No foreign key: the granting admin may delete their account later.
  granted_by uuid,
  granted_at timestamptz not null default now()
);

comment on table public.teacher_profiles is 'Users allowed to run classes. Granted by SQL or grant_teacher_role (admin only).';

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  language_code text not null check (language_code in ('en', 'ko', 'ja')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index classes_teacher_name_key on public.classes (teacher_id, lower(name)) where archived_at is null;
create index classes_teacher_idx on public.classes (teacher_id, created_at);

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

create table public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create index class_members_user_idx on public.class_members (user_id);

create table public.class_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  class_id uuid not null references public.classes (id) on delete cascade,
  expires_at timestamptz not null,
  -- null = no cap besides the class member limit.
  max_uses integer check (max_uses between 1 and 500),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint class_invites_uses_cap check (max_uses is null or uses <= max_uses)
);

create index class_invites_class_idx on public.class_invites (class_id, created_at);

create table public.class_join_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index class_join_attempts_user_created_idx on public.class_join_attempts (user_id, created_at desc);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  kind text not null check (kind in ('lesson', 'review', 'exam')),
  lesson_id uuid references public.lessons (id) on delete restrict,
  exam_form_id uuid references public.exam_forms (id) on delete restrict,
  -- Graded reviews to do (review only).
  target_count integer check (target_count between 1 and 200),
  due_at timestamptz,
  note text check (char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint assignments_kind_shape check (
    (kind = 'lesson' and lesson_id is not null and exam_form_id is null and target_count is null)
    or (kind = 'exam' and exam_form_id is not null and lesson_id is null and target_count is null)
    or (kind = 'review' and target_count is not null and lesson_id is null and exam_form_id is null))
);

create index assignments_class_idx on public.assignments (class_id, created_at);
create index assignments_lesson_idx on public.assignments (lesson_id) where lesson_id is not null;
create index assignments_exam_form_idx on public.assignments (exam_form_id) where exam_form_id is not null;

-- ---------------------------------------------------------------------------
-- RLS and privileges: reads only, writes through the RPCs
-- ---------------------------------------------------------------------------

-- The caller's relation to a class: 'teacher', 'member' or null. SECURITY DEFINER so that the policies below do
-- not recurse into each other's RLS.
create or replace function public.class_access(p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = auth.uid()) then 'teacher'
    when exists (select 1 from public.class_members m where m.class_id = p_class_id and m.user_id = auth.uid()) then 'member'
  end;
$$;

alter table public.teacher_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_invites enable row level security;
alter table public.class_join_attempts enable row level security;
alter table public.assignments enable row level security;

create policy "teacher profiles: read own" on public.teacher_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "classes: teacher or member" on public.classes
  for select to authenticated using (teacher_id = (select auth.uid()) or public.class_access(id) = 'member');
create policy "class members: self or class teacher" on public.class_members
  for select to authenticated using (user_id = (select auth.uid()) or public.class_access(class_id) = 'teacher');
create policy "class invites: class teacher" on public.class_invites
  for select to authenticated using (public.class_access(class_id) = 'teacher');
create policy "assignments: teacher or member" on public.assignments
  for select to authenticated using (public.class_access(class_id) is not null);
-- class_join_attempts: no policy, no grant (server-only).

revoke all on public.teacher_profiles, public.classes, public.class_members, public.class_invites,
  public.class_join_attempts, public.assignments from public, anon, authenticated;
grant select on public.teacher_profiles, public.classes, public.class_members, public.class_invites, public.assignments
  to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- The caller, who must be a teacher.
create or replace function public.teacher_require()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not exists (select 1 from public.teacher_profiles t where t.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'teacher_forbidden';
  end if;
  return v_uid;
end;
$$;

-- A class of p_teacher, locked for update; class_not_found otherwise, class_archived when p_active and archived.
create or replace function public.teacher_class_for(p_teacher uuid, p_class_id uuid, p_active boolean)
returns public.classes
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_class public.classes;
begin
  select c.* into v_class from public.classes c where c.id = p_class_id and c.teacher_id = p_teacher for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'class_not_found';
  end if;
  if p_active and v_class.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'class_archived';
  end if;
  return v_class;
end;
$$;

-- 8 characters from an alphabet without 0/O/1/I/L (31 symbols, about 39 bits).
create or replace function public.teacher_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b.bytes, i) % 31) + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) as bytes) b,
    -- Bytes 6 and 8 of a v4 uuid carry version/variant bits; use bytes that are fully random.
    unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i;
$$;

-- Normalised code typed by a learner: upper case, spaces and dashes removed.
create or replace function public.teacher_normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
$$;

-- The learning path a class of p_language looks at: the learner's current path when it has that language, else
-- their most recent non-archived path of that language (null when there is none).
create or replace function public.teacher_member_path(p_user uuid, p_language text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select lp.id
  from public.learning_paths lp
  left join public.profiles p on p.id = lp.user_id
  where lp.user_id = p_user and lp.language_code = p_language and lp.status <> 'archived'
  order by (lp.id = p.current_learning_path_id) desc nulls last, (lp.status = 'active') desc, lp.created_at desc, lp.id
  limit 1;
$$;

-- Graded reviews of p_user on paths of p_language since p_since.
create or replace function public.teacher_reviews_since(p_user uuid, p_language text, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.review_logs l
  join public.learning_paths lp on lp.id = l.learning_path_id
  where l.user_id = p_user and l.kind = 'grade' and l.created_at >= p_since and lp.language_code = p_language;
$$;

-- When p_user completed assignment p_a (null = not yet). Only work at or after the assignment's creation counts.
create or replace function public.teacher_assignment_done_at(p_a public.assignments, p_language text, p_user uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case p_a.kind
    when 'lesson' then (
      select min(r.completed_at) from public.lesson_runs r
      where r.user_id = p_user and r.lesson_id = p_a.lesson_id and r.status = 'completed'
        and r.completed_at >= p_a.created_at)
    when 'exam' then (
      select min(e.submitted_at) from public.exam_attempts e
      where e.user_id = p_user and e.form_id = p_a.exam_form_id and e.status in ('submitted', 'expired')
        and e.submitted_at >= p_a.created_at)
    when 'review' then (
      select x.created_at from (
        select l.created_at
        from public.review_logs l
        join public.learning_paths lp on lp.id = l.learning_path_id
        where l.user_id = p_user and l.kind = 'grade' and l.created_at >= p_a.created_at
          and lp.language_code = p_language
        order by l.created_at, l.id
        offset p_a.target_count - 1 limit 1) x)
  end;
$$;

-- Title of an assignment's lesson or exam form (null for review).
create or replace function public.teacher_assignment_title(p_a public.assignments)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_a.kind
    when 'lesson' then (select l.title ->> 'vi' from public.lessons l where l.id = p_a.lesson_id)
    when 'exam' then (select f.title_vi from public.exam_forms f where f.id = p_a.exam_form_id)
  end;
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
    'target_count', p_a.target_count, 'due_at', p_a.due_at, 'note', p_a.note, 'created_at', p_a.created_at);
$$;

-- Active invites of a class (not revoked, not expired, not used up).
create or replace function public.teacher_active_invites(p_class_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'class_id', i.class_id, 'expires_at', i.expires_at,
      'max_uses', i.max_uses, 'uses', i.uses, 'created_at', i.created_at) order by i.created_at, i.code), '[]'::jsonb)
  from public.class_invites i
  where i.class_id = p_class_id and i.revoked_at is null and i.expires_at > now()
    and (i.max_uses is null or i.uses < i.max_uses);
$$;

-- teacherClassSchema.
create or replace function public.teacher_class_json(p_class public.classes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_class.id, 'name', p_class.name, 'language_code', p_class.language_code,
    'archived_at', p_class.archived_at, 'created_at', p_class.created_at,
    'member_count', (select count(*)::integer from public.class_members m where m.class_id = p_class.id),
    'assignment_count', (select count(*)::integer from public.assignments a where a.class_id = p_class.id),
    'invites', public.teacher_active_invites(p_class.id));
$$;

-- Aggregates a teacher may see about one member (teacherRosterMemberSchema minus identity fields).
create or replace function public.teacher_member_stats(p_user uuid, p_class public.classes)
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
  v_done integer := 0;
  v_total integer := 0;
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

  select count(*)::integer, (count(*) filter (where public.teacher_assignment_done_at(a, p_class.language_code, p_user) is not null))::integer
    into v_total, v_done
  from public.assignments a
  where a.class_id = p_class.id;

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
    'assignments_done', v_done,
    'assignments_total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin / status
-- ---------------------------------------------------------------------------

-- Admin only. p_grant false removes the teacher status (their classes stay, readable again when re-granted).
-- Returns {user_id, is_teacher}.
create or replace function public.grant_teacher_role(p_user_id uuid, p_grant boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_was boolean;
begin
  perform admin_private.require_role('admin');
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'user_not_found';
  end if;
  v_was := exists (select 1 from public.teacher_profiles t where t.user_id = p_user_id);
  if coalesce(p_grant, false) then
    insert into public.teacher_profiles (user_id, granted_by, granted_at)
    values (p_user_id, auth.uid(), now())
    on conflict (user_id) do nothing;
  else
    delete from public.teacher_profiles t where t.user_id = p_user_id;
  end if;
  perform admin_private.audit(case when coalesce(p_grant, false) then 'grant_teacher' else 'revoke_teacher' end,
    'user', p_user_id::text, jsonb_build_object('was_teacher', v_was));
  return jsonb_build_object('user_id', p_user_id, 'is_teacher', coalesce(p_grant, false));
end;
$$;

-- Whether the caller is a teacher (false without a user).
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teacher_profiles t where t.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Teacher RPCs
-- ---------------------------------------------------------------------------

-- teacherClassListSchema: the caller's classes, active first, then archived; newest first.
create or replace function public.teacher_list_classes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
begin
  return coalesce((
    select jsonb_agg(public.teacher_class_json(c) order by (c.archived_at is not null), c.created_at desc, c.id)
    from public.classes c where c.teacher_id = v_uid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.teacher_create_class(p_name text, p_language text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_name text := public.personal_clean(p_name);
  v_class public.classes;
begin
  if v_name is null or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if p_language is null or p_language not in ('en', 'ko', 'ja') then
    raise exception using errcode = 'P0001', message = 'invalid_language';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher_classes:' || v_uid::text, 0));
  if (select count(*) from public.classes c where c.teacher_id = v_uid and c.archived_at is null) >= 30 then
    raise exception using errcode = 'P0001', message = 'class_limit';
  end if;
  begin
    insert into public.classes (teacher_id, name, language_code) values (v_uid, v_name, p_language)
    returning * into v_class;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'name_taken';
  end;
  return public.teacher_class_json(v_class);
end;
$$;

create or replace function public.teacher_rename_class(p_class_id uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_name text := public.personal_clean(p_name);
  v_class public.classes;
begin
  if v_name is null or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  v_class := public.teacher_class_for(v_uid, p_class_id, false);
  begin
    update public.classes c set name = v_name where c.id = v_class.id returning * into v_class;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'name_taken';
  end;
  return public.teacher_class_json(v_class);
end;
$$;

-- p_archived true archives (learners stop seeing the class, joins/invites/assignments stop), false restores.
create or replace function public.teacher_archive_class(p_class_id uuid, p_archived boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_class public.classes;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher_classes:' || v_uid::text, 0));
  v_class := public.teacher_class_for(v_uid, p_class_id, false);
  if coalesce(p_archived, true) then
    if v_class.archived_at is null then
      update public.classes c set archived_at = now() where c.id = v_class.id returning * into v_class;
    end if;
  elsif v_class.archived_at is not null then
    if (select count(*) from public.classes c where c.teacher_id = v_uid and c.archived_at is null) >= 30 then
      raise exception using errcode = 'P0001', message = 'class_limit';
    end if;
    begin
      update public.classes c set archived_at = null where c.id = v_class.id returning * into v_class;
    exception when unique_violation then
      raise exception using errcode = 'P0001', message = 'name_taken';
    end;
  end if;
  return public.teacher_class_json(v_class);
end;
$$;

-- teacherInviteSchema. p_expires_hours 1..720 (default 168 = 7 days); p_max_uses null or 1..500.
create or replace function public.teacher_create_invite(p_class_id uuid, p_expires_hours integer default 168,
  p_max_uses integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_class public.classes;
  v_invite public.class_invites;
  v_try integer := 0;
begin
  if p_expires_hours is null or p_expires_hours not between 1 and 720 then
    raise exception using errcode = 'P0001', message = 'invalid_expiry';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'invalid_max_uses';
  end if;
  v_class := public.teacher_class_for(v_uid, p_class_id, true);
  if jsonb_array_length(public.teacher_active_invites(v_class.id)) >= 10 then
    raise exception using errcode = 'P0001', message = 'invite_limit';
  end if;
  loop
    v_try := v_try + 1;
    begin
      insert into public.class_invites (code, class_id, expires_at, max_uses)
      values (public.teacher_invite_code(), v_class.id, now() + make_interval(hours => p_expires_hours), p_max_uses)
      returning * into v_invite;
      exit;
    exception when unique_violation then
      if v_try >= 5 then
        raise;
      end if;
    end;
  end loop;
  return jsonb_build_object('code', v_invite.code, 'class_id', v_invite.class_id, 'expires_at', v_invite.expires_at,
    'max_uses', v_invite.max_uses, 'uses', v_invite.uses, 'created_at', v_invite.created_at);
end;
$$;

create or replace function public.teacher_revoke_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
begin
  update public.class_invites i set revoked_at = coalesce(i.revoked_at, now())
  from public.classes c
  where i.code = public.teacher_normalize_code(p_code) and c.id = i.class_id and c.teacher_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'invite_not_found';
  end if;
  return jsonb_build_object('revoked', true);
end;
$$;

-- Removes a member (their progress stops being visible at once).
create or replace function public.teacher_remove_member(p_class_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
  v_class public.classes;
begin
  v_class := public.teacher_class_for(v_uid, p_class_id, false);
  delete from public.class_members m where m.class_id = v_class.id and m.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'member_not_found';
  end if;
  return jsonb_build_object('removed', true);
end;
$$;

-- teacherRosterSchema: the class, its current members with aggregates only, and its assignments with completion
-- counts. Works on archived classes too.
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
begin
  select c.* into v_class from public.classes c where c.id = p_class_id and c.teacher_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'class_not_found';
  end if;
  return jsonb_build_object(
    'class', public.teacher_class_json(v_class),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name, 'joined_at', m.joined_at)
          || public.teacher_member_stats(m.user_id, v_class)
        order by m.joined_at, m.user_id)
      from public.class_members m
      left join public.profiles p on p.id = m.user_id
      where m.class_id = v_class.id
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(public.teacher_assignment_json(a) || jsonb_build_object(
          'completed_count', (
            select count(*)::integer from public.class_members m
            where m.class_id = v_class.id
              and public.teacher_assignment_done_at(a, v_class.language_code, m.user_id) is not null),
          'member_count', (select count(*)::integer from public.class_members m where m.class_id = v_class.id))
        order by a.due_at nulls last, a.created_at, a.id)
      from public.assignments a
      where a.class_id = v_class.id
    ), '[]'::jsonb));
end;
$$;

-- teacherAssignmentSchema (completed_count 0). lesson/exam need p_ref_id (published, same language as the class);
-- review needs p_target_count 1..200 and no p_ref_id. p_due_at null or in the next 366 days; p_note up to 500.
create or replace function public.teacher_create_assignment(p_class_id uuid, p_kind text, p_ref_id uuid default null,
  p_due_at timestamptz default null, p_note text default null, p_target_count integer default null)
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
  if p_due_at is not null and (p_due_at <= now() or p_due_at > now() + interval '366 days') then
    raise exception using errcode = 'P0001', message = 'invalid_due';
  end if;
  if char_length(v_note) > 500 then
    raise exception using errcode = 'P0001', message = 'note_too_long';
  end if;
  if (select count(*) from public.assignments a where a.class_id = v_class.id) >= 300 then
    raise exception using errcode = 'P0001', message = 'assignment_limit';
  end if;

  insert into public.assignments (class_id, kind, lesson_id, exam_form_id, target_count, due_at, note)
  values (v_class.id, p_kind,
    case when p_kind = 'lesson' then p_ref_id end,
    case when p_kind = 'exam' then p_ref_id end,
    case when p_kind = 'review' then p_target_count end,
    p_due_at, v_note)
  returning * into v_a;
  return public.teacher_assignment_json(v_a) || jsonb_build_object(
    'completed_count', 0,
    'member_count', (select count(*)::integer from public.class_members m where m.class_id = v_class.id));
end;
$$;

create or replace function public.teacher_delete_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.teacher_require();
begin
  delete from public.assignments a
  using public.classes c
  where a.id = p_assignment_id and c.id = a.class_id and c.teacher_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'assignment_not_found';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Learner RPCs
-- ---------------------------------------------------------------------------

-- learnerClassSchema for one class of the caller.
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
      where a.class_id = p_class.id and public.teacher_assignment_done_at(a, p_class.language_code, p_user) is null));
$$;

-- learnerJoinResultSchema: {status: 'joined' | 'already_member', class} or {status: 'invalid_code'}.
-- 10 attempts per rolling hour (rate_limited); every attempt is recorded, failed ones included.
create or replace function public.learner_join_class(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_code text := public.teacher_normalize_code(p_code);
  v_invite public.class_invites;
  v_class public.classes;
  v_joined timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('class_join:' || v_uid::text, 0));
  delete from public.class_join_attempts j where j.user_id = v_uid and j.created_at < v_now - interval '1 day';
  if (select count(*) from public.class_join_attempts j
      where j.user_id = v_uid and j.created_at > v_now - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  if v_code ~ '^[A-HJ-NP-Z2-9]{8}$' then
    select i.* into v_invite from public.class_invites i where i.code = v_code for update;
    if found then
      select c.* into v_class from public.classes c where c.id = v_invite.class_id for update;
    end if;
  end if;

  if v_invite.code is null or v_class.id is null or v_invite.revoked_at is not null or v_invite.expires_at <= v_now
     or v_class.archived_at is not null then
    insert into public.class_join_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('status', 'invalid_code');
  end if;

  select m.joined_at into v_joined from public.class_members m where m.class_id = v_class.id and m.user_id = v_uid;
  if found then
    insert into public.class_join_attempts (user_id, succeeded) values (v_uid, true);
    return jsonb_build_object('status', 'already_member', 'class', public.learner_class_json(v_class, v_uid, v_joined));
  end if;

  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    insert into public.class_join_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('status', 'invalid_code');
  end if;
  if v_class.teacher_id = v_uid then
    raise exception using errcode = 'P0001', message = 'own_class';
  end if;
  if (select count(*) from public.class_members m where m.class_id = v_class.id) >= 200 then
    raise exception using errcode = 'P0001', message = 'class_full';
  end if;
  if (select count(*) from public.class_members m where m.user_id = v_uid) >= 20 then
    raise exception using errcode = 'P0001', message = 'join_limit';
  end if;

  insert into public.class_members (class_id, user_id, joined_at) values (v_class.id, v_uid, v_now);
  update public.class_invites i set uses = i.uses + 1 where i.code = v_invite.code;
  insert into public.class_join_attempts (user_id, succeeded) values (v_uid, true);
  return jsonb_build_object('status', 'joined', 'class', public.learner_class_json(v_class, v_uid, v_now));
end;
$$;

create or replace function public.learner_leave_class(p_class_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  delete from public.class_members m where m.class_id = p_class_id and m.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_member';
  end if;
  return jsonb_build_object('left', true);
end;
$$;

-- learnerClassListSchema: the caller's classes that are not archived, oldest membership first.
create or replace function public.learner_list_classes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  return coalesce((
    select jsonb_agg(public.learner_class_json(c, v_uid, m.joined_at) order by m.joined_at, c.id)
    from public.class_members m
    join public.classes c on c.id = m.class_id
    where m.user_id = v_uid and c.archived_at is null
  ), '[]'::jsonb);
end;
$$;

-- learnerAssignmentListSchema: assignments of the caller's active classes (or of p_class_id, not_member when the
-- caller is not in it) with their completion state. Open ones first (by due date), then done ones.
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
    select jsonb_agg(public.teacher_assignment_json(x.a) || jsonb_build_object(
        'class_name', x.class_name,
        'state', case when x.done_at is not null then 'done' when (x.a).due_at < v_now then 'overdue' else 'pending' end,
        'completed_at', x.done_at,
        'progress_count', case when (x.a).kind = 'review'
          then least((x.a).target_count, public.teacher_reviews_since(v_uid, x.language_code, (x.a).created_at))
          else case when x.done_at is not null then 1 else 0 end end)
      order by (x.done_at is not null), (x.a).due_at nulls last, (x.a).created_at, (x.a).id)
    from (
      select a, c.name as class_name, c.language_code,
        public.teacher_assignment_done_at(a, c.language_code, v_uid) as done_at
      from public.class_members m
      join public.classes c on c.id = m.class_id
      join public.assignments a on a.class_id = c.id
      where m.user_id = v_uid and c.archived_at is null and (p_class_id is null or c.id = p_class_id)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account export (spec 7 §1). Copied from 20261016000300_personal_vocab.sql plus the three user_id tables above.
-- ---------------------------------------------------------------------------
create or replace function public.account_optional_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['study_sessions', 'activity_days', 'user_badges', 'analytics_events', 'exam_attempts', 'exam_answers',
    'content_reports', 'notification_prefs', 'notifications',
    'personal_word_lists', 'personal_words', 'personal_vocab_imports',
    'teacher_profiles', 'class_members', 'class_join_attempts'];
$$;

-- Same function as 20261014000910_account_data.sql plus the "teacher_classes" section: classes the caller teaches,
-- with their invites and assignments and a member count (never the other members' ids).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_recent integer;
  v_result jsonb;
  v_name text;
  v_tbl regclass;
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  -- Serialise concurrent exports of the same user so the limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('export_my_data:' || v_uid::text, 0));
  delete from public.account_export_requests r where r.user_id = v_uid and r.requested_at < v_now - interval '1 day';
  select count(*) into v_recent
  from public.account_export_requests r
  where r.user_id = v_uid and r.requested_at > v_now - interval '1 hour';
  if v_recent >= 5 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  insert into public.account_export_requests (user_id, requested_at) values (v_uid, v_now);

  v_result := jsonb_build_object(
    'format', 'linguo-export',
    'version', 1,
    'exported_at', v_now,
    'account', (
      select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
      from auth.users u where u.id = v_uid
    ),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'preferences', (select to_jsonb(p) from public.user_preferences p where p.user_id = v_uid),
    'learning_paths', coalesce((
      select jsonb_agg(to_jsonb(lp) order by lp.created_at, lp.id)
      from public.learning_paths lp where lp.user_id = v_uid
    ), '[]'::jsonb),
    'skill_estimates', coalesce((
      select jsonb_agg(to_jsonb(se) order by se.assessed_at, se.id)
      from public.skill_estimates se
      join public.learning_paths lp on lp.id = se.learning_path_id
      where lp.user_id = v_uid
    ), '[]'::jsonb),
    -- Attempts are nested in their run. Unrevealed feedback loses the answer, as in get_lesson.
    'lesson_runs', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object('attempts', coalesce((
          select jsonb_agg(
            to_jsonb(a) || jsonb_build_object('feedback_json',
              case when a.revealed then a.feedback_json else a.feedback_json - 'display_answer' - 'explanation' end)
            order by a.created_at, a.id)
          from public.attempts a
          where a.lesson_run_id = r.id and a.user_id = v_uid
        ), '[]'::jsonb))
        order by r.started_at, r.id)
      from public.lesson_runs r where r.user_id = v_uid
    ), '[]'::jsonb),
    'review_cards', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.review_cards c where c.user_id = v_uid
    ), '[]'::jsonb),
    'review_item_mastery', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.learning_path_id, m.learning_item_id)
      from public.review_item_mastery m where m.user_id = v_uid
    ), '[]'::jsonb),
    'review_logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
      from public.review_logs l where l.user_id = v_uid
    ), '[]'::jsonb),
    -- Diagnostic responses never carry is_correct: it would reveal the item bank's answer key.
    'assessment_attempts', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('responses', coalesce((
          select jsonb_agg(jsonb_build_object(
              'seq', ar.seq, 'item_id', ar.item_id, 'skill', ar.skill, 'choice', ar.choice,
              'served_at', ar.served_at, 'answered_at', ar.answered_at)
            order by ar.seq)
          from public.assessment_responses ar where ar.attempt_id = t.id
        ), '[]'::jsonb))
        order by t.started_at, t.id)
      from public.assessment_attempts t where t.user_id = v_uid
    ), '[]'::jsonb),
    'ai_usage', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.created_at, u.id)
      from public.ai_usage u where u.user_id = v_uid
    ), '[]'::jsonb),
    'ai_reports', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
      from public.ai_reports r where r.user_id = v_uid
    ), '[]'::jsonb),
    'ai_quota', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.used_on)
      from public.ai_quota q where q.user_id = v_uid
    ), '[]'::jsonb),
    'teacher_classes', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object(
          'member_count', (select count(*)::integer from public.class_members m where m.class_id = c.id),
          'invites', coalesce((
            select jsonb_agg(to_jsonb(i) order by i.created_at, i.code)
            from public.class_invites i where i.class_id = c.id
          ), '[]'::jsonb),
          'assignments', coalesce((
            select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
            from public.assignments a where a.class_id = c.id
          ), '[]'::jsonb))
        order by c.created_at, c.id)
      from public.classes c where c.teacher_id = v_uid
    ), '[]'::jsonb)
  );

  -- Only optional tables that exist and have a user_id column (looked up in the catalog at run time).
  for v_name, v_tbl in
    select c.relname::text, c.oid::regclass
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = any (public.account_optional_tables())
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped
      )
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %s t where t.user_id = $1', v_tbl)
      into v_rows using v_uid;
    v_result := v_result || jsonb_build_object(v_name, v_rows);
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.teacher_require() from public, anon, authenticated;
revoke all on function public.teacher_class_for(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.teacher_invite_code() from public, anon, authenticated;
revoke all on function public.teacher_normalize_code(text) from public, anon, authenticated;
revoke all on function public.teacher_member_path(uuid, text) from public, anon, authenticated;
revoke all on function public.teacher_reviews_since(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.teacher_assignment_done_at(public.assignments, text, uuid) from public, anon, authenticated;
revoke all on function public.teacher_assignment_title(public.assignments) from public, anon, authenticated;
revoke all on function public.teacher_assignment_json(public.assignments) from public, anon, authenticated;
revoke all on function public.teacher_active_invites(uuid) from public, anon, authenticated;
revoke all on function public.teacher_class_json(public.classes) from public, anon, authenticated;
revoke all on function public.teacher_member_stats(uuid, public.classes) from public, anon, authenticated;
revoke all on function public.learner_class_json(public.classes, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.account_optional_tables() from public, anon, authenticated;

-- class_access runs inside the RLS policies, so the querying role needs it; it only reveals the caller's own relation.
revoke all on function public.class_access(uuid) from public, anon;
grant execute on function public.class_access(uuid) to authenticated;

revoke all on function public.grant_teacher_role(uuid, boolean) from public, anon;
revoke all on function public.is_teacher() from public, anon;
revoke all on function public.teacher_list_classes() from public, anon;
revoke all on function public.teacher_create_class(text, text) from public, anon;
revoke all on function public.teacher_rename_class(uuid, text) from public, anon;
revoke all on function public.teacher_archive_class(uuid, boolean) from public, anon;
revoke all on function public.teacher_create_invite(uuid, integer, integer) from public, anon;
revoke all on function public.teacher_revoke_invite(text) from public, anon;
revoke all on function public.teacher_remove_member(uuid, uuid) from public, anon;
revoke all on function public.teacher_class_roster(uuid) from public, anon;
revoke all on function public.teacher_create_assignment(uuid, text, uuid, timestamptz, text, integer) from public, anon;
revoke all on function public.teacher_delete_assignment(uuid) from public, anon;
revoke all on function public.learner_join_class(text) from public, anon;
revoke all on function public.learner_leave_class(uuid) from public, anon;
revoke all on function public.learner_list_classes() from public, anon;
revoke all on function public.learner_list_assignments(uuid) from public, anon;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.grant_teacher_role(uuid, boolean) to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.teacher_list_classes() to authenticated;
grant execute on function public.teacher_create_class(text, text) to authenticated;
grant execute on function public.teacher_rename_class(uuid, text) to authenticated;
grant execute on function public.teacher_archive_class(uuid, boolean) to authenticated;
grant execute on function public.teacher_create_invite(uuid, integer, integer) to authenticated;
grant execute on function public.teacher_revoke_invite(text) to authenticated;
grant execute on function public.teacher_remove_member(uuid, uuid) to authenticated;
grant execute on function public.teacher_class_roster(uuid) to authenticated;
grant execute on function public.teacher_create_assignment(uuid, text, uuid, timestamptz, text, integer) to authenticated;
grant execute on function public.teacher_delete_assignment(uuid) to authenticated;
grant execute on function public.learner_join_class(text) to authenticated;
grant execute on function public.learner_leave_class(uuid) to authenticated;
grant execute on function public.learner_list_classes() to authenticated;
grant execute on function public.learner_list_assignments(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
