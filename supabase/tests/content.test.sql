begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- ===== schema =====
select has_table('public', 'content_sources', 'content_sources exists');
select has_table('public', 'programs', 'programs exists');
select has_table('public', 'units', 'units exists');
select has_table('public', 'lessons', 'lessons exists');
select has_table('public', 'lesson_prerequisites', 'lesson_prerequisites exists');
select has_table('public', 'learning_items', 'learning_items exists');
select has_table('public', 'lesson_items', 'lesson_items exists');
select has_table('public', 'exercises', 'exercises exists');
select has_table('content_private', 'exercise_keys', 'content_private.exercise_keys exists');
select has_table('content_private', 'revisions', 'content_private.revisions exists');

-- ===== bundle =====
-- 1 source, 1 program, 1 unit, 1 item (draft), lessons L1 and L2 (L2 requires L1),
-- exercises E1 (mcq, L1), E2 (fill_blank, L1), E3 (translate, L2): 9 content rows.
select set_config('test.bundle', ($json${
  "bundle_version": 1,
  "git_sha": "pgtap",
  "sources": [
    {"id": "c0000000-0000-4000-8000-000000000001", "key": "src:pgtap-source", "title": "pgTAP", "author_or_org": "Linguo",
     "url": null, "license": "own", "attribution_required": false,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "1111111111111111111111111111111111111111111111111111111111111111"}
  ],
  "programs": [
    {"id": "c0000000-0000-4000-8000-000000000002", "key": "en:program:pgtap-core", "source_id": "c0000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình thử"}, "description": {"vi": "Mô tả"}, "kind": "core", "goal_types": [],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 0,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "2222222222222222222222222222222222222222222222222222222222222222"}
  ],
  "units": [
    {"id": "c0000000-0000-4000-8000-000000000003", "key": "en:unit:pgtap-unit", "source_id": "c0000000-0000-4000-8000-000000000001",
     "program_id": "c0000000-0000-4000-8000-000000000002", "order_index": 0, "title": {"vi": "Chủ đề thử"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "3333333333333333333333333333333333333333333333333333333333333333"}
  ],
  "lessons": [
    {"id": "c0000000-0000-4000-8000-000000000005", "key": "en:lesson:pgtap-l1", "source_id": "c0000000-0000-4000-8000-000000000001",
     "unit_id": "c0000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 0,
     "title": {"vi": "Bài 1"}, "objectives": [{"vi": "Chào hỏi"}],
     "body": [{"type": "explain", "text": {"vi": "Giải thích"}}], "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "5555555555555555555555555555555555555555555555555555555555555555"},
    {"id": "c0000000-0000-4000-8000-000000000006", "key": "en:lesson:pgtap-l2", "source_id": "c0000000-0000-4000-8000-000000000001",
     "unit_id": "c0000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Bài 2"}, "objectives": [{"vi": "Giới thiệu"}],
     "body": [{"type": "explain", "text": {"vi": "Giải thích"}}], "estimated_minutes": 6, "skills": ["grammar"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666666"}
  ],
  "lesson_prerequisites": [
    {"lesson_id": "c0000000-0000-4000-8000-000000000006", "prerequisite_lesson_id": "c0000000-0000-4000-8000-000000000005"}
  ],
  "learning_items": [
    {"id": "c0000000-0000-4000-8000-000000000004", "key": "en:item:pgtap-hello", "source_id": "c0000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "hello"}, "back": {"meaning": {"vi": "xin chào"}}, "audio_path": null,
     "status": "draft", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "4444444444444444444444444444444444444444444444444444444444444444"}
  ],
  "lesson_items": [
    {"lesson_id": "c0000000-0000-4000-8000-000000000005", "item_id": "c0000000-0000-4000-8000-000000000004", "position": 0, "role": "introduce"}
  ],
  "exercises": [
    {"id": "c0000000-0000-4000-8000-000000000007", "key": "en:exercise:pgtap-e1", "source_id": "c0000000-0000-4000-8000-000000000001",
     "lesson_id": "c0000000-0000-4000-8000-000000000005", "item_id": "c0000000-0000-4000-8000-000000000004", "order_index": 0,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Chọn từ nghĩa là xin chào", "stem_lang": "vi", "shuffle": true,
                "options": [{"id": "a", "text": "hello", "lang": "en"}, {"id": "b", "text": "bye", "lang": "en"}]},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "7777777777777777777777777777777777777777777777777777777777777777",
     "key_data": {"answer_key": {"correct_option_id": "a"},
                  "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
                  "known_wrong": [], "explanation": {"vi": "hello = xin chào"}, "display_answer": "hello"}},
    {"id": "c0000000-0000-4000-8000-000000000008", "key": "en:exercise:pgtap-e2", "source_id": "c0000000-0000-4000-8000-000000000001",
     "lesson_id": "c0000000-0000-4000-8000-000000000005", "item_id": null, "order_index": 1,
     "exercise_type": "fill_blank", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"template": "{{b1}}, Nam!", "blanks": [{"id": "b1"}]},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "8888888888888888888888888888888888888888888888888888888888888888",
     "key_data": {"answer_key": {"blanks": {"b1": ["hello", "hi"]}},
                  "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
                  "known_wrong": [], "explanation": {"vi": "Chào ai đó"}, "display_answer": "Hello, Nam!"}},
    {"id": "c0000000-0000-4000-8000-000000000009", "key": "en:exercise:pgtap-e3", "source_id": "c0000000-0000-4000-8000-000000000001",
     "lesson_id": "c0000000-0000-4000-8000-000000000006", "item_id": null, "order_index": 0,
     "exercise_type": "translate", "stage": "application", "answer_lang": "en", "difficulty": 2,
     "prompt": {"source_text": "Tôi là Nam.", "source_lang": "vi", "direction": "vi_to_target"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "9999999999999999999999999999999999999999999999999999999999999999",
     "key_data": {"answer_key": {"accepted": ["I am Nam.", "I'm Nam."]},
                  "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
                  "known_wrong": [{"answer": "I Nam", "feedback_vi": "Thiếu động từ am.", "error_tag": "missing_verb"}],
                  "explanation": {"vi": "Dùng am sau I"}, "display_answer": "I am Nam."}}
  ]
}$json$::jsonb)::text, true);

-- b2: E1 prompt changed (new hash). b3: + L1 hash changed, item draft -> in_review (same hash).
-- b4: + L2 and its prerequisite removed (E3 still points at L2).
select set_config('test.b2', jsonb_set(jsonb_set(current_setting('test.bundle')::jsonb,
  '{exercises,0,prompt,stem}', '"Từ nào nghĩa là xin chào?"'),
  '{exercises,0,content_hash}', to_jsonb(repeat('e', 64)))::text, true);
select set_config('test.b3', jsonb_set(jsonb_set(current_setting('test.b2')::jsonb,
  '{lessons,0,content_hash}', to_jsonb(repeat('f', 64))),
  '{learning_items,0,status}', '"in_review"')::text, true);
select set_config('test.b4', jsonb_set(jsonb_set(current_setting('test.b3')::jsonb,
  '{lessons}', jsonb_build_array(current_setting('test.b3')::jsonb -> 'lessons' -> 0)),
  '{lesson_prerequisites}', '[]')::text, true);
-- b5: + unit U2 (order 1) and lesson L6 at (U2, 0). b6: L1 and L6 swap units at the same order_index
-- (both hashes change). b7: L1 goes from demo to reviewed with the same content (same hash).
select set_config('test.b5', jsonb_set(jsonb_set(current_setting('test.b4')::jsonb,
  '{units}', (current_setting('test.b4')::jsonb -> 'units') || jsonb_build_array($json$
    {"id": "c0000000-0000-4000-8000-000000000010", "key": "en:unit:pgtap-unit2", "source_id": "c0000000-0000-4000-8000-000000000001",
     "program_id": "c0000000-0000-4000-8000-000000000002", "order_index": 1, "title": {"vi": "Chủ đề 2"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null}$json$::jsonb
    || jsonb_build_object('content_hash', repeat('a', 64)))),
  '{lessons}', (current_setting('test.b4')::jsonb -> 'lessons') || jsonb_build_array($json$
    {"id": "c0000000-0000-4000-8000-000000000011", "key": "en:lesson:pgtap-l6", "source_id": "c0000000-0000-4000-8000-000000000001",
     "unit_id": "c0000000-0000-4000-8000-000000000010", "language_code": "en", "level_code": "pre_a1", "order_index": 0,
     "title": {"vi": "Bài 6"}, "objectives": [{"vi": "Mục tiêu"}], "body": [], "estimated_minutes": 5, "skills": ["reading"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null}$json$::jsonb
    || jsonb_build_object('content_hash', repeat('b', 64))))::text, true);
select set_config('test.b6', jsonb_set(jsonb_set(jsonb_set(jsonb_set(current_setting('test.b5')::jsonb,
  '{lessons,0,unit_id}', '"c0000000-0000-4000-8000-000000000010"'),
  '{lessons,0,content_hash}', to_jsonb(repeat('d', 64))),
  '{lessons,1,unit_id}', '"c0000000-0000-4000-8000-000000000003"'),
  '{lessons,1,content_hash}', to_jsonb(repeat('e', 64)))::text, true);
select set_config('test.b7', jsonb_set(current_setting('test.b6')::jsonb, '{lessons,0}',
  (current_setting('test.b6')::jsonb -> 'lessons' -> 0)
  || '{"is_demo": false, "reviewed_by": "reviewer", "reviewed_at": "2026-10-01T00:00:00+00:00"}'::jsonb)::text, true);

-- Content already loaded by supabase/seed.sql is absent from the test bundle, so the first import archives it.
select set_config('test.pre_live', (
  (select count(*) from public.content_sources where status <> 'archived')
  + (select count(*) from public.programs where status <> 'archived')
  + (select count(*) from public.units where status <> 'archived')
  + (select count(*) from public.learning_items where status <> 'archived')
  + (select count(*) from public.lessons where status <> 'archived')
  + (select count(*) from public.exercises where status <> 'archived')
)::text, true);

-- ===== import as service_role =====
set local role service_role;

select is(content_private.import_bundle(current_setting('test.bundle')::jsonb),
  jsonb_build_object('inserted', 9, 'updated', 0, 'archived', current_setting('test.pre_live')::int, 'unchanged', 0),
  'first import inserts every row');
select is(content_private.import_bundle(current_setting('test.bundle')::jsonb),
  '{"inserted": 0, "updated": 0, "archived": 0, "unchanged": 9}'::jsonb,
  're-importing the same bundle changes nothing');
select is(content_private.import_bundle(current_setting('test.b2')::jsonb),
  '{"inserted": 0, "updated": 1, "archived": 0, "unchanged": 8}'::jsonb,
  'a changed exercise is updated');
select is(content_private.import_bundle(current_setting('test.b3')::jsonb),
  '{"inserted": 0, "updated": 2, "archived": 0, "unchanged": 7}'::jsonb,
  'a changed lesson and a status-only change are updates');
select is(content_private.import_bundle(current_setting('test.b4')::jsonb),
  '{"inserted": 0, "updated": 0, "archived": 1, "unchanged": 8}'::jsonb,
  'a lesson missing from the bundle is archived');
select is(content_private.import_bundle(current_setting('test.b5')::jsonb),
  '{"inserted": 2, "updated": 0, "archived": 0, "unchanged": 8}'::jsonb,
  'a new unit and lesson are inserted');
select is(content_private.import_bundle(current_setting('test.b6')::jsonb),
  '{"inserted": 0, "updated": 2, "archived": 0, "unchanged": 8}'::jsonb,
  'lessons swap units at the same order_index without a unique violation');
select is((select unit_id::text || ':' || order_index from public.lessons where id = 'c0000000-0000-4000-8000-000000000005'),
  'c0000000-0000-4000-8000-000000000010:0', 'L1 moved to U2 at order_index 0');
select is(content_private.import_bundle(current_setting('test.b7')::jsonb),
  '{"inserted": 0, "updated": 1, "archived": 0, "unchanged": 9}'::jsonb,
  'a published demo lesson becomes reviewed without a content change');
select is((select is_demo::text || ':' || version from public.lessons where id = 'c0000000-0000-4000-8000-000000000005'),
  'false:3', 'a review-only change keeps the version');
select throws_ok($$select content_private.import_bundle(jsonb_set(current_setting('test.b7')::jsonb, '{lessons}', '[]'))$$,
  'P0001', 'empty_bundle', 'a bundle without lessons cannot archive every published lesson');
select throws_ok($$select content_private.import_bundle('{"bundle_version": 2}'::jsonb)$$,
  'P0001', 'invalid_bundle', 'unknown bundle version is rejected');
select throws_ok($$select content_private.import_bundle('{"bundle_version": 1, "git_sha": null}'::jsonb)$$,
  'P0001', 'invalid_bundle', 'a bundle without its arrays is rejected');

reset role;

-- ===== versions, keys, revisions =====
select is((select version from public.exercises where id = 'c0000000-0000-4000-8000-000000000007'), 2, 'changed exercise is at version 2');
select is((select count(*)::int from content_private.exercise_keys where exercise_id = 'c0000000-0000-4000-8000-000000000007'), 2,
  'answer keys are kept for both exercise versions');
select is((select count(*)::int from content_private.revisions where entity_id = 'c0000000-0000-4000-8000-000000000007'), 2,
  'one revision per exercise version');
select is((select content_version from public.lessons where id = 'c0000000-0000-4000-8000-000000000005'), 3,
  'lessons.content_version follows version');
select is((select status || ':' || version from public.learning_items where id = 'c0000000-0000-4000-8000-000000000004'), 'in_review:1',
  'status-only change keeps the version');
select is((select status from public.lessons where id = 'c0000000-0000-4000-8000-000000000006'), 'archived', 'L2 is archived');
select isnt((select published_at from public.lessons where id = 'c0000000-0000-4000-8000-000000000005'), null, 'published lesson has published_at');

-- ===== prerequisites and language guards =====
-- L2 (archived) still requires L1; archived lessons' edges do not count toward cycles.
select lives_ok($$insert into public.lesson_prerequisites (lesson_id, prerequisite_lesson_id)
  values ('c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000006')$$,
  'edges of an archived lesson do not count toward a cycle');
delete from public.lesson_prerequisites
where lesson_id = 'c0000000-0000-4000-8000-000000000005' and prerequisite_lesson_id = 'c0000000-0000-4000-8000-000000000006';

-- L3, L4, L5 (draft, U1): L4 requires L3, L5 requires L4.
insert into public.lessons (id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
  estimated_minutes, skills, status, content_hash)
select ('c0000000-0000-4000-8000-0000000000' || n)::uuid, 'en:lesson:pgtap-l' || n, 'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000003', 'en', 'pre_a1', n::int, '{"vi": "Bài"}', '[{"vi": "Mục tiêu"}]', '[]',
  5, '{reading}', 'draft', repeat('c', 64)
from unnest(array['12', '13', '14']) as t (n);
insert into public.lesson_prerequisites (lesson_id, prerequisite_lesson_id) values
  ('c0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000012'),
  ('c0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000013');

select throws_ok($$insert into public.lesson_prerequisites (lesson_id, prerequisite_lesson_id)
  values ('c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000014')$$,
  'P0001', 'prerequisite_cycle', 'a three-lesson cycle is rejected');
select lives_ok($$update public.lesson_prerequisites
  set lesson_id = 'c0000000-0000-4000-8000-000000000012', prerequisite_lesson_id = 'c0000000-0000-4000-8000-000000000013'
  where lesson_id = 'c0000000-0000-4000-8000-000000000013' and prerequisite_lesson_id = 'c0000000-0000-4000-8000-000000000012'$$,
  'reversing an edge is not a cycle with the edge it replaces');

insert into public.programs (id, key, source_id, language_code, title, description, kind, level_from, level_to, order_index,
  status, is_demo, reviewed_by, reviewed_at, content_hash)
values ('c0000000-0000-4000-8000-00000000000a', 'ko:program:pgtap-ko', 'c0000000-0000-4000-8000-000000000001', 'ko',
  '{"vi": "Tiếng Hàn"}', '{"vi": "Mô tả"}', 'core', 'hangul', 'topik1', 0,
  'published', false, 'reviewer', now(), repeat('a', 64));
insert into public.units (id, key, source_id, program_id, order_index, title, status, content_hash)
values ('c0000000-0000-4000-8000-00000000000b', 'ko:unit:pgtap-ko', 'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-00000000000a', 0, '{"vi": "Chủ đề"}', 'draft', repeat('b', 64));
insert into public.lessons (id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
  estimated_minutes, skills, status, content_hash)
values ('c0000000-0000-4000-8000-00000000000c', 'ko:lesson:pgtap-ko', 'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-00000000000b', 'ko', 'hangul', 0, '{"vi": "Bài"}', '[{"vi": "Mục tiêu"}]', '[]',
  5, '{reading}', 'draft', repeat('c', 64));

select throws_ok($$insert into public.lesson_prerequisites (lesson_id, prerequisite_lesson_id)
  values ('c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-00000000000c')$$,
  'P0001', 'prerequisite_language_mismatch', 'prerequisites must share the language');
select throws_ok($$insert into public.lessons (id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
    estimated_minutes, skills, status, content_hash)
  values ('c0000000-0000-4000-8000-00000000000d', 'ko:lesson:pgtap-wrong', 'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003', 'ko', 'hangul', 5, '{"vi": "Bài"}', '[{"vi": "Mục tiêu"}]', '[]',
    5, '{reading}', 'draft', repeat('d', 64))$$,
  'P0001', 'lesson_language_mismatch', 'a lesson must match its program language');

-- ===== status workflow =====
select throws_ok($$update public.programs set status = 'draft' where id = 'c0000000-0000-4000-8000-00000000000a'$$,
  'P0001', 'invalid_status_transition', 'published cannot go back to draft');
select throws_ok($$update public.programs set title = '{"vi": "Sửa"}' where id = 'c0000000-0000-4000-8000-00000000000a'$$,
  'P0001', 'invalid_status_transition', 'published non-demo content needs a new version and review');
select lives_ok($$update public.programs set title = '{"vi": "Sửa"}', version = version + 1, reviewed_at = now() + interval '1 hour'
  where id = 'c0000000-0000-4000-8000-00000000000a'$$, 'published non-demo content changes with version and review');
select throws_ok($$insert into public.programs (id, key, source_id, language_code, title, description, kind, level_from, level_to,
    order_index, status, is_demo, content_hash)
  values ('c0000000-0000-4000-8000-00000000000e', 'ko:program:pgtap-unreviewed', 'c0000000-0000-4000-8000-000000000001', 'ko',
    '{"vi": "x"}', '{"vi": "x"}', 'core', 'hangul', 'topik1', 1, 'published', false, repeat('e', 64))$$,
  '23514', null, 'published non-demo rows need reviewed_at');
select throws_ok($$update public.lessons set status = 'published' where id = 'c0000000-0000-4000-8000-00000000000c'$$,
  'P0001', 'invalid_status_transition', 'draft cannot jump to published');
select lives_ok($$update public.programs set status = 'archived' where id = 'c0000000-0000-4000-8000-00000000000a'$$,
  'published -> archived is allowed');
-- L1 is published and reviewed since b7.
select throws_ok($$update public.lessons set is_demo = true, estimated_minutes = 9 where id = 'c0000000-0000-4000-8000-000000000005'$$,
  'P0001', 'invalid_status_transition', 'flipping a reviewed row to demo does not allow an unreviewed content edit');
select lives_ok($$update public.lessons set reviewed_by = 'reviewer2', reviewed_at = reviewed_at + interval '1 day'
  where id = 'c0000000-0000-4000-8000-000000000005'$$, 'a review-only change of a published row is allowed');

-- Parent chain: published L7 under draft unit U3 (published program); published L8 under published
-- unit U4 under draft program P3.
insert into public.units (id, key, source_id, program_id, order_index, title, status, content_hash)
values ('c0000000-0000-4000-8000-000000000015', 'en:unit:pgtap-draft', 'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002', 2, '{"vi": "Chủ đề nháp"}', 'draft', repeat('b', 64));
insert into public.programs (id, key, source_id, language_code, title, description, kind, level_from, level_to, order_index,
  status, content_hash)
values ('c0000000-0000-4000-8000-000000000017', 'en:program:pgtap-draft', 'c0000000-0000-4000-8000-000000000001', 'en',
  '{"vi": "Chương trình nháp"}', '{"vi": "Mô tả"}', 'core', 'pre_a1', 'a1', 1, 'draft', repeat('a', 64));
insert into public.units (id, key, source_id, program_id, order_index, title, status, is_demo, content_hash)
values ('c0000000-0000-4000-8000-000000000018', 'en:unit:pgtap-orphan', 'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000017', 0, '{"vi": "Chủ đề"}', 'published', true, repeat('b', 64));
insert into public.lessons (id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
  estimated_minutes, skills, status, is_demo, content_hash)
values
  ('c0000000-0000-4000-8000-000000000016', 'en:lesson:pgtap-l7', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000015', 'en', 'pre_a1', 0, '{"vi": "Bài"}', '[{"vi": "Mục tiêu"}]', '[]',
   5, '{reading}', 'published', true, repeat('c', 64)),
  ('c0000000-0000-4000-8000-000000000019', 'en:lesson:pgtap-l8', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000018', 'en', 'pre_a1', 0, '{"vi": "Bài"}', '[{"vi": "Mục tiêu"}]', '[]',
   5, '{reading}', 'published', true, repeat('c', 64));

-- ===== authenticated: published only =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "role": "authenticated"}', true);

select is((select count(*)::int from public.content_sources where id = 'c0000000-0000-4000-8000-000000000001'), 1, 'published source visible');
select is((select count(*)::int from public.programs where id = 'c0000000-0000-4000-8000-000000000002'), 1, 'published program visible');
select is((select count(*)::int from public.units where id = 'c0000000-0000-4000-8000-000000000003'), 1, 'published unit visible');
select is((select count(*)::int from public.lessons
  where id in ('c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000006')), 1, 'archived lesson hidden');
select is((select count(*)::int from public.exercises
  where id in ('c0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000009')), 2,
  'exercises of an archived lesson are hidden');
select is((select count(*)::int from public.learning_items where id = 'c0000000-0000-4000-8000-000000000004'), 0, 'in_review item hidden');
select is((select count(*)::int from public.lesson_items where lesson_id = 'c0000000-0000-4000-8000-000000000005'), 1, 'item links of a visible lesson');
select is((select count(*)::int from public.lesson_prerequisites where lesson_id = 'c0000000-0000-4000-8000-000000000006'), 0,
  'prerequisites of an archived lesson are hidden');
select is((select count(*)::int from public.programs where id = 'c0000000-0000-4000-8000-00000000000a'), 0, 'archived program hidden');
select is((select count(*)::int from public.lessons
  where id in ('c0000000-0000-4000-8000-000000000016', 'c0000000-0000-4000-8000-000000000019')), 0,
  'published lessons under a draft unit or program are hidden');
select is((select count(*)::int from public.units where id = 'c0000000-0000-4000-8000-000000000018'), 0,
  'a published unit under a draft program is hidden');
select throws_ok($$update public.lessons set estimated_minutes = 7$$, '42501', null, 'authenticated cannot write content');
select throws_ok(format('select content_private.import_bundle(%L::jsonb)', current_setting('test.bundle')), '42501', null,
  'authenticated cannot import');

-- ===== anon: nothing =====
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select count(*) from public.exercises$$, '42501', null, 'anon cannot read exercises');
select throws_ok($$select count(*) from public.lessons$$, '42501', null, 'anon cannot read lessons');

select * from finish();
rollback;
