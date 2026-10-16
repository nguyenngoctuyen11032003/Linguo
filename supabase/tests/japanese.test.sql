-- Japanese (ja) as the third learnable language: every language CHECK and RPC validation admits ja (and still
-- rejects unknown codes), JLPT levels and goals, the jlpt exam family end to end, diagnostic level mapping.
-- Migration: 20261018100000_japanese.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- ===== Reference levels =====
select is((select array_agg(level_code order by ordinal) from public.level_reference_hours where language_code = 'ja'),
  array['kana', 'n5', 'n4', 'n3', 'n2', 'n1'], 'ja levels: kana then JLPT N5 → N1');
select is((select bool_or(reviewed) from public.level_reference_hours where language_code = 'ja'), false, 'ja reference hours are unreviewed');
select throws_ok($$insert into public.level_reference_hours (language_code, level_code, ordinal, cumulative_hours, source)
  values ('zh', 'hsk1', 0, 0, 'x')$$, '23514', null, 'reference hours reject other languages');

-- ===== Diagnostic level mapping (engine grid reaches ordinal 6; ja tops out at 5) =====
select is(public.diagnostic_level_code('ja', 0), 'kana', 'ja ordinal 0 → kana');
select is(public.diagnostic_level_code('ja', 3), 'n3', 'ja ordinal 3 → n3');
select is(public.diagnostic_level_code('ja', 6), 'n1', 'ja ordinal 6 is clamped to n1');
select is(public.diagnostic_level_code('ja', -1), 'kana', 'negative ordinals clamp to the lowest level');
select is(public.diagnostic_level_code('ko', 6), 'topik6', 'ko keeps its seventh level');
select is(public.diagnostic_level_code('en', 6), 'c2', 'en keeps its seventh level');
select is(public.diagnostic_level_code('ja', null), null, 'null ordinal → null');
select is(public.diagnostic_level_code('zh', 1), null, 'unknown language → null');
select is((select id from public.assessments where key = 'ja:assessment:diagnostic:v1' and is_published),
  'e2e238cc-15ec-51e0-b757-54a0b80b4ed4'::uuid, 'published ja diagnostic with its UUIDv5 id');
select is((select config from public.assessments where key = 'ja:assessment:diagnostic:v1'),
  (select config from public.assessments where key = 'ko:assessment:diagnostic:v1'), 'ja diagnostic config equals ko');

-- ===== Content constraints (as the table owner, like the importer) =====
insert into public.content_sources (id, key, title, author_or_org, license, status, is_demo, content_hash)
values (md5('src:jx')::uuid, 'src:jx', 'JX test source', 'Linguo', 'own', 'published', true, md5('jx') || md5('jx#'));

select lives_ok($$insert into public.programs (id, key, source_id, language_code, title, description, kind, goal_types,
    level_from, level_to, order_index, status, is_demo, content_hash)
  values (md5('ja:program:jx')::uuid, 'ja:program:jx', md5('src:jx')::uuid, 'ja', '{"vi": "Nhật"}', '{"vi": "Mô tả"}', 'core',
    '{}', 'kana', 'n5', 0, 'published', true, md5('p') || md5('p#'))$$, 'programs accept ja');
select throws_ok($$insert into public.programs (id, key, source_id, language_code, title, description, kind, goal_types,
    level_from, level_to, order_index, status, is_demo, content_hash)
  values (md5('zh:program:jx')::uuid, 'zh:program:jx', md5('src:jx')::uuid, 'zh', '{"vi": "Trung"}', '{"vi": "Mô tả"}', 'core',
    '{}', 'kana', 'n5', 0, 'published', true, md5('p') || md5('p#'))$$, '23514', null, 'programs reject other languages');
select lives_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('ja:item:a')::uuid, 'ja:item:a', md5('src:jx')::uuid, 'ja', 'kana', 'kana', 1,
    '{"text": "あ", "romanization": "a"}', '{"meaning": {"vi": "chữ a"}}', 'published', true, md5('i') || md5('i#'))$$,
  'learning items accept ja kana items');
select lives_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('ja:item:pgtap-gakkou')::uuid, 'ja:item:pgtap-gakkou', md5('src:jx')::uuid, 'ja', 'vocab', 'n5', 1,
    '{"text": "学校", "reading": "がっこう"}', '{"meaning": {"vi": "trường học"}}', 'published', true, md5('g') || md5('g#'))$$,
  'learning items accept ja vocab with a reading');
select throws_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('ja:item:b')::uuid, 'ja:item:b', md5('src:jx')::uuid, 'ja', 'vocab', 'topik1', 1,
    '{"text": "x"}', '{"meaning": {"vi": "x"}}', 'published', true, md5('i') || md5('i#'))$$,
  '23503', null, 'a ja item cannot use a TOPIK level');
