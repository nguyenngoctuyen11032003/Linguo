-- German (de) as the fourth learnable language: every language CHECK and RPC validation admits de (and still
-- rejects unknown codes), CEFR levels pre_a1..b2, goals, the goethe exam family end to end (scored like cefr:
-- per-section "đạt mức", no conversion), diagnostic level mapping.
-- Migration: 20261018210000_german.sql. Answer grading for de is covered by grading.test.sql / german_grading.
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- ===== Reference levels =====
select is((select array_agg(level_code order by ordinal) from public.level_reference_hours where language_code = 'de'),
  array['pre_a1', 'a1', 'a2', 'b1', 'b2'], 'de levels: pre_a1 then CEFR a1 → b2');
select is((select array_agg(cumulative_hours order by ordinal) from public.level_reference_hours where language_code = 'de'),
  array[0, 80, 200, 400, 650], 'de cumulative reference hours');
select is((select bool_or(reviewed) from public.level_reference_hours where language_code = 'de'), false, 'de reference hours are unreviewed');
select is((select count(*)::integer from public.level_reference_hours), 25, 'reference table: en 7 + ko 7 + ja 6 + de 5');
select throws_ok($$insert into public.level_reference_hours (language_code, level_code, ordinal, cumulative_hours, source)
  values ('zh', 'hsk1', 0, 0, 'x')$$, '23514', null, 'reference hours still reject other languages');

-- ===== Diagnostic level mapping (engine grid reaches ordinal 6; de tops out at 4) =====
select is(public.diagnostic_level_code('de', 0), 'pre_a1', 'de ordinal 0 → pre_a1');
select is(public.diagnostic_level_code('de', 3), 'b1', 'de ordinal 3 → b1');
select is(public.diagnostic_level_code('de', 4), 'b2', 'de ordinal 4 → b2');
select is(public.diagnostic_level_code('de', 6), 'b2', 'de ordinal 6 is clamped to b2');
select is(public.diagnostic_level_code('de', -1), 'pre_a1', 'negative ordinals clamp to the lowest level');
select is(public.diagnostic_level_code('en', 6), 'c2', 'en keeps its seventh level');
select is(public.diagnostic_level_code('ja', 6), 'n1', 'ja is still clamped to n1');
select is(public.diagnostic_level_code('de', null), null, 'null ordinal → null');
select is(public.diagnostic_level_ordinal('de', 'b2'), 4, 'de b2 has ordinal 4');
select is(public.diagnostic_level_ordinal('de', 'c1'), null, 'de has no c1');
select is((select id from public.assessments where key = 'de:assessment:diagnostic:v1' and is_published),
  '948332c6-641d-5f65-9ab5-1042ef993560'::uuid, 'published de diagnostic with its UUIDv5 id');
select is((select config from public.assessments where key = 'de:assessment:diagnostic:v1'),
  (select config from public.assessments where key = 'ko:assessment:diagnostic:v1'), 'de diagnostic config equals ko');
select is((select count(*)::integer from public.assessment_items where language_code = 'de'), 0, 'the de diagnostic bank ships empty');
select is(public.diagnostic_assessment_for('de'), '948332c6-641d-5f65-9ab5-1042ef993560'::uuid, 'diagnostic_assessment_for finds de');

-- ===== Content constraints (as the table owner, like the importer) =====
insert into public.content_sources (id, key, title, author_or_org, license, status, is_demo, content_hash)
values (md5('src:dx')::uuid, 'src:dx', 'DX test source', 'Linguo', 'own', 'published', true, md5('dx') || md5('dx#'));

select lives_ok($$insert into public.programs (id, key, source_id, language_code, title, description, kind, goal_types,
    level_from, level_to, order_index, status, is_demo, content_hash)
  values (md5('de:program:dx')::uuid, 'de:program:dx', md5('src:dx')::uuid, 'de', '{"vi": "Đức"}', '{"vi": "Mô tả"}', 'core',
    '{}', 'pre_a1', 'a1', 0, 'published', true, md5('p') || md5('p#'))$$, 'programs accept de');
select throws_ok($$insert into public.programs (id, key, source_id, language_code, title, description, kind, goal_types,
    level_from, level_to, order_index, status, is_demo, content_hash)
  values (md5('zh:program:dx')::uuid, 'zh:program:dx', md5('src:dx')::uuid, 'zh', '{"vi": "Trung"}', '{"vi": "Mô tả"}', 'core',
    '{}', 'pre_a1', 'a1', 0, 'published', true, md5('p') || md5('p#'))$$, '23514', null, 'programs reject other languages');
