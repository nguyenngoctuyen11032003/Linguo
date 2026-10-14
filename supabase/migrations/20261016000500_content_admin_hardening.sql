-- Content admin hardening (security review follow-ups). Four independent fixes, each a full `create or replace`
-- of the latest definition of the function it changes; no applied migration is edited.
--
-- 1. report_content duplicates (20261015000400): a report was stored as 'duplicate' when ANY report of the target
--    existed in the last 24 h, whatever its status, reason or version. A fresh wrong_answer report after staff had
--    resolved the earlier one, or after a harmless 'typo' report of someone else, was therefore hidden from the admin
--    queue (default filter 'open') and from the publish gate. Now a report is a 'duplicate' only of an UNRESOLVED
--    (open / triaged) report with the same reason and the same content_version. One learner holds at most one
--    unresolved report per target (partial unique index); filing another returns their existing report with status
--    'duplicate' and writes nothing. The 20-per-24-hour limit is unchanged.
-- 2. submit_exercise (20261015000800, B5 follow-up): a client_at is also ignored when older than 48 hours, so a run
--    opened on day D cannot be answered on D+1 / D+2 with a client_at on day D to backfill a missed day.
-- 3. Content import (20261015000420): the import no longer advances a row in_review -> approved or approved ->
--    published while the row has unresolved reports (that gate otherwise lives only in admin_set_status), and keeps
--    the stored status when a human reviewer set it through the admin RPCs and the YAML differs only by status.
-- 4. Admin: admin_grant_role cannot remove or demote the last admin, admin_audit_log is append-only, and reading an
--    answer key through admin_get_content leaves an audit row.

-- ---------------------------------------------------------------------------
-- 1. Content reports
-- ---------------------------------------------------------------------------

-- Reports the old logic wrongly stored as 'duplicate' (automatic: no resolver, no resolution time) come back to the
-- queue: per target / reason / version without any unresolved report, the earliest such report is reopened.
with cand as (
  select r.id,
    row_number() over (partition by r.target_kind, r.target_id, r.reason, r.content_version order by r.created_at, r.id) as rn
  from public.content_reports r
  where r.status = 'duplicate' and r.resolved_by is null and r.resolved_at is null
    and not exists (
      select 1 from public.content_reports o
      where o.target_kind = r.target_kind and o.target_id = r.target_id and o.reason = r.reason
        and o.content_version is not distinct from r.content_version and o.status in ('open', 'triaged'))
)
update public.content_reports r set status = 'open' from cand where r.id = cand.id and cand.rn = 1;

-- One unresolved report per learner and target: the earliest stays, later ones become duplicates of it.
with ranked as (
  select r.id, row_number() over (partition by r.user_id, r.target_kind, r.target_id order by r.created_at, r.id) as rn
  from public.content_reports r
  where r.status in ('open', 'triaged')
)
update public.content_reports r set
  status = 'duplicate',
  resolution_note = coalesce(r.resolution_note, 'Báo lỗi trùng của cùng người dùng'),
  resolved_at = now()
from ranked where r.id = ranked.id and ranked.rn > 1;

create unique index content_reports_one_unresolved_idx
  on public.content_reports (user_id, target_kind, target_id)
  where status in ('open', 'triaged');