select throws_ok($$insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty,
    front, back, status, is_demo, content_hash)
  values (md5('ja:item:c')::uuid, 'ja:item:c', md5('src:jx')::uuid, 'ja', 'kanji', 'n5', 1,
    '{"text": "x"}', '{"meaning": {"vi": "x"}}', 'published', true, md5('i') || md5('i#'))$$,
  '23514', null, 'unknown item types are still rejected');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'exercises_answer_lang_check')) like '%''ja''%',
  'exercises.answer_lang admits ja');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'lessons_language_code_check')) like '%''ja''%',
  'lessons.language_code admits ja');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'assessment_items_language_code_check')) like '%''ja''%',
  'assessment_items.language_code admits ja');
select is((select count(*)::integer from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '''ko''' and pg_get_constraintdef(c.oid) !~ '''ja'''),
  0, 'no CHECK constraint lists ko without ja');

-- ===== Exams: the jlpt family belongs to ja =====
select lives_ok($$select content_private.import_exam_bundle(jsonb_build_object('bundle_version', 1, 'forms', jsonb_build_array(
  jsonb_build_object(
    'id', md5('ja:exam:jx')::uuid, 'key', 'ja:exam:jx', 'language_code', 'ja', 'family', 'jlpt',
    'title_vi', 'JLPT — Đề thử', 'description_vi', 'Bài luyện mô phỏng', 'level_from', 'n4', 'level_to', 'n3',
    'source_key', 'src:jx', 'time_limits', '{"listening": 20, "reading": 30}'::jsonb,
    'scoring', '{"verified": false, "source_note_vi": "Thang tham khảo", "section_max": {"listening": 60, "reading": 120},
      "bands": [{"level_code": "n4", "min_total": 90}, {"level_code": "n3", "min_total": 95}], "pass_ratio": null}'::jsonb,
    'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', md5('jx') || md5('jx#'),
    'questions', jsonb_build_array(
      jsonb_build_object('id', md5('ja:examq:jx-l1')::uuid, 'key', 'ja:examq:jx-l1', 'seq', 1, 'section', 'listening', 'kind', 'mcq',
        'question_type', 'jlpt_listen_response', 'level_code', 'n4', 'points', 2,
        'prompt', '{"instruction_vi": "Nghe và chọn.", "stem": "正しい答えを選んでください。", "stem_lang": "ja", "audio_asset_id": null,
          "options": [{"id": "a", "text": "はい", "lang": "ja"}, {"id": "b", "text": "いいえ", "lang": "ja"}]}'::jsonb,
        'answer', '"a"'::jsonb, 'explanation', '{"vi": "Giải thích."}'::jsonb, 'script', '男: 傘がありますか。',
        'rubric', null, 'sample_answer', null, 'content_hash', md5('l1') || md5('l1#')),
      jsonb_build_object('id', md5('ja:examq:jx-r1')::uuid, 'key', 'ja:examq:jx-r1', 'seq', 2, 'section', 'reading', 'kind', 'mcq',
        'question_type', 'jlpt_read_grammar', 'level_code', 'n3', 'points', 2,
        'prompt', '{"instruction_vi": "Chọn từ phù hợp.", "stem": "（＿）に入るものを選んでください。", "stem_lang": "ja", "audio_asset_id": null,
          "options": [{"id": "a", "text": "降っても", "lang": "ja"}, {"id": "b", "text": "降ったら", "lang": "ja"}]}'::jsonb,
        'answer', '"b"'::jsonb, 'explanation', '{"vi": "Giải thích."}'::jsonb, 'script', null,
        'rubric', null, 'sample_answer', null, 'content_hash', md5('r1') || md5('r1#'))))
)))$$, 'a jlpt form imports for ja');
select is((select family from public.exam_forms where key = 'ja:exam:jx'), 'jlpt', 'jlpt form stored');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'ja:exam:bad', 'ja', 'topik_i', title_vi, description_vi, level_from, level_to, source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'ja:exam:jx'$$,
  '23514', null, 'a ja form cannot be TOPIK');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'en:exam:bad', 'en', 'jlpt', title_vi, description_vi, 'a1', 'a2', source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'ja:exam:jx'$$,
  '23514', null, 'an en form cannot be JLPT');
select throws_ok($$insert into public.exam_forms (id, key, language_code, family, title_vi, description_vi, level_from, level_to,
    source_id, time_limits, scoring, status, is_demo, content_hash)
  select gen_random_uuid(), 'ja:exam:bad2', 'ja', 'hsk', title_vi, description_vi, level_from, level_to, source_id, time_limits,
    scoring, status, is_demo, content_hash from public.exam_forms where key = 'ja:exam:jx'$$,
  '23514', null, 'unknown families are rejected');

