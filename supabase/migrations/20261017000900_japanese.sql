-- Japanese (ja) as the third learnable language: plumbing only, no content (content/ja ships separately).
-- Levels: kana (ordinal 0), then JLPT n5, n4, n3, n2, n1 (ordinals 1–5). Goals: kana_basics, communication,
-- jlpt, skill_focus. Exam family: jlpt (scaled and banded like TOPIK full mocks).
-- Every CHECK and RPC validation that restricted a language to en|ko now also admits ja; functions are
-- recreated from their latest definitions:
--   learning_path_validate   20261013000200_learning_paths.sql
--   create_personal_list     20261016000300_personal_vocab.sql
--   exam_structure_warning   20261015000200_exams.sql
--   exam_build_result        20261015000200_exams.sql
--   list_exam_forms          20261015000200_exams.sql
--   diagnostic_level_code    20261014000420_diagnostic_rpc.sql (clamped to the language's highest ordinal:
--                            ja has 6 levels, the engine's θ grid goes up to ordinal 6)
-- The web app hides ja until LANGUAGES.ja.available is flipped (packages/shared/src/constants.ts).

-- ---------------------------------------------------------------------------
-- Reference hours (unreviewed, like en/ko) and learning paths
-- ---------------------------------------------------------------------------
alter table public.level_reference_hours drop constraint level_reference_hours_language_code_check;
alter table public.level_reference_hours add constraint level_reference_hours_language_code_check
  check (language_code in ('en', 'ko', 'ja'));

insert into public.level_reference_hours (language_code, level_code, ordinal, cumulative_hours, source) values
  ('ja', 'kana', 0, 0, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ja', 'n5', 1, 150, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ja', 'n4', 2, 350, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ja', 'n3', 3, 700, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ja', 'n2', 4, 1300, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt'),
  ('ja', 'n1', 5, 2200, 'Ước lượng tham khảo theo FSI (ngôn ngữ nhóm IV) — chưa kiểm duyệt');

alter table public.learning_paths drop constraint learning_paths_language_code_check;
alter table public.learning_paths add constraint learning_paths_language_code_check
  check (language_code in ('en', 'ko', 'ja'));
alter table public.learning_paths drop constraint learning_paths_goal_matches_language;
alter table public.learning_paths add constraint learning_paths_goal_matches_language check (
  (language_code = 'en' and goal_type in ('foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'))
  or (language_code = 'ko' and goal_type in ('hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'))
  or (language_code = 'ja' and goal_type in ('kana_basics', 'communication', 'jlpt', 'skill_focus'))
);

create or replace function public.learning_path_validate(
  p_language text, p_goal_type text, p_current_level text, p_target_level text,
  p_weekly_minutes smallint[], p_target_date date, p_today date
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cur smallint;
  v_tgt smallint;
begin
  if p_language is null or p_language not in ('en', 'ko', 'ja') then
    raise exception using errcode = 'P0001', message = 'invalid_language';
  end if;
  if p_goal_type is null or not (
    (p_language = 'en' and p_goal_type in ('foundation', 'daily_communication', 'work_it', 'reading_docs', 'cefr'))
    or (p_language = 'ko' and p_goal_type in ('hangul_basics', 'communication', 'topik_i', 'topik_ii', 'skill_focus'))
    or (p_language = 'ja' and p_goal_type in ('kana_basics', 'communication', 'jlpt', 'skill_focus'))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_goal_for_language';
  end if;
  select ordinal into v_cur from public.level_reference_hours where language_code = p_language and level_code = p_current_level;
  select ordinal into v_tgt from public.level_reference_hours where language_code = p_language and level_code = p_target_level;
  if v_cur is null or v_tgt is null then
    raise exception using errcode = 'P0001', message = 'invalid_level';
  end if;
  if v_tgt <= v_cur then
    raise exception using errcode = 'P0001', message = 'target_not_above_current';
  end if;
  if (p_goal_type = 'topik_i' and p_target_level not in ('topik1', 'topik2'))
     or (p_goal_type = 'topik_ii' and p_target_level not in ('topik3', 'topik4', 'topik5', 'topik6')) then
    raise exception using errcode = 'P0001', message = 'target_not_allowed_for_goal';
  end if;
  if p_weekly_minutes is null
     or coalesce(array_ndims(p_weekly_minutes), 0) <> 1
     or coalesce(array_length(p_weekly_minutes, 1), 0) <> 7
     or exists (select 1 from unnest(p_weekly_minutes) as m where m is null or m < 0 or m > 720)
     or (select sum(m) from unnest(p_weekly_minutes) as m) <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_schedule';
  end if;
  if p_target_date is not null and p_target_date < p_today then
    raise exception using errcode = 'P0001', message = 'target_date_in_past';
  end if;
  if p_target_date is not null and p_target_date > p_today + 3650 then
    raise exception using errcode = 'P0001', message = 'target_date_too_far';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Content: programs, lessons, learning items (+ 'kana' item type), exercises (answer_lang)
-- ---------------------------------------------------------------------------
alter table public.programs drop constraint programs_language_code_check;
alter table public.programs add constraint programs_language_code_check check (language_code in ('en', 'ko', 'ja'));
alter table public.lessons drop constraint lessons_language_code_check;
alter table public.lessons add constraint lessons_language_code_check check (language_code in ('en', 'ko', 'ja'));
alter table public.learning_items drop constraint learning_items_language_code_check;
alter table public.learning_items add constraint learning_items_language_code_check check (language_code in ('en', 'ko', 'ja'));
alter table public.learning_items drop constraint learning_items_item_type_check;
alter table public.learning_items add constraint learning_items_item_type_check
  check (item_type in ('vocab', 'phrase', 'grammar_point', 'hangul', 'kana'));
alter table public.exercises drop constraint exercises_answer_lang_check;
alter table public.exercises add constraint exercises_answer_lang_check check (answer_lang in ('en', 'ko', 'ja', 'vi'));

-- ---------------------------------------------------------------------------
-- Diagnostic: assessments and items; one published (empty) ja diagnostic so the bank can be imported
-- ---------------------------------------------------------------------------
alter table public.assessments drop constraint assessments_language_code_check;
alter table public.assessments add constraint assessments_language_code_check check (language_code in ('en', 'ko', 'ja'));
alter table public.assessment_items drop constraint assessment_items_language_code_check;
alter table public.assessment_items add constraint assessment_items_language_code_check check (language_code in ('en', 'ko', 'ja'));

-- id = UUIDv5('ja:assessment:diagnostic:v1') under CONTENT_UUID_NAMESPACE (packages/shared/src/content/bundle.ts).
insert into public.assessments (id, key, language_code, assessment_type, version, is_published, config) values
  ('e2e238cc-15ec-51e0-b757-54a0b80b4ed4', 'ja:assessment:diagnostic:v1', 'ja', 'diagnostic', 1, true,
   '{"cooldown_days": 14, "abandon_days": 7, "max_items": 30, "foundation_max_items": 8, "foundation_max_b": 1.5,
     "prior_sd": 1.25, "stop_sd": 0.45, "min_items": 4, "max_items_per_skill": 8, "max_items_reading": 5,
     "rapid_ms": 800, "rapid_share": 0.3}');

create or replace function public.diagnostic_level_code(p_language text, p_ordinal integer)
returns text
language sql
stable
set search_path = ''
as $$
  select h.level_code from public.level_reference_hours h
  where p_ordinal is not null and h.language_code = p_language
    and h.ordinal = least(greatest(p_ordinal, 0),
      (select max(m.ordinal) from public.level_reference_hours m where m.language_code = p_language));
$$;

-- ---------------------------------------------------------------------------
-- Exams: ja forms of the jlpt family
-- ---------------------------------------------------------------------------
alter table public.exam_forms drop constraint exam_forms_language_code_check;
alter table public.exam_forms add constraint exam_forms_language_code_check check (language_code in ('en', 'ko', 'ja'));
alter table public.exam_forms drop constraint exam_forms_family_check;
alter table public.exam_forms add constraint exam_forms_family_check check (family in ('topik_i', 'topik_ii', 'cefr', 'jlpt'));
alter table public.exam_forms drop constraint exam_forms_family_language;
alter table public.exam_forms add constraint exam_forms_family_language check (
  (family = 'cefr' and language_code = 'en')
  or (family in ('topik_i', 'topik_ii') and language_code = 'ko')
  or (family = 'jlpt' and language_code = 'ja')
);

create or replace function public.exam_structure_warning(p_goal_type text, p_family text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_goal_type = 'topik_ii' and p_family = 'topik_i' then
      'Đề này theo cấu trúc TOPIK I, khác mục tiêu TOPIK II của lộ trình. Kết quả chỉ để tham khảo.'
    when p_goal_type = 'topik_i' and p_family = 'topik_ii' then
      'Đề này theo cấu trúc TOPIK II, khác mục tiêu TOPIK I của lộ trình. Kết quả chỉ để tham khảo.'
    when p_goal_type = 'cefr' and p_family <> 'cefr' then
      'Đề này không theo khung CEFR, khác mục tiêu CEFR của lộ trình. Kết quả chỉ để tham khảo.'
    when p_goal_type = 'jlpt' and p_family <> 'jlpt' then
      'Đề này không theo cấu trúc JLPT, khác mục tiêu JLPT của lộ trình. Kết quả chỉ để tham khảo.'
  end;
$$;

-- JLPT full mocks are scaled to section_max and banded like TOPIK ("quy đổi tham khảo").
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
               where public.exam_normalize_text(ans.answer) <> ''
                 and public.exam_normalize_text(acc.t) = public.exam_normalize_text(ans.answer)
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
         case when v_form.family = 'cefr' and v_att.mode <> 'question_type'
                   and jsonb_typeof(v_form.scoring -> 'pass_ratio') = 'number' then
           coalesce(jsonb_agg(jsonb_build_object(
               'section', sc.section, 'level_code', v_form.level_to,
               'reached', sc.points / sc.max >= (v_form.scoring ->> 'pass_ratio')::numeric
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

create or replace function public.list_exam_forms(p_language text)
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
    select jsonb_agg(jsonb_build_object(
        'form_id', f.id,
        'key', f.key,
        'language_code', f.language_code,
        'family', f.family,
        'title_vi', f.title_vi,
        'description_vi', f.description_vi,
        'level_from', f.level_from,
        'level_to', f.level_to,
        'is_demo', f.is_demo,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
              'section', s.section, 'question_count', s.n,
              'minutes', case when jsonb_typeof(f.time_limits -> s.section) = 'number' then (f.time_limits ->> s.section)::integer end
            ) order by array_position(array['listening', 'reading', 'writing'], s.section))
          from (
            select q.section, count(*) as n from public.exam_questions q
            where q.form_id = f.id and q.status = 'published' group by q.section
          ) as s
        ), '[]'::jsonb),
        'question_types', coalesce((
          select jsonb_agg(jsonb_build_object('question_type', t.question_type, 'section', t.section, 'count', t.n)
            order by array_position(array['listening', 'reading', 'writing'], t.section), t.question_type)
          from (
            select q.question_type, q.section, count(*) as n from public.exam_questions q
            where q.form_id = f.id and q.status = 'published' group by q.question_type, q.section
          ) as t
        ), '[]'::jsonb),
        'scoring_verified', coalesce((f.scoring ->> 'verified')::boolean, false),
        'last_attempt', (
          select jsonb_build_object('attempt_id', a.id, 'submitted_at', a.submitted_at,
                                    'total', a.result -> 'total', 'max', a.result -> 'max')
          from public.exam_attempts a
          where a.user_id = v_uid and a.form_id = f.id and a.status <> 'in_progress'
          order by a.submitted_at desc, a.id
          limit 1
        )
      ) order by array_position(array['topik_i', 'topik_ii', 'cefr', 'jlpt'], f.family), f.key)
    from public.exam_forms f
    where f.language_code = p_language and f.status = 'published'
      and exists (select 1 from public.exam_questions q where q.form_id = f.id and q.status = 'published')
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Personal vocabulary lists
-- ---------------------------------------------------------------------------
alter table public.personal_word_lists drop constraint personal_word_lists_language_code_check;
alter table public.personal_word_lists add constraint personal_word_lists_language_code_check
  check (language_code in ('en', 'ko', 'ja'));

create or replace function public.create_personal_list(p_name text, p_language text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.personal_clean(p_name);
  v_list public.personal_word_lists;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if p_language is null or p_language not in ('en', 'ko', 'ja') then
    raise exception using errcode = 'P0001', message = 'invalid_language';
  end if;
  perform public.personal_vocab_lock(v_uid);
  if (select count(*) from public.personal_word_lists l where l.user_id = v_uid) >= 20 then
    raise exception using errcode = 'P0001', message = 'list_limit';
  end if;
  begin
    insert into public.personal_word_lists (user_id, name, language_code)
    values (v_uid, v_name, p_language)
    returning * into v_list;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'name_taken';
  end;
  return jsonb_build_object('id', v_list.id, 'name', v_list.name, 'language_code', v_list.language_code,
    'word_count', 0, 'due_count', 0, 'created_at', v_list.created_at);
end;
$$;