select lives_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('de:item:pgtap-tisch')::uuid, 'de:item:pgtap-tisch', md5('src:dx')::uuid, 'de', 'vocab', 'a1', 1,
    '{"text": "der Tisch, -e"}', '{"meaning": {"vi": "cái bàn"}}', 'published', true, md5('t') || md5('t#'))$$,
  'learning items accept de vocab');
select throws_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('de:item:pgtap-c1')::uuid, 'de:item:pgtap-c1', md5('src:dx')::uuid, 'de', 'vocab', 'c1', 1,
    '{"text": "x"}', '{"meaning": {"vi": "x"}}', 'published', true, md5('c') || md5('c#'))$$,
  '23503', null, 'a de item cannot use c1 (German stops at b2)');
select throws_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('de:item:pgtap-n5')::uuid, 'de:item:pgtap-n5', md5('src:dx')::uuid, 'de', 'vocab', 'n5', 1,
    '{"text": "x"}', '{"meaning": {"vi": "x"}}', 'published', true, md5('n') || md5('n#'))$$,
  '23503', null, 'a de item cannot use a JLPT level');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'exercises_answer_lang_check')) like '%''de''%',
  'exercises.answer_lang admits de');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'exercises_answer_lang_check')) like '%''ja''%',
  'exercises.answer_lang still admits ja');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'lessons_language_code_check')) like '%''de''%',
  'lessons.language_code admits de');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'assessment_items_language_code_check')) like '%''de''%',
  'assessment_items.language_code admits de');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'classes_language_code_check')) like '%''de''%',
  'classes.language_code admits de');
select is((select count(*)::integer from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '''ja''' and pg_get_constraintdef(c.oid) !~ '''de'''),
  0, 'no CHECK constraint lists ja without de');

-- ===== Exams: the goethe family belongs to de, scored like cefr =====
select lives_ok($$select content_private.import_exam_bundle(jsonb_build_object('bundle_version', 1, 'forms', jsonb_build_array(
  jsonb_build_object(
    'id', md5('de:exam:dx')::uuid, 'key', 'de:exam:dx', 'language_code', 'de', 'family', 'goethe',
    'title_vi', 'Goethe — Đề thử', 'description_vi', 'Bài luyện mô phỏng', 'level_from', 'a1', 'level_to', 'a2',
    'source_key', 'src:dx', 'time_limits', '{"listening": 20, "reading": 30}'::jsonb,
    'scoring', '{"verified": false, "source_note_vi": "Đạt khi đúng từ 60% mỗi phần", "section_max": {"listening": 30, "reading": 30},
      "bands": [], "pass_ratio": 0.6}'::jsonb,
    'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', md5('dx') || md5('dx#'),
    'questions', jsonb_build_array(
      jsonb_build_object('id', md5('de:examq:dx-l1')::uuid, 'key', 'de:examq:dx-l1', 'seq', 1, 'section', 'listening', 'kind', 'mcq',
        'question_type', 'goethe_listen_detail', 'level_code', 'a1', 'points', 2,
        'prompt', '{"instruction_vi": "Nghe và chọn.", "stem": "Wann beginnt der Kurs?", "stem_lang": "de", "audio_asset_id": null,
          "options": [{"id": "a", "text": "Um acht Uhr.", "lang": "de"}, {"id": "b", "text": "Um neun Uhr.", "lang": "de"}]}'::jsonb,
        'answer', '"a"'::jsonb, 'explanation', '{"vi": "Giải thích."}'::jsonb, 'script', 'Der Kurs beginnt um acht Uhr.',
        'rubric', null, 'sample_answer', null, 'content_hash', md5('l1') || md5('l1#')),
      jsonb_build_object('id', md5('de:examq:dx-r1')::uuid, 'key', 'de:examq:dx-r1', 'seq', 2, 'section', 'reading', 'kind', 'mcq',
        'question_type', 'goethe_read_detail', 'level_code', 'a2', 'points', 2,
        'prompt', '{"instruction_vi": "Chọn từ phù hợp.", "stem": "Ich ___ aus Vietnam.", "stem_lang": "de", "audio_asset_id": null,
          "options": [{"id": "a", "text": "kommst", "lang": "de"}, {"id": "b", "text": "komme", "lang": "de"}]}'::jsonb,
        'answer', '"b"'::jsonb, 'explanation', '{"vi": "Giải thích."}'::jsonb, 'script', null,
        'rubric', null, 'sample_answer', null, 'content_hash', md5('r1') || md5('r1#'))))
)))$$, 'a goethe form imports for de');
-- Second form: pass_ratio null falls back to the 0.6 module pass mark; five one-point reading questions.
select lives_ok($$select content_private.import_exam_bundle(jsonb_build_object('bundle_version', 1, 'forms', jsonb_build_array(
  jsonb_build_object(
    'id', md5('de:exam:dx2')::uuid, 'key', 'de:exam:dx2', 'language_code', 'de', 'family', 'goethe',
    'title_vi', 'Goethe B1 — Đề thử', 'description_vi', 'Bài luyện mô phỏng', 'level_from', 'b1', 'level_to', 'b1',
    'source_key', 'src:dx', 'time_limits', '{"reading": 30}'::jsonb,
    'scoring', '{"verified": false, "source_note_vi": "Đạt khi đúng từ 60% mỗi phần", "section_max": {"reading": 5},
      "bands": [], "pass_ratio": null}'::jsonb,
    'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', md5('dx2') || md5('dx2#'),
    'questions', (select jsonb_agg(jsonb_build_object(
        'id', md5('de:examq:dx2-r' || n)::uuid, 'key', 'de:examq:dx2-r' || n, 'seq', n, 'section', 'reading', 'kind', 'mcq',
        'question_type', 'goethe_read_detail', 'level_code', 'b1', 'points', 1,
        'prompt', '{"instruction_vi": "Chọn đáp án.", "stem": "Welcher Artikel passt?", "stem_lang": "de", "audio_asset_id": null,
          "options": [{"id": "a", "text": "der", "lang": "de"}, {"id": "b", "text": "die", "lang": "de"}]}'::jsonb,
        'answer', '"a"'::jsonb, 'explanation', '{"vi": "Giải thích."}'::jsonb, 'script', null,
        'rubric', null, 'sample_answer', null, 'content_hash', md5('q' || n) || md5('q' || n || '#')) order by n)
      from generate_series(1, 5) as n))
)))$$, 'a goethe form with pass_ratio null imports for de');
select is((select family from public.exam_forms where key = 'de:exam:dx'), 'goethe', 'goethe form stored');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'de:exam:bad', 'de', 'cefr', title_vi, description_vi, level_from, level_to, source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'de:exam:dx'$$,
  '23514', null, 'a de form cannot be CEFR (en only)');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'de:exam:bad2', 'de', 'jlpt', title_vi, description_vi, level_from, level_to, source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'de:exam:dx'$$,
  '23514', null, 'a de form cannot be JLPT');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'en:exam:bad', 'en', 'goethe', title_vi, description_vi, 'a1', 'a2', source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'de:exam:dx'$$,
  '23514', null, 'an en form cannot be goethe');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'de:exam:bad3', 'de', 'goethe', title_vi, description_vi, 'n5', level_to, source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'de:exam:dx'$$,
  '23503', null, 'a de form cannot use a JLPT level');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'de:exam:bad4', 'de', 'telc', title_vi, description_vi, level_from, level_to, source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'de:exam:dx'$$,
  '23514', null, 'unknown families are rejected');