-- Same checks as 20261015000400_content_reports.sql, in the same order; the duplicate rules replace the old
-- "anything in the last 24 hours".
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
  v_existing uuid;
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

  -- Serialise one learner's reports so the daily limit and the one-unresolved-report rule cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('report_content:' || v_uid::text, 0));

  select count(*) into v_recent
  from public.content_reports r
  where r.user_id = v_uid and r.created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  -- The learner already has an unresolved report on this target: that one stands; nothing is written.
  select r.id into v_existing
  from public.content_reports r
  where r.user_id = v_uid and r.target_kind = p_target_kind and r.target_id = p_target_id
    and admin_private.is_unresolved(r.status)
  order by r.created_at, r.id
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('report_id', v_existing, 'status', 'duplicate');
  end if;

  -- A duplicate only of an unresolved report with the same reason and the same content version.
  if exists (
    select 1 from public.content_reports r
    where r.target_kind = p_target_kind and r.target_id = p_target_id
      and r.reason = p_reason and r.content_version is not distinct from v_version
      and admin_private.is_unresolved(r.status)
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
-- 2. submit_exercise: B5 with a 48-hour floor (definition of 20261015000800_answer_integrity.sql)
-- ---------------------------------------------------------------------------

create or replace function public.submit_exercise(
  p_run_id uuid, p_exercise_id uuid, p_exercise_version integer, p_idempotency_key uuid, p_response jsonb,
  p_confidence smallint, p_response_ms integer, p_hint_count smallint, p_client_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_prev public.attempts;
  v_run public.lesson_runs;
  v_ex public.exercises;
  v_key content_private.exercise_keys;
  v_grade jsonb;
  v_verdict text;
  v_gave_up boolean;
  v_attempt_no integer;
  v_after_reveal boolean;
  v_revealed boolean;
  v_final boolean;
  v_requeued boolean;
  v_result jsonb;
  v_attempt_id uuid;
  v_now timestamptz := clock_timestamp();
  v_current_key_at timestamptz;
  v_client_at timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_response';
  end if;

  -- Replays return the stored result; the same key with another payload (run, exercise, exercise version
  -- or response) is a conflict.
  v_hash := md5(concat_ws('|',
    coalesce(p_run_id::text, ''), coalesce(p_exercise_id::text, ''), coalesce(p_exercise_version::text, ''),
    coalesce(p_response::text, '')));
  select a.* into v_prev from public.attempts a where a.user_id = v_uid and a.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.payload_hash = v_hash then
      return v_prev.feedback_json || jsonb_build_object('attempt_id', v_prev.id, 'replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  select r.* into v_run from public.lesson_runs r where r.id = p_run_id and r.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'run_not_found';
  end if;
  if v_run.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'run_not_active';
  end if;

  -- Counted per user, after the run lock so that concurrent submits on one run are counted in turn.
  if (select count(*) from public.attempts a where a.user_id = v_uid and a.created_at > now() - interval '10 seconds') >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  -- Only a published exercise of the run's queue can be answered. Exercise ids derive from public keys, so a
  -- draft, in_review, approved or archived exercise must never reach the reveal below.
  select e.* into v_ex
  from public.exercises e
  where e.id = p_exercise_id and e.lesson_id = v_run.lesson_id and e.status = 'published'
    and p_exercise_id = any (v_run.queue);
  if not found then
    raise exception using errcode = 'P0001', message = 'exercise_not_in_lesson';
  end if;

  select k.* into v_key from content_private.exercise_keys k where k.exercise_id = p_exercise_id and k.version = p_exercise_version;
  if not found or p_exercise_version > v_ex.version then
    raise exception using errcode = 'P0001', message = 'exercise_version_mismatch';
  end if;
  if p_exercise_version < v_ex.version then
    -- B6: an older key grades only an offline replay answered before the current key existed.
    select k.created_at into v_current_key_at
    from content_private.exercise_keys k where k.exercise_id = p_exercise_id and k.version = v_ex.version;
    if p_client_at is null or v_current_key_at is null or p_client_at >= v_current_key_at then
      raise exception using errcode = 'P0001', message = 'exercise_version_mismatch';
    end if;
  end if;

  -- B5: an answer cannot predate its run, cannot be older than 48 hours (older replays count on the server day)
  -- and cannot come from the future.
  v_client_at := case
    when p_client_at is not null and p_client_at >= v_run.started_at and p_client_at >= v_now - interval '48 hours'
      then least(p_client_at, v_now)
  end;

  if octet_length(p_response::text) > 2048
     or not public.lesson_response_valid(v_ex.exercise_type, p_response)
     or (p_confidence is not null and p_confidence not between 1 and 3) then
    raise exception using errcode = 'P0001', message = 'invalid_response';
  end if;

  v_grade := public.grade_exercise(v_ex.exercise_type, v_key.answer_key, v_key.rubric, v_key.known_wrong, v_ex.answer_lang, p_response);
  v_verdict := v_grade ->> 'verdict';
  v_gave_up := p_response = '{"give_up": true}'::jsonb;

  select count(*) + 1, coalesce(bool_or(a.revealed), false)
    into v_attempt_no, v_after_reveal
  from public.attempts a
  where a.lesson_run_id = v_run.id and a.exercise_id = p_exercise_id;

  v_revealed := v_verdict <> 'incorrect' or v_attempt_no >= 2 or v_gave_up;
  v_final := v_verdict <> 'incorrect' or v_revealed;
  v_requeued := not v_after_reveal and v_verdict = 'incorrect' and v_revealed;

  v_result := jsonb_build_object(
    'attempt_no', v_attempt_no,
    'verdict', v_verdict,
    'is_correct', v_verdict <> 'incorrect',
    'score', v_grade -> 'score',
    'error_tags', v_grade -> 'error_tags',
    'feedback_vi', v_grade -> 'feedback_vi',
    'revealed', v_revealed,
    'display_answer', case when v_revealed then to_jsonb(v_key.display_answer) else 'null'::jsonb end,
    'explanation', case when v_revealed then v_key.explanation else 'null'::jsonb end,
    'final', v_final,
    'requeued', v_requeued
  );

  begin
    insert into public.attempts (
      user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version, learning_item_id,
      idempotency_key, payload_hash, response_json, normalized_response, verdict, is_correct, score, error_tags,
      attempt_no, revealed, after_reveal, gave_up, feedback_json, stage, exercise_type, confidence, response_ms, hint_count,
      modality, client_at, created_at, synced_late
    ) values (
      v_uid, v_run.learning_path_id, v_run.id, v_run.lesson_id, v_ex.id, p_exercise_version, v_run.content_version, v_ex.item_id,
      p_idempotency_key, v_hash, p_response,
      case when v_ex.exercise_type = 'translate' then public.grading_normalize(p_response ->> 'text', v_ex.answer_lang, v_key.rubric) end,
      v_verdict, v_verdict <> 'incorrect', (v_grade ->> 'score')::numeric,
      array(select jsonb_array_elements_text(v_grade -> 'error_tags')),
      v_attempt_no, v_revealed, v_after_reveal, v_gave_up, v_result, v_ex.stage, v_ex.exercise_type, p_confidence,
      greatest(0, least(600000, coalesce(p_response_ms, 0))),
      greatest(0, least(3, coalesce(p_hint_count, 0)))::smallint,
      case when v_ex.exercise_type = 'listen' then case when v_ex.prompt ->> 'audio_asset_id' is null then 'text_fallback' else 'audio' end end,
      v_client_at, v_now, v_client_at is not null and v_now - v_client_at > interval '60 seconds'
    )
    returning id into v_attempt_id;
  exception when unique_violation then
    -- A concurrent call with the same key won the race.
    select a.* into v_prev from public.attempts a where a.user_id = v_uid and a.idempotency_key = p_idempotency_key;
    if found and v_prev.payload_hash = v_hash then
      return v_prev.feedback_json || jsonb_build_object('attempt_id', v_prev.id, 'replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end;

  if v_requeued then
    update public.lesson_runs set queue = queue || p_exercise_id where id = v_run.id;
  end if;

  return v_result || jsonb_build_object('attempt_id', v_attempt_id, 'replayed', false);
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Content import: review state set in the admin pages and the report gate
-- ---------------------------------------------------------------------------
-- True when the import must keep a row's stored review state instead of applying the bundle's status (the bundle's
-- content_hash is unchanged and the stored row is not archived; the caller checks both). Decided in this order:
--   1. the statuses are equal: nothing to keep (the bundle's reviewer fields are applied as before);
--   2. the bundle's status is not the same or one legal workflow step away (import_status_step_ok): keep;
--   3. the stored review state was set through the admin RPCs and the bundle does not archive the row (archiving
--      through the YAML always works): keep. admin_set_status stamps reviewed_by with the
--      caller's user id on EVERY transition (the YAML only ever holds a reviewer name or null), so a user-id
--      reviewed_by means a human decided the stored status, and a YAML that merely lags behind (or still says
--      `approved` for a row an admin sent back) must not undo it. The YAML takes over again once its status equals
--      the stored one;
--   4. the step would approve or publish (in_review -> approved, approved -> published) while the row has
--      unresolved (open / triaged) reports - its own, or for a lesson those of its exercises: keep. That gate
--      otherwise exists only in admin_set_status.
-- p_kind: source, program, unit, lesson, learning_item or exercise (reports exist for the last three).
create or replace function content_private.import_keep_stored(
  p_kind text, p_id uuid, p_stored_status text, p_stored_reviewed_by text, p_yaml_status text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_stored_status = p_yaml_status then
    return false;
  end if;
  if not content_private.import_status_step_ok(p_stored_status, p_yaml_status) then
    return true;
  end if;
  if p_yaml_status <> 'archived'
     and p_stored_reviewed_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return true;
  end if;
  if (p_stored_status, p_yaml_status) in (('in_review', 'approved'), ('approved', 'published')) and exists (
    select 1 from public.content_reports r
    where admin_private.is_unresolved(r.status)
      and ((r.target_kind = p_kind and r.target_id = p_id)
        or (p_kind = 'lesson' and r.target_kind = 'exercise'
            and r.target_id in (select e.id from public.exercises e where e.lesson_id = p_id)))
  ) then
    return true;
  end if;
  return false;
end;
$$;

revoke all on function content_private.import_keep_stored(text, uuid, text, text, text) from public, anon, authenticated;

-- Body of content_private.import_bundle from 20261015000420_import_keep_published.sql; the only change is that each
-- "Keep review state" branch calls import_keep_stored instead of testing import_status_step_ok directly.
create or replace function content_private.import_bundle(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_git text;
  v_ins integer := 0;
  v_upd integer := 0;
  v_arch integer := 0;
  v_unch integer := 0;
  v_n integer;
  v_version integer;
  v_lesson_ids uuid[];
  r jsonb;
  v_src public.content_sources;
  v_prog public.programs;
  v_unit public.units;
  v_item public.learning_items;
  v_lesson public.lessons;
  v_ex public.exercises;
begin
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
     or (p_bundle -> 'bundle_version') is distinct from '1'::jsonb
     or exists (
       select 1
       from unnest(array['sources', 'programs', 'units', 'lessons', 'lesson_prerequisites', 'learning_items', 'lesson_items', 'exercises']) as k
       where jsonb_typeof(p_bundle -> k) is distinct from 'array'
     ) then
    raise exception using errcode = 'P0001', message = 'invalid_bundle';
  end if;
  -- An empty lesson list would archive every lesson; refuse it while anything is published.
  if jsonb_array_length(p_bundle -> 'lessons') = 0
     and exists (select 1 from public.lessons where status = 'published') then
    raise exception using errcode = 'P0001', message = 'empty_bundle';
  end if;
  -- Concurrent imports would interleave their archive/park/upsert steps; run them one at a time.
  perform pg_advisory_xact_lock(hashtext('linguo_content_import'));
  v_git := p_bundle ->> 'git_sha';

  -- ===== content_sources =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.content_sources set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'sources') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'sources') loop
    select * into v_src from public.content_sources where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.content_sources (
        id, key, title, author_or_org, url, license, attribution_required,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', r ->> 'title', r ->> 'author_or_org', r ->> 'url', r ->> 'license',
        (r ->> 'attribution_required')::boolean,
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('content_sources', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_src.content_hash is distinct from r ->> 'content_hash' then
      update public.content_sources set
        key = r ->> 'key', title = r ->> 'title', author_or_org = r ->> 'author_or_org', url = r ->> 'url',
        license = r ->> 'license', attribution_required = (r ->> 'attribution_required')::boolean,
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_src.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('content_sources', v_src.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif v_src.status <> 'archived' and content_private.import_keep_stored('source', v_src.id, v_src.status, v_src.reviewed_by, r ->> 'status') then
      -- Keep review state: see content_private.import_keep_stored.
      v_unch := v_unch + 1;
    elsif (v_src.status, v_src.is_demo, v_src.reviewed_by, v_src.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.content_sources set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_src.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== programs =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.programs set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'programs') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'programs') loop
    select * into v_prog from public.programs where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.programs (
        id, key, source_id, language_code, title, description, kind, goal_types, level_from, level_to, order_index,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, r ->> 'language_code', r -> 'title', r -> 'description',
        r ->> 'kind', array(select jsonb_array_elements_text(r -> 'goal_types')), r ->> 'level_from', r ->> 'level_to',
        (r ->> 'order_index')::integer,
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('programs', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_prog.content_hash is distinct from r ->> 'content_hash' then
      update public.programs set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, language_code = r ->> 'language_code',
        title = r -> 'title', description = r -> 'description', kind = r ->> 'kind',
        goal_types = array(select jsonb_array_elements_text(r -> 'goal_types')),
        level_from = r ->> 'level_from', level_to = r ->> 'level_to', order_index = (r ->> 'order_index')::integer,
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_prog.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('programs', v_prog.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif v_prog.status <> 'archived' and content_private.import_keep_stored('program', v_prog.id, v_prog.status, v_prog.reviewed_by, r ->> 'status') then
      -- Keep review state: see content_private.import_keep_stored.
      v_unch := v_unch + 1;
    elsif (v_prog.status, v_prog.is_demo, v_prog.reviewed_by, v_prog.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.programs set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_prog.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== units =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.units set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'units') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', 'reorder', true);
  update public.units t set order_index = -1 - t.order_index
  from jsonb_array_elements(p_bundle -> 'units') x
  where t.id = (x ->> 'id')::uuid and t.content_hash is distinct from x ->> 'content_hash'
    and (t.program_id, t.order_index) is distinct from ((x ->> 'program_id')::uuid, (x ->> 'order_index')::integer);
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'units') loop
    select * into v_unit from public.units where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.units (
        id, key, source_id, program_id, order_index, title,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, (r ->> 'program_id')::uuid,
        (r ->> 'order_index')::integer, r -> 'title',
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('units', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_unit.content_hash is distinct from r ->> 'content_hash' then
      update public.units set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, program_id = (r ->> 'program_id')::uuid,
        order_index = (r ->> 'order_index')::integer, title = r -> 'title',
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_unit.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('units', v_unit.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif v_unit.status <> 'archived' and content_private.import_keep_stored('unit', v_unit.id, v_unit.status, v_unit.reviewed_by, r ->> 'status') then
      -- Keep review state: see content_private.import_keep_stored.
      v_unch := v_unch + 1;
    elsif (v_unit.status, v_unit.is_demo, v_unit.reviewed_by, v_unit.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.units set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_unit.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== learning_items =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.learning_items set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'learning_items') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'learning_items') loop
    select * into v_item from public.learning_items where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.learning_items (
        id, key, source_id, language_code, item_type, level_code, difficulty, skill_tags, front, back, audio_path,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, r ->> 'language_code', r ->> 'item_type',
        r ->> 'level_code', (r ->> 'difficulty')::smallint, array(select jsonb_array_elements_text(r -> 'skill_tags')),
        r -> 'front', r -> 'back', r ->> 'audio_path',
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('learning_items', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_item.content_hash is distinct from r ->> 'content_hash' then
      update public.learning_items set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, language_code = r ->> 'language_code',
        item_type = r ->> 'item_type', level_code = r ->> 'level_code', difficulty = (r ->> 'difficulty')::smallint,
        skill_tags = array(select jsonb_array_elements_text(r -> 'skill_tags')),
        front = r -> 'front', back = r -> 'back', audio_path = r ->> 'audio_path',
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_item.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('learning_items', v_item.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif v_item.status <> 'archived' and content_private.import_keep_stored('learning_item', v_item.id, v_item.status, v_item.reviewed_by, r ->> 'status') then
      -- Keep review state: see content_private.import_keep_stored.
      v_unch := v_unch + 1;
    elsif (v_item.status, v_item.is_demo, v_item.reviewed_by, v_item.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.learning_items set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_item.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== lessons =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.lessons set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'lessons') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', 'reorder', true);
  update public.lessons t set order_index = -1 - t.order_index
  from jsonb_array_elements(p_bundle -> 'lessons') x
  where t.id = (x ->> 'id')::uuid and t.content_hash is distinct from x ->> 'content_hash'
    and (t.unit_id, t.order_index) is distinct from ((x ->> 'unit_id')::uuid, (x ->> 'order_index')::integer);
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'lessons') loop
    select * into v_lesson from public.lessons where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.lessons (
        id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
        estimated_minutes, skills, status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, (r ->> 'unit_id')::uuid, r ->> 'language_code',
        r ->> 'level_code', (r ->> 'order_index')::integer, r -> 'title', r -> 'objectives', r -> 'body',
        (r ->> 'estimated_minutes')::integer, array(select jsonb_array_elements_text(r -> 'skills')),
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('lessons', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_lesson.content_hash is distinct from r ->> 'content_hash' then
      update public.lessons set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, unit_id = (r ->> 'unit_id')::uuid,
        language_code = r ->> 'language_code', level_code = r ->> 'level_code', order_index = (r ->> 'order_index')::integer,
        title = r -> 'title', objectives = r -> 'objectives', body = r -> 'body',
        estimated_minutes = (r ->> 'estimated_minutes')::integer, skills = array(select jsonb_array_elements_text(r -> 'skills')),
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_lesson.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('lessons', v_lesson.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif v_lesson.status <> 'archived' and content_private.import_keep_stored('lesson', v_lesson.id, v_lesson.status, v_lesson.reviewed_by, r ->> 'status') then
      -- Keep review state: see content_private.import_keep_stored.
      v_unch := v_unch + 1;
    elsif (v_lesson.status, v_lesson.is_demo, v_lesson.reviewed_by, v_lesson.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.lessons set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_lesson.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== lesson_prerequisites / lesson_items: replaced for every bundled lesson =====
  -- Item links of archived lessons are dropped too, so an archived lesson never holds an introduction.
  v_lesson_ids := array(select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'lessons') x);

  delete from public.lesson_prerequisites where lesson_id = any (v_lesson_ids);
  for r in select value from jsonb_array_elements(p_bundle -> 'lesson_prerequisites') loop
    insert into public.lesson_prerequisites (lesson_id, prerequisite_lesson_id)
    values ((r ->> 'lesson_id')::uuid, (r ->> 'prerequisite_lesson_id')::uuid);
  end loop;

  delete from public.lesson_items li
  where li.lesson_id = any (v_lesson_ids)
     or exists (select 1 from public.lessons l where l.id = li.lesson_id and l.status = 'archived');
  for r in select value from jsonb_array_elements(p_bundle -> 'lesson_items') loop
    insert into public.lesson_items (lesson_id, item_id, position, role)
    values ((r ->> 'lesson_id')::uuid, (r ->> 'item_id')::uuid, (r ->> 'position')::integer, r ->> 'role');
  end loop;

  -- ===== exercises (+ content_private.exercise_keys per version) =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.exercises set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'exercises') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', 'reorder', true);
  update public.exercises t set order_index = -1 - t.order_index
  from jsonb_array_elements(p_bundle -> 'exercises') x
  where t.id = (x ->> 'id')::uuid and t.content_hash is distinct from x ->> 'content_hash'
    and (t.lesson_id, t.order_index) is distinct from ((x ->> 'lesson_id')::uuid, (x ->> 'order_index')::integer);
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'exercises') loop
    v_version := null;
    select * into v_ex from public.exercises where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.exercises (
        id, key, source_id, lesson_id, item_id, order_index, exercise_type, stage, answer_lang, prompt, difficulty,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, (r ->> 'lesson_id')::uuid, (r ->> 'item_id')::uuid,
        (r ->> 'order_index')::integer, r ->> 'exercise_type', r ->> 'stage', r ->> 'answer_lang', r -> 'prompt',
        (r ->> 'difficulty')::smallint,
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      v_version := 1;
      v_ins := v_ins + 1;
    elsif v_ex.content_hash is distinct from r ->> 'content_hash' then
      update public.exercises set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, lesson_id = (r ->> 'lesson_id')::uuid,
        item_id = (r ->> 'item_id')::uuid, order_index = (r ->> 'order_index')::integer,
        exercise_type = r ->> 'exercise_type', stage = r ->> 'stage', answer_lang = r ->> 'answer_lang',
        prompt = r -> 'prompt', difficulty = (r ->> 'difficulty')::smallint,
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_ex.id
      returning version into v_version;
      v_upd := v_upd + 1;
    elsif v_ex.status <> 'archived' and content_private.import_keep_stored('exercise', v_ex.id, v_ex.status, v_ex.reviewed_by, r ->> 'status') then
      -- Keep review state: see content_private.import_keep_stored.
      v_unch := v_unch + 1;
    elsif (v_ex.status, v_ex.is_demo, v_ex.reviewed_by, v_ex.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.exercises set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_ex.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;

    if v_version is not null then
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('exercises', (r ->> 'id')::uuid, v_version, r, r ->> 'content_hash', v_git);
      insert into content_private.exercise_keys (exercise_id, version, answer_key, rubric, known_wrong, explanation, display_answer)
      values (
        (r ->> 'id')::uuid, v_version, r -> 'key_data' -> 'answer_key', r -> 'key_data' -> 'rubric',
        coalesce(r -> 'key_data' -> 'known_wrong', '[]'::jsonb), r -> 'key_data' -> 'explanation',
        r -> 'key_data' ->> 'display_answer'
      )
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'archived', v_arch, 'unchanged', v_unch);
end;
$$;

comment on function content_private.import_bundle(jsonb) is 'Imports a content bundle (packages/shared/src/content/bundle.ts). service_role only.';

revoke all on function content_private.import_bundle(jsonb) from public, anon, authenticated;
grant execute on function content_private.import_bundle(jsonb) to service_role;


-- ---------------------------------------------------------------------------
-- 4. Admin hardening (definitions of 20261015000410_admin.sql)
-- ---------------------------------------------------------------------------

-- admin_audit_log is append-only: no row is ever updated, deleted or truncated (there is no retention job for it;
-- purge_expired_data does not touch it). A superuser can still disable the triggers for a deliberate maintenance.
create or replace function admin_private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'audit_log_append_only';
end;
$$;

revoke all on function admin_private.audit_log_append_only() from public, anon, authenticated;

create trigger admin_audit_log_append_only_row
  before update or delete on public.admin_audit_log
  for each row execute function admin_private.audit_log_append_only();
create trigger admin_audit_log_append_only_truncate
  before truncate on public.admin_audit_log
  for each statement execute function admin_private.audit_log_append_only();

-- Admin only. p_role null removes the user's role. Returns {user_id, role}. The last admin can be neither removed nor
-- demoted (also when it is the caller themselves): last_admin_required.
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

  -- Role changes of admins are serialised, so two admins cannot demote each other at the same time.
  perform pg_advisory_xact_lock(hashtextextended('admin_grant_role', 0));
  select s.role into v_previous from public.staff_roles s where s.user_id = p_user_id for update;
  if v_previous = 'admin' and p_role is distinct from 'admin'
     and not exists (select 1 from public.staff_roles s where s.role = 'admin' and s.user_id <> p_user_id) then
    raise exception using errcode = 'P0001', message = 'last_admin_required';
  end if;

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

-- admin_get_content as in 20261015000410_admin.sql, now volatile: when it returns answer data (exercise key,
-- diagnostic answer, exam answer) it writes a 'read_answers' audit row (target kind and id), at most one per staff
-- member and target every 10 minutes.
create or replace function public.admin_get_content(p_kind text, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table text := admin_private.kind_table(p_kind);
  v_row jsonb;
  v_source uuid;
  v_reviewed_by text;
  v_private jsonb;
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

  v_private := admin_private.answer_detail(p_kind, p_id);
  if v_private is not null and not exists (
    select 1 from public.admin_audit_log a
    where a.actor = auth.uid() and a.action = 'read_answers' and a.target_kind = p_kind and a.target_id = p_id::text
      and a.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    perform admin_private.audit('read_answers', p_kind, p_id::text, jsonb_build_object('key', v_row ->> 'key'));
  end if;

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
    'private', v_private,
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

-- admin_set_status as in 20261015000410_admin.sql, with one change: EVERY transition stamps reviewed_by with the
-- caller's user id (reviewed_at still only moves on approved / published), so the content import can tell a status
-- set by a human reviewer from one written by the YAML (content_private.import_keep_stored). exam_question rows
-- have no review columns and only change status.
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
  elsif p_kind = 'exam_question' then
    execute format('update public.%I set status = $1 where id = $2', v_table) using p_status, p_id;
  else
    execute format('update public.%I set status = $1, reviewed_by = $2 where id = $3', v_table)
      using p_status, auth.uid()::text, p_id;
  end if;
  perform set_config('linguo.content_import', '', true);

  perform admin_private.audit('set_status', p_kind, p_id::text, jsonb_build_object(
    'from', v_old, 'to', p_status, 'note', v_note, 'forced', v_forced, 'open_wrong_answer_reports', v_open));
  return jsonb_build_object('status', p_status);
end;
$$;
