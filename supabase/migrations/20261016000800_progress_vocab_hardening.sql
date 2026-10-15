-- Linguo security-review hardening (F1): exam activity day, active-time forgery, personal vocabulary.
-- PART 1 (exam activity day) is below; parts 2 and 3 are appended further down.
--
-- ===== PART 1: exam activity is credited to the day the answers were SAVED =====
-- 20261016000100_exam_activity.sql credited an attempt to the day it was CLOSED. Section / question-type
-- attempts have no deadline, so a learner could answer for ~6 minutes on day D and close the attempt on D+2
-- to land >= 5 active minutes on D+2. Now every answer is bucketed into the learner-local day of its own last
-- save (exam_answers.updated_at, clamped for expired attempts to deadline_at + 30 s, the grace window of
-- exam_overdue); each answer's gap (capped at 120 s, first gap starts at the attempt start) is credited to
-- the day of that answer, so an attempt spanning two local days is split per day.
--
-- Backfill: attempts ALREADY counted (activity_counted_at is not null) are left exactly as they are, to avoid
-- double counting; only future closes and attempts not yet counted use the new rule.

create or replace function public.exam_attempt_activity_days(p_attempt_id uuid)
returns table (local_day date, n_answers integer, active_ms bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with ans as (
    select a.user_id,
           case when a.deadline_at is not null
                then least(e.updated_at, a.deadline_at + interval '30 seconds')
                else e.updated_at end as at,
           e.question_id,
           a.started_at
    from public.exam_answers e
    join public.exam_attempts a on a.id = e.attempt_id
    where e.attempt_id = p_attempt_id and e.answer is not null
  ), gaps as (
    select user_id, at,
           floor(greatest(0, extract(epoch from (at - coalesce(lag(at) over (order by at, question_id), started_at))) * 1000)) as gap_ms
    from ans
  )
  select public.progress_local_day(g.user_id, g.at), count(*)::integer, sum(least(g.gap_ms, 120000))::bigint
  from gaps g
  group by 1;
$$;

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
  r record;
begin
  v_result := public.exam_build_result(p_attempt_id, p_status, now());
  update public.exam_attempts
  set status = p_status, submitted_at = now(), result = v_result, activity_counted_at = now()
  where id = p_attempt_id and status = 'in_progress'
  returning * into v_att;
  if found then
    for r in select * from public.exam_attempt_activity_days(p_attempt_id) loop
      perform public.progress_bump(v_att.user_id, v_att.learning_path_id, r.local_day, r.active_ms, r.n_answers, 0, 0, 0, 0);
    end loop;
  end if;
  return v_result;
end;
$$;

create or replace function public.exam_backfill_activity()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  d record;
  v_n integer := 0;
begin
  for r in
    select a.id, a.user_id, a.learning_path_id
    from public.exam_attempts a
    where a.status <> 'in_progress' and a.activity_counted_at is null
    order by a.submitted_at
    for update
  loop
    for d in select * from public.exam_attempt_activity_days(r.id) loop
      perform public.progress_bump(r.user_id, r.learning_path_id, d.local_day, d.active_ms, d.n_answers, 0, 0, 0, 0);
    end loop;
    update public.exam_attempts set activity_counted_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.exam_attempt_activity_days(uuid) from public, anon, authenticated;
revoke all on function public.exam_close_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.exam_backfill_activity() from public, anon, authenticated;

-- ===== PART 2: active-time forgery (credited active time of answers, and back-dating) =====
-- The attempts trigger credited least(response_ms, 120 s) of whatever the client reported, on the day of the
-- client's claimed time (kept up to 7 days back by progress_answer_day). Three answers with response_ms = 600000
-- on a missed day were 6 minutes, enough to repair a streak. Now:
--   (a) the credited active_ms of an answer is min(response_ms, 120 s, max(2 s, gap)), where gap is
--       * live answers (no client_at, or client_at within 60 s of the server time): the server gap since the
--         previous attempt of the run (the run start for the first) on created_at / started_at;
--       * offline replays (client_at older than 60 s): the spread between this client_at and the latest
--         earlier client time of the run (created_at where an attempt carries none; the run start for the first);
--     and never more than the wall time between the run start and the insert;
--   (b) submit_exercise honours client_at only when the run was active then (see v_client_at below): not before
--       the effective time (client_at, else created_at) of the run's latest stored attempt minus 5 minutes, not more than 12 hours old, plus the existing run-start /
--       not-future bounds. Otherwise the server time is used.
-- Residual: inside an active run a forged client_at (last 12 hours, after the run's latest attempt) can still land
-- on the previous local day when midnight lies between; its credited time stays capped by the real elapsed time.
-- This supersedes the misleading header of 20261015000100_progress.sql ("least(response_ms, 120000) is the active
-- time") and the 48 h rule of 20261016000500_content_admin_hardening.sql.

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
  v_last_at timestamptz;
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
  -- F1.2: additionally the claimed time must not lie more than 5 minutes before the run's latest stored attempt
  -- (or, for its first answer, before the run start) and not more than 12 hours back. A learner who opened a run
  -- on a missed day and answers it on the next day therefore cannot back-date the answers to the missed day,
  -- while an offline stretch of up to 12 hours inside an active run is replayed on the day it happened.
  select max(coalesce(a.client_at, a.created_at)) into v_last_at from public.attempts a where a.lesson_run_id = v_run.id;
  v_client_at := case
    when p_client_at is not null and p_client_at >= v_run.started_at and p_client_at >= v_now - interval '12 hours'
      and p_client_at >= coalesce(v_last_at, v_run.started_at) - interval '5 minutes'
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

create or replace function public.progress_on_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean := new.attempt_no = 1 and not new.after_reveal;
  v_run_start timestamptz;
  v_prev_server timestamptz;
  v_prev_client timestamptz;
  v_gap_ms bigint;
  v_active bigint;
begin
  select r.started_at into v_run_start from public.lesson_runs r where r.id = new.lesson_run_id;
  v_run_start := coalesce(v_run_start, new.created_at);
  select max(a.created_at), max(coalesce(a.client_at, a.created_at))
    into v_prev_server, v_prev_client
  from public.attempts a
  where a.lesson_run_id = new.lesson_run_id and a.id <> new.id and a.created_at <= new.created_at;

  if new.client_at is null or new.created_at - new.client_at <= interval '60 seconds' then
    v_gap_ms := floor(extract(epoch from (new.created_at - coalesce(v_prev_server, v_run_start))) * 1000);
  else
    v_gap_ms := floor(extract(epoch from (new.client_at - coalesce(v_prev_client, v_run_start))) * 1000);
  end if;
  v_active := least(new.response_ms, 120000, greatest(2000, v_gap_ms),
    greatest(0, floor(extract(epoch from (new.created_at - v_run_start)) * 1000)));

  perform public.progress_bump(
    new.user_id, new.learning_path_id, public.progress_answer_day(new.user_id, new.client_at, new.created_at),
    greatest(0, v_active), 1,
    case when v_first and new.verdict = 'correct' then 1 else 0 end,
    0, 0,
    case when not v_first then 0 when new.verdict = 'correct' then 2 when new.verdict = 'almost' then 1 else 0 end);
  return null;
end;
$$;
revoke all on function public.progress_on_attempt() from public, anon, authenticated;

-- ===== PART 3: personal vocabulary hardening =====
-- (d) personal_clean also drops U+00AD, U+061C, U+180E and U+2060-U+2064 (INVISIBLE in
--     packages/shared/src/personal-vocab/contract.ts is the same set). personal_term_key feeds a CHECK
--     constraint, so stored words containing these characters are normalised right after the function changes;
--     a word whose term or meaning is only such characters, or that collides after cleaning with another word of
--     its list (e.g. a soft-hyphen variant of an existing term; the older word wins), is deleted.
-- (a) personal_parse_rows rejects a field of more than 1000 raw characters BEFORE the regex cleaning, and
--     import_personal_words refuses a payload over 600000 bytes (too_many_rows) before any parsing.
-- (b) import ATTEMPTS are counted, not only successful imports: the log row is inserted before validation, and
--     the validation failures (invalid_rows, too_many_rows, list_full, vocab_full) are RETURNED as
--     {"ok": false, "code": ...} instead of raised, because a raise would roll the log row back. The web service
--     (apps/web/src/features/personal-vocab/service.ts) rethrows that object as the same error code, so the user
--     sees the same messages. not_authenticated, list_not_found and rate_limited still raise (they do no work).
-- (c) re-importing a file with fewer columns no longer clears example / note / pronunciation: a stored value is
--     replaced only by a non-empty incoming value.

create or replace function public.personal_clean(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(normalize(p_text, NFC), '[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]', '', 'g'),
    '[\s\x01-\x1f\x7f]+', ' ', 'g')), '');
$$;

create temporary table personal_affected on commit drop as
select w.id, w.list_id, w.created_at,
       public.personal_term_key(w.term) as new_key,
       public.personal_clean(w.meaning) as new_meaning
from public.personal_words w
where concat_ws(' ', w.term, w.meaning, w.example, w.note, w.pronunciation) ~ '[\u00ad\u061c\u180e\u2060-\u2064]';

delete from public.personal_words w
using personal_affected a
where w.id = a.id
  and (a.new_key is null or a.new_meaning is null
       or exists (
         select 1 from public.personal_words b
         left join personal_affected ba on ba.id = b.id
         where b.list_id = a.list_id and b.id <> a.id
           and coalesce(ba.new_key, b.term_key) = a.new_key
           and (ba.id is null or (ba.created_at, ba.id) < (a.created_at, a.id))));

update public.personal_words w
set term = public.personal_clean(w.term), term_key = public.personal_term_key(w.term),
    meaning = public.personal_clean(w.meaning), example = public.personal_clean(w.example),
    note = public.personal_clean(w.note), pronunciation = public.personal_clean(w.pronunciation)
where w.id in (select id from personal_affected);

drop table personal_affected;

-- Validates and normalises p_rows. Same contract as before; a field longer than 1000 raw characters is rejected
-- (<field>_too_long) without running the cleaning regex on it.
create or replace function public.personal_parse_rows(p_rows jsonb)
returns table (
  idx integer, term text, term_key text, meaning text, example text, note text, pronunciation text,
  reason text, dup boolean
)
language sql
stable
set search_path = ''
as $$
  with e as (
    select (o.ord - 1)::integer as idx, o.val
    from jsonb_array_elements(p_rows) with ordinality as o (val, ord)
  ),
  f as (
    select e.idx, e.val,
      jsonb_typeof(e.val) = 'object' as is_obj,
      case when jsonb_typeof(e.val -> 'term') = 'string' then e.val ->> 'term' end as t_raw,
      case when jsonb_typeof(e.val -> 'meaning') = 'string' then e.val ->> 'meaning' end as m_raw,
      case when jsonb_typeof(e.val -> 'example') = 'string' then e.val ->> 'example' end as x_raw,
      case when jsonb_typeof(e.val -> 'note') = 'string' then e.val ->> 'note' end as n_raw,
      case when jsonb_typeof(e.val -> 'pronunciation') = 'string' then e.val ->> 'pronunciation' end as p_raw
    from e
  ),
  c as (
    select f.idx, f.is_obj,
      exists (
        select 1 from unnest(array['term', 'meaning', 'example', 'note', 'pronunciation']) as k
        where jsonb_typeof(f.val -> k) not in ('string', 'null')
      ) as bad_type,
      char_length(f.t_raw) > 1000 as t_long, char_length(f.m_raw) > 1000 as m_long,
      char_length(f.x_raw) > 1000 as x_long, char_length(f.n_raw) > 1000 as n_long, char_length(f.p_raw) > 1000 as p_long,
      case when char_length(f.t_raw) <= 1000 then public.personal_clean(f.t_raw) end as term,
      case when char_length(f.m_raw) <= 1000 then public.personal_clean(f.m_raw) end as meaning,
      case when char_length(f.x_raw) <= 1000 then public.personal_clean(f.x_raw) end as example,
      case when char_length(f.n_raw) <= 1000 then public.personal_clean(f.n_raw) end as note,
      case when char_length(f.p_raw) <= 1000 then public.personal_clean(f.p_raw) end as pronunciation
    from f
  ),
  r as (
    select c.*,
      case
        when not c.is_obj then 'not_an_object'
        when c.bad_type then 'invalid_field'
        when c.t_long then 'term_too_long'
        when c.term is null then 'term_required'
        when char_length(c.term) > 120 then 'term_too_long'
        when c.m_long then 'meaning_too_long'
        when c.meaning is null then 'meaning_required'
        when char_length(c.meaning) > 300 then 'meaning_too_long'
        when c.x_long or char_length(c.example) > 300 then 'example_too_long'
        when c.n_long or char_length(c.note) > 300 then 'note_too_long'
        when c.p_long or char_length(c.pronunciation) > 100 then 'pronunciation_too_long'
      end as reason,
      lower(c.term) as term_key
    from c
  )
  select r.idx, r.term, r.term_key, r.meaning, r.example, r.note, r.pronunciation, r.reason,
    r.reason is null and row_number() over (partition by r.reason is null, r.term_key order by r.idx) > 1 as dup
  from r
  order by r.idx;
$$;

create or replace function public.import_personal_words(p_list_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_list public.personal_word_lists;
  v_log uuid;
  v_invalid jsonb;
  v_dups integer;
  v_valid integer;
  v_new integer;
  v_list_count integer;
  v_user_count integer;
  v_base integer;
  v_added integer;
  v_updated integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  perform public.personal_vocab_lock(v_uid);
  delete from public.personal_vocab_imports i where i.user_id = v_uid and i.created_at < v_now - interval '1 day';
  if (select count(*) from public.personal_vocab_imports i
      where i.user_id = v_uid and i.created_at > v_now - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  select l.* into v_list from public.personal_word_lists l where l.id = p_list_id and l.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'list_not_found';
  end if;

  -- The attempt is logged first (list_id and added are filled in on success); the failures below return an
  -- error object so that this row survives.
  insert into public.personal_vocab_imports (user_id, list_id, added, created_at)
  values (v_uid, v_list.id, 0, v_now) returning id into v_log;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_rows');
  end if;
  if jsonb_array_length(p_rows) > 1000 or octet_length(p_rows::text) > 600000 then
    return jsonb_build_object('ok', false, 'code', 'too_many_rows');
  end if;

  select (count(*) filter (where x.dup))::integer,
         (count(*) filter (where x.reason is null and not x.dup))::integer,
         (count(*) filter (where x.reason is null and not x.dup and not exists (
            select 1 from public.personal_words w where w.list_id = v_list.id and w.term_key = x.term_key)))::integer,
         coalesce(jsonb_agg(jsonb_build_object('index', x.idx, 'reason', x.reason) order by x.idx)
           filter (where x.reason is not null), '[]'::jsonb)
    into v_dups, v_valid, v_new, v_invalid
  from public.personal_parse_rows(p_rows) x;

  select count(*)::integer, coalesce(max(w.position), -1) + 1
    into v_list_count, v_base
  from public.personal_words w where w.list_id = v_list.id;
  select count(*)::integer into v_user_count from public.personal_words w where w.user_id = v_uid;
  if v_list_count + v_new > 1000 then
    return jsonb_build_object('ok', false, 'code', 'list_full');
  end if;
  if v_user_count + v_new > 5000 then
    return jsonb_build_object('ok', false, 'code', 'vocab_full');
  end if;

  insert into public.personal_words (list_id, user_id, position, term, term_key, meaning, example, note, pronunciation, due_at)
  select v_list.id, v_uid, v_base + (row_number() over (order by x.idx))::integer - 1,
         x.term, x.term_key, x.meaning, x.example, x.note, x.pronunciation, v_now
  from public.personal_parse_rows(p_rows) x
  where x.reason is null and not x.dup
    and not exists (select 1 from public.personal_words w where w.list_id = v_list.id and w.term_key = x.term_key)
  order by x.idx
  on conflict (list_id, term_key) do nothing;
  get diagnostics v_added = row_count;

  -- (c) an empty incoming example / note / pronunciation keeps the stored value.
  update public.personal_words w
  set term = x.term, meaning = x.meaning,
      example = coalesce(x.example, w.example), note = coalesce(x.note, w.note),
      pronunciation = coalesce(x.pronunciation, w.pronunciation)
  from public.personal_parse_rows(p_rows) x
  where w.list_id = v_list.id and w.term_key = x.term_key and x.reason is null and not x.dup
    and (w.term, w.meaning, w.example, w.note, w.pronunciation)
      is distinct from (x.term, x.meaning, coalesce(x.example, w.example), coalesce(x.note, w.note),
                        coalesce(x.pronunciation, w.pronunciation));
  get diagnostics v_updated = row_count;

  update public.personal_vocab_imports set added = v_added where id = v_log;

  return jsonb_build_object(
    'added', v_added,
    'updated', v_updated,
    'unchanged', greatest(0, v_valid - v_added - v_updated),
    'duplicates', v_dups,
    'invalid', v_invalid
  );
end;
$$;

revoke all on function public.personal_parse_rows(jsonb) from public, anon, authenticated;