select is(public.exam_structure_warning('jlpt', 'jlpt'), null, 'no warning for a JLPT goal and form');
select is(public.exam_structure_warning('jlpt', 'topik_i'),
  'Đề này không theo cấu trúc JLPT, khác mục tiêu JLPT của lộ trình. Kết quả chỉ để tham khảo.', 'warning for a JLPT goal and another family');
select is(public.exam_structure_warning('topik_i', 'topik_ii'),
  'Đề này theo cấu trúc TOPIK II, khác mục tiêu TOPIK I của lộ trình. Kết quả chỉ để tham khảo.', 'TOPIK warnings unchanged');

-- ===== Users =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1a00000-0000-4000-8000-00000000000a', 'jx-a@test.dev', '{}'),
  ('a1a00000-0000-4000-8000-00000000000b', 'jx-b@test.dev', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a1a00000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);

-- ===== Learning paths =====
select throws_ok($$select public.create_learning_path('ja', 'new', 'topik_i', 'kana', 'n5', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_goal_for_language', 'a ja path cannot take a TOPIK goal');
select throws_ok($$select public.create_learning_path('ko', 'new', 'jlpt', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_goal_for_language', 'a ko path cannot take the JLPT goal');
select throws_ok($$select public.create_learning_path('ja', 'new', 'jlpt', 'kana', 'topik2', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_level', 'ja levels only');
select throws_ok($$select public.create_learning_path('ja', 'some', 'jlpt', 'n3', 'n4', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'target_not_above_current', 'N4 is below N3');
select throws_ok($$select public.create_learning_path('jp', 'new', 'jlpt', 'kana', 'n5', array[30,30,30,30,30,30,30]::smallint[])$$,
  'P0001', 'invalid_language', 'jp is not a language code');
select lives_ok($$select public.create_learning_path('ja', 'new', 'jlpt', 'kana', 'n4', array[30,30,30,30,30,30,30]::smallint[])$$,
  'A creates a ja path aiming at JLPT N4');
select is((select (estimate ->> 'hours_needed')::integer from public.learning_paths where language_code = 'ja'), 350,
  'estimate uses the ja reference hours');
select is((select array_agg(distinct level_code) from public.skill_estimates e join public.learning_paths p on p.id = e.learning_path_id
  where p.language_code = 'ja'), array['kana'], 'self-reported skill estimates start at kana');
select lives_ok(format('select public.update_learning_path_plan(%L, %L, %L, %L::smallint[])',
  (select id from public.learning_paths where language_code = 'ja'), 'kana_basics', 'n5', '{30,30,30,30,30,30,30}'), 'goal can change to kana_basics');
select set_config('test.ja_path', (select id::text from public.learning_paths where language_code = 'ja'), true);

-- ===== JLPT full mock: scaled to section_max and banded like TOPIK =====
select set_config('test.att', (public.start_exam(current_setting('test.ja_path')::uuid, md5('ja:exam:jx')::uuid, 'full') ->> 'attempt_id'), true);
select isnt(current_setting('test.att'), null, 'a ja path starts a JLPT mock');
select is((select count(*)::integer from public.exam_attempts where id = current_setting('test.att')::uuid), 1, 'attempt stored');
select lives_ok(format('select public.save_exam_answer(%L, %L, %L, false, gen_random_uuid())',
  current_setting('test.att'), md5('ja:examq:jx-l1')::uuid, 'a'), 'listening answer saved');
select lives_ok(format('select public.save_exam_answer(%L, %L, %L, false, gen_random_uuid())',
  current_setting('test.att'), md5('ja:examq:jx-r1')::uuid, 'b'), 'reading answer saved');
select set_config('test.res', public.submit_exam(current_setting('test.att')::uuid)::text, true);
select is(current_setting('test.res')::jsonb ->> 'family', 'jlpt', 'result family');
select is((current_setting('test.res')::jsonb -> 'by_section') -> 0 ->> 'scaled', '60.0', 'listening scaled to 60');
select is((current_setting('test.res')::jsonb -> 'by_section') -> 1 ->> 'scaled', '120.0', 'reading scaled to 120');
select is(current_setting('test.res')::jsonb #>> '{estimated_level,level_code}', 'n3', 'scaled total 180 reaches the n3 band');
select is(current_setting('test.res')::jsonb -> 'cefr_sections', 'null'::jsonb, 'no CEFR judgement for JLPT');

-- ===== Personal vocabulary =====
select lives_ok($$select public.create_personal_list('Từ tiếng Nhật', 'ja')$$, 'a ja personal list');
select is((select language_code from public.personal_word_lists where name = 'Từ tiếng Nhật'), 'ja', 'stored as ja');
select throws_ok($$select public.create_personal_list('Khác', 'zh')$$, 'P0001', 'invalid_language', 'other languages still rejected');

-- ===== Exam form listing for ja =====
select is((select jsonb_array_length(public.list_exam_forms('ja'))), 1, 'ja lists its JLPT form');

select * from finish();
rollback;