select is(public.exam_structure_warning('goethe', 'goethe'), null, 'no warning for a Goethe goal and form');
select is(public.exam_structure_warning('goethe', 'cefr'),
  'Đề này không theo cấu trúc Goethe, khác mục tiêu Goethe của lộ trình. Kết quả chỉ để tham khảo.', 'warning for a Goethe goal and another family');
select is(public.exam_structure_warning('cefr', 'goethe'),
  'Đề này không theo khung CEFR, khác mục tiêu CEFR của lộ trình. Kết quả chỉ để tham khảo.', 'CEFR warning also fires for a goethe form');
select is(public.exam_structure_warning('foundation', 'goethe'), null, 'no warning for goals that name no exam');
select is(public.exam_structure_warning('jlpt', 'topik_i'),
  'Đề này không theo cấu trúc JLPT, khác mục tiêu JLPT của lộ trình. Kết quả chỉ để tham khảo.', 'JLPT warning unchanged');
select is(public.exam_structure_warning('topik_i', 'topik_ii'),
  'Đề này theo cấu trúc TOPIK II, khác mục tiêu TOPIK I của lộ trình. Kết quả chỉ để tham khảo.', 'TOPIK warnings unchanged');

-- ===== Users =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('d3a00000-0000-4000-8000-00000000000a', 'dx-a@test.dev', '{}'),
  ('d3a00000-0000-4000-8000-00000000000b', 'dx-b@test.dev', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d3a00000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);

