-- Linguo spec 9 leftover (backend review B3): exam practice now counts toward the learner's activity day
-- (public.activity_days of 20261015000100_progress.sql), hence toward the streak and the progress minutes.
--
-- This migration supersedes the `TODO(spec8-merge)` block in exam_close_attempt of
-- 20261015000200_exams.sql (an applied migration, which cannot be edited): exam_close_attempt is redefined
-- below with the Spec 8 wiring that comment asked for.
--
-- Rules (spec 9 §3):
--   * answers  = number of non-null exam_answers of the attempt;
--   * active_ms = Σ over those answers, ordered by their last save, of least(gap to the previous save, 120 s);
--     the first gap starts at exam_attempts.started_at;
--   * XP is 0 (exam practice must not farm XP), correct_first / lessons / reviews are 0;
--   * the day is the learner's local day of the close instant (progress_local_day, the helper of the other
--     activity writers). STREAK_RULES then make the day active from >= 5 active minutes.
--
-- Idempotency: exam_attempts.activity_counted_at records that an attempt has been added, so closing an
-- attempt twice, or re-running the backfill, never counts it twice.

alter table public.exam_attempts add column activity_counted_at timestamptz;
comment on column public.exam_attempts.activity_counted_at is
  'When this attempt was added to activity_days (set once, at close or by exam_backfill_activity); null while in progress.';

-- (answers, active_ms) of an attempt as defined above.
create or replace function public.exam_attempt_activity(p_attempt_id uuid)
returns table (n_answers integer, active_ms bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer,
         coalesce(sum(least(g.gap_ms, 120000)), 0)::bigint
  from (
    select floor(greatest(0, extract(epoch from (
             e.updated_at - coalesce(lag(e.updated_at) over (order by e.updated_at, e.question_id), a.started_at)
           )) * 1000)) as gap_ms
    from public.exam_answers e
    join public.exam_attempts a on a.id = e.attempt_id
    where e.attempt_id = p_attempt_id and e.answer is not null
  ) as g;
$$;

-- Grades and closes an in-progress attempt as 'submitted' or 'expired'; returns the stored result and adds
-- the attempt to the learner's activity day (once: only the call that actually closes it does).
create or replace function public.exam_close_attempt(p_attempt_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_att public.exam_attempts;
  v_act record;
begin
  v_result := public.exam_build_result(p_attempt_id, p_status, now());
  update public.exam_attempts
  set status = p_status, submitted_at = now(), result = v_result, activity_counted_at = now()
  where id = p_attempt_id and status = 'in_progress'
  returning * into v_att;
  if found then
    select * into v_act from public.exam_attempt_activity(p_attempt_id);
    if v_act.n_answers > 0 then
      perform public.progress_bump(
        v_att.user_id, v_att.learning_path_id, public.progress_local_day(v_att.user_id, v_att.submitted_at),
        v_act.active_ms, v_act.n_answers, 0, 0, 0, 0);
    end if;
  end if;
  return v_result;
end;
$$;

-- Adds the closed attempts that are not counted yet (those closed before this migration) to activity_days.
-- Returns how many attempts it handled; a second call finds none.
create or replace function public.exam_backfill_activity()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_act record;
  v_n integer := 0;
begin
  for r in
    select a.id, a.user_id, a.learning_path_id, a.submitted_at
    from public.exam_attempts a
    where a.status <> 'in_progress' and a.activity_counted_at is null
    order by a.submitted_at
    for update
  loop
    select * into v_act from public.exam_attempt_activity(r.id);
    if v_act.n_answers > 0 then
      perform public.progress_bump(
        r.user_id, r.learning_path_id, public.progress_local_day(r.user_id, r.submitted_at),
        v_act.active_ms, v_act.n_answers, 0, 0, 0, 0);
    end if;
    update public.exam_attempts set activity_counted_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.exam_attempt_activity(uuid) from public, anon, authenticated;
revoke all on function public.exam_close_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.exam_backfill_activity() from public, anon, authenticated;

select public.exam_backfill_activity();
