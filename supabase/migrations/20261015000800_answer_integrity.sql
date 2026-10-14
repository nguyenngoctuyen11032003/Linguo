-- Answer integrity (review findings B5 and B6) for submit_exercise.
--
-- B5: p_client_at (the time an answer was given offline) was trusted for up to 7 days back, so a learner who
-- missed a day could answer today with a client_at of yesterday and repair the streak or collect that day's XP
-- cap again. An answer cannot predate the run it belongs to, so a client_at before the run started is ignored
-- (the answer counts on the server day) and a client_at in the future is clamped to now. Genuine offline replays
-- keep their day, because the run already existed when they were answered.
--
-- B6: an answer was graded against any historical answer-key version, so a client that had cached version 1
-- could still be graded by a key that a content fix had since replaced. Only the current key grades an answer;
-- an older key is accepted solely for an offline replay that was answered before the current key was published
-- (p_client_at earlier than that key's created_at). Anything else raises exercise_version_mismatch, which the
-- lesson player already handles by reloading the lesson.
--
-- Every other line is the definition of 20261014000200_lesson_runs.sql.

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

  -- B5: an answer cannot predate its run, and cannot come from the future.
  v_client_at := case when p_client_at is not null and p_client_at >= v_run.started_at then least(p_client_at, v_now) end;

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
