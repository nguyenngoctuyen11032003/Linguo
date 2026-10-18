-- German exam short_text grading. exam_normalize_text (20261015000200_exams.sql) does not fold umlauts, so a
-- learner typing fuer for the u-umlaut word in a German exam short answer was marked wrong, unlike exercise
-- grading (grading_normalize, 20261018205000_german_grading.sql), which folds ae-oe-ue-ss digraph equivalents.
--  * New exam_normalize_text(p_text, p_lang): the existing one-argument normalisation (NFC, whitespace, trailing
--    punctuation, lower-case under pg_c_utf8), then for p_lang = 'de' only: a-umlaut -> ae, o-umlaut -> oe,
--    u-umlaut -> ue, eszett -> ss. It runs after lower-casing, so capital umlauts and the capital eszett (U+1E9E)
--    fold too. Spaces are kept; dotless forms (fur, schon) stay different from the umlaut forms. Any other
--    language gives exactly the one-argument result. The one-argument function is left unchanged.
--  * exam_build_result is recreated from its latest definition (20261018210000_german.sql) with one change: the
--    short_text comparison calls the two-argument function with the form's language_code, on the learner answer
--    and on each accepted answer. mcq, essay, scoring and everything else are untouched. submit_exam /
--    exam_close_attempt call exam_build_result, so they pick the change up without being redefined.
-- Mirror of normalizeExamText / gradeExamAnswer (language argument) in packages/shared/src/exam/grading.ts; both
-- are checked against grading.fixtures.json (supabase/tests/exam_grading.test.sql is generated from it).
-- create or replace keeps the owner and grants of exam_build_result; the new function gets the same revoke as
-- exam_normalize_text (internal helper, not callable by API roles).