-- ===== Learning paths =====
select throws_ok($$select public.create_learning_path('de', 'new', 'jlpt', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_goal_for_language', 'a de path cannot take the JLPT goal');
select throws_ok($$select public.create_learning_path('de', 'new', 'cefr', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_goal_for_language', 'a de path cannot take the en-only cefr goal');
select throws_ok($$select public.create_learning_path('en', 'new', 'goethe', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_goal_for_language', 'an en path cannot take the Goethe goal');
select throws_ok($$select public.create_learning_path('de', 'new', 'goethe', 'pre_a1', 'c1', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_level', 'de stops at b2: c1 is not a level');
select throws_ok($$select public.create_learning_path('de', 'some', 'goethe', 'b1', 'a2', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'target_not_above_current', 'A2 is below B1');
select throws_ok($$select public.create_learning_path('dd', 'new', 'goethe', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_language', 'dd is not a language code');
select lives_ok($$select public.create_learning_path('de', 'new', 'foundation', 'pre_a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])$$,
  'A creates a de path aiming at A2');
select is((select (estimate ->> 'hours_needed')::integer from public.learning_paths where language_code = 'de'), 200,
  'estimate uses the de reference hours');
select is((select array_agg(distinct level_code) from public.skill_estimates e join public.learning_paths p on p.id = e.learning_path_id
  where p.language_code = 'de'), array['pre_a1'], 'self-reported skill estimates start at pre_a1');
select lives_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])',
  (select id from public.learning_paths where language_code = 'de'), 'goethe', 'b1', '{30,30,30,30,30,30,30}'), 'goal can change to goethe');
select is((select goal_type from public.learning_paths where language_code = 'de'), 'goethe', 'goal stored');
select set_config('test.de_path', (select id::text from public.learning_paths where language_code = 'de'), true);

-- ===== Goethe full mock: no conversion, per-section "đạt mức" at 60% =====
select set_config('test.att', (public.start_exam(current_setting('test.de_path')::uuid, md5('de:exam:dx')::uuid, 'full') ->> 'attempt_id'), true);
select isnt(current_setting('test.att'), null, 'a de path starts a Goethe mock');
select lives_ok(format('select public.save_exam_answer(%L, %L, %L, false, gen_random_uuid())',
  current_setting('test.att'), md5('de:examq:dx-l1')::uuid, 'a'), 'listening answer saved (correct)');
select lives_ok(format('select public.save_exam_answer(%L, %L, %L, false, gen_random_uuid())',
  current_setting('test.att'), md5('de:examq:dx-r1')::uuid, 'a'), 'reading answer saved (wrong)');
select set_config('test.res', public.submit_exam(current_setting('test.att')::uuid)::text, true);
select is(current_setting('test.res')::jsonb ->> 'family', 'goethe', 'result family');
select is(current_setting('test.res')::jsonb ->> 'total', '2', 'raw total is kept (2 of 4 points)');
select is((current_setting('test.res')::jsonb -> 'by_section') -> 0 ->> 'scaled', null, 'no score conversion for goethe');
select is(current_setting('test.res')::jsonb -> 'estimated_level', 'null'::jsonb, 'no estimated level for goethe');
select is(current_setting('test.res')::jsonb -> 'cefr_sections',
  '[{"section": "listening", "level_code": "a2", "reached": true}, {"section": "reading", "level_code": "a2", "reached": false}]'::jsonb,
  'per-section judgement against the form level: listening 2/2 reached, reading 0/2 not');

-- pass_ratio null → 0.6: three of five reading points reach the level, exactly at the pass mark.
select set_config('test.att2', (public.start_exam(current_setting('test.de_path')::uuid, md5('de:exam:dx2')::uuid, 'full') ->> 'attempt_id'), true);
select lives_ok($$select public.save_exam_answer(current_setting('test.att2')::uuid, md5('de:examq:dx2-r' || n)::uuid,
  case when n <= 3 then 'a' else 'b' end, false, gen_random_uuid()) from generate_series(1, 5) as n$$, 'five reading answers saved');
select set_config('test.res2', public.submit_exam(current_setting('test.att2')::uuid)::text, true);
select is(current_setting('test.res2')::jsonb -> 'cefr_sections',
  '[{"section": "reading", "level_code": "b1", "reached": true}]'::jsonb, '3/5 = 0.6 reaches the level when pass_ratio is null');
select is(current_setting('test.res2')::jsonb -> 'estimated_level', 'null'::jsonb, 'still no estimated level');

-- ===== Personal vocabulary =====
select lives_ok($$select public.create_personal_list('Từ tiếng Đức', 'de')$$, 'a de personal list');
select is((select language_code from public.personal_word_lists where name = 'Từ tiếng Đức'), 'de', 'stored as de');
select throws_ok($$select public.create_personal_list('Khác', 'zh')$$, 'P0001', 'invalid_language', 'other languages still rejected');

-- ===== Exam form listing for de =====
select is((select jsonb_array_length(public.list_exam_forms('de'))), 2, 'de lists its Goethe forms');
select is((select array_agg(f ->> 'family') from jsonb_array_elements(public.list_exam_forms('de')) f), array['goethe', 'goethe'],
  'listed with the goethe family');
select is((select jsonb_array_length(public.list_exam_forms('ja'))), 0, 'no ja forms leak into the de listing');

select * from finish();
rollback;