create or replace function public.exam_normalize_text(p_text text, p_lang text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text collate pg_catalog.pg_c_utf8;
begin
  if p_text is null then
    return null;
  end if;
  v := public.exam_normalize_text(p_text);
  if p_lang = 'de' then
    -- v is NFC and lower-case here, so the capitals are already folded to lower case.
    v := replace(replace(replace(replace(v, chr(228), 'ae'), chr(246), 'oe'), chr(252), 'ue'), chr(223), 'ss');
  end if;
  return v;
end;
$$;

revoke all on function public.exam_normalize_text(text, text) from public, anon, authenticated;

-- TOPIK and JLPT full mocks are scaled to section_max and banded ("quy đổi tham khảo"). cefr and goethe forms are
-- never converted: they get per-section cefr_sections ("đạt mức"), at scoring.pass_ratio (goethe: 0.6 when null,
-- the Goethe-Zertifikat module pass mark). Question-type drills get neither.
create or replace function public.exam_build_result(p_attempt_id uuid, p_status text, p_submitted_at timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_att public.exam_attempts;
  v_form public.exam_forms;
  v_review jsonb;
  v_by_section jsonb;
  v_by_type jsonb;
  v_topik_full boolean;
  v_scaled_total numeric;
  v_has_essay boolean;
  v_level text;
  v_estimated jsonb;
  v_cefr jsonb;
  v_total numeric;
  v_max numeric;
begin
  select a.* into v_att from public.exam_attempts a where a.id = p_attempt_id;
  select f.* into v_form from public.exam_forms f where f.id = v_att.form_id;
  v_topik_full := v_form.family in ('topik_i', 'topik_ii', 'jlpt') and v_att.mode = 'full';

  select coalesce(jsonb_agg(jsonb_build_object(
      'question_id', g.id,
      'seq', g.ord,
      'section', g.section,
      'kind', g.kind,
      'question_type', g.question_type,
      'points', g.points,
      'prompt', public.exam_served_prompt(g.prompt, g.script)
        || case when g.script is not null then jsonb_build_object('script', g.script) else '{}'::jsonb end,
      'answer', g.answer,
      'is_correct', g.is_correct,
      'correct_answer', case g.kind when 'mcq' then g.key_answer #>> '{}' when 'short_text' then g.key_answer ->> 0 end,
      'explanation', g.explanation,
      'rubric', g.rubric,
      'sample_answer', g.sample_answer
    ) order by g.ord), '[]'::jsonb)
  into v_review
  from (
    select q.id, u.ord, q.section, q.kind, q.question_type, q.points, q.prompt, k.script, ans.answer,
           k.answer as key_answer, k.explanation, k.rubric, k.sample_answer,
           case q.kind
             when 'essay' then null
             when 'mcq' then coalesce(ans.answer = (k.answer #>> '{}'), false)
             else coalesce(ans.answer is not null and exists (
               select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer) = 'array' then k.answer else '[]'::jsonb end) as acc(t)
               where public.exam_normalize_text(ans.answer, v_form.language_code) <> ''
                 and public.exam_normalize_text(acc.t, v_form.language_code) = public.exam_normalize_text(ans.answer, v_form.language_code)
             ), false)
           end as is_correct
    from unnest(v_att.question_ids) with ordinality as u(qid, ord)
    join public.exam_questions q on q.id = u.qid
    left join content_private.exam_keys k on k.question_id = q.id
    left join public.exam_answers ans on ans.attempt_id = v_att.id and ans.question_id = q.id
  ) as g;

  with r as (
    select e ->> 'section' as section, e ->> 'kind' as kind, (e ->> 'points')::numeric as pts,
           coalesce((e ->> 'is_correct')::boolean, false) as ok
    from jsonb_array_elements(v_review) as e
  ), s as (
    select r.section,
           sum(case when r.ok then r.pts else 0 end) as points,
           sum(case when r.kind <> 'essay' then r.pts else 0 end) as max,
           sum(case when r.kind = 'essay' then r.pts else 0 end) as essay_points,
           count(*) filter (where r.ok) as correct,
           count(*) filter (where r.kind <> 'essay') as total
    from r group by r.section
  ), sc as (
    select s.*,
           case when v_topik_full and jsonb_typeof(v_form.scoring -> 'section_max' -> s.section) = 'number' then
             round(coalesce(s.points / nullif(s.max + s.essay_points, 0), 0) * (v_form.scoring -> 'section_max' ->> s.section)::numeric, 1)
           end as scaled
    from s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'section', sc.section, 'points', sc.points, 'max', sc.max, 'correct', sc.correct, 'total', sc.total,
           'scaled', sc.scaled
         ) order by array_position(array['listening', 'reading', 'writing'], sc.section)), '[]'::jsonb),
         coalesce(sum(sc.points), 0), coalesce(sum(sc.max), 0), sum(sc.scaled),
         coalesce(sum(sc.essay_points) > 0, false),
         case when v_att.mode <> 'question_type'
                   and ((v_form.family = 'cefr' and jsonb_typeof(v_form.scoring -> 'pass_ratio') = 'number')
                        or v_form.family = 'goethe') then
           coalesce(jsonb_agg(jsonb_build_object(
               'section', sc.section, 'level_code', v_form.level_to,
               'reached', sc.points / sc.max >= coalesce((v_form.scoring ->> 'pass_ratio')::numeric, 0.6)
             ) order by array_position(array['listening', 'reading', 'writing'], sc.section))
             filter (where sc.max > 0), '[]'::jsonb)
         end
  into v_by_section, v_total, v_max, v_scaled_total, v_has_essay, v_cefr
  from sc;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_type', t.question_type, 'section', t.section, 'points', t.points, 'max', t.max,
           'correct', t.correct, 'total', t.total
         ) order by array_position(array['listening', 'reading', 'writing'], t.section), t.question_type), '[]'::jsonb)
  into v_by_type
  from (
    select e ->> 'question_type' as question_type, e ->> 'section' as section,
           sum(case when coalesce((e ->> 'is_correct')::boolean, false) then (e ->> 'points')::numeric else 0 end) as points,
           sum((e ->> 'points')::numeric) as max,
           count(*) filter (where coalesce((e ->> 'is_correct')::boolean, false)) as correct,
           count(*) as total
    from jsonb_array_elements(v_review) as e
    where e ->> 'kind' <> 'essay'
    group by 1, 2
  ) as t;

  if v_topik_full and jsonb_array_length(v_form.scoring -> 'bands') > 0 then
    v_scaled_total := round(coalesce(v_scaled_total, 0), 1);
    select b ->> 'level_code' into v_level
    from jsonb_array_elements(v_form.scoring -> 'bands') as b
    where (b ->> 'min_total')::numeric <= v_scaled_total
    order by (b ->> 'min_total')::numeric desc
    limit 1;
    v_estimated := jsonb_build_object(
      'level_code', v_level,
      'scaled_total', v_scaled_total,
      'label_vi', case when v_level is null then 'Chưa đạt bậc thấp nhất. ' else '' end
        || 'Quy đổi tham khảo, không phải kết quả chính thức.'
        || case when v_has_essay then ' Phần viết luận chưa tính điểm.' else '' end
    );
  end if;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'form_id', v_att.form_id,
    'form_title_vi', v_form.title_vi,
    'family', v_form.family,
    'mode', v_att.mode,
    'status', p_status,
    'started_at', v_att.started_at,
    'submitted_at', p_submitted_at,
    'total', v_total,
    'max', v_max,
    'by_section', v_by_section,
    'by_question_type', v_by_type,
    'estimated_level', v_estimated,
    'cefr_sections', v_cefr,
    'scoring_verified', coalesce((v_form.scoring ->> 'verified')::boolean, false),
    'scoring_source_vi', coalesce(v_form.scoring ->> 'source_note_vi', ''),
    'review', v_review
  );
end;
$$;
