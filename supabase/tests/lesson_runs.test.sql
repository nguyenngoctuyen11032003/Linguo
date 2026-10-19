begin;
create extension if not exists pgtap with schema extensions;
select plan(127);

-- ===== Content: one EN core program (pre_a1 -> a1), one unit, L1 (3 exercises) and L2 (requires L1) =====
-- Imported as the migration owner; the import archives any seeded content absent from this bundle
-- (rolled back with the test). Exercise order_index is reversed so the stage ordering is visible.
select isnt(content_private.import_bundle($bundle$
{
  "bundle_version": 1,
  "git_sha": null,
  "sources": [
    {"id": "a3000000-0000-4000-8000-000000000001", "key": "src:a3-test", "title": "A3 test", "author_or_org": "Linguo", "url": null,
     "license": "own", "attribution_required": false,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "1111111111111111111111111111111111111111111111111111111111111111"}
  ],
  "programs": [
    {"id": "a3000000-0000-4000-8000-000000000002", "key": "en:program:a3-test-core", "source_id": "a3000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình thử"}, "description": {"vi": "Dùng cho kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 900,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "2222222222222222222222222222222222222222222222222222222222222222"},
    {"id": "a3000000-0000-4000-8000-000000000004", "key": "en:program:a3-test-goal-other", "source_id": "a3000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình mục tiêu khác"}, "description": {"vi": "Dùng cho kiểm thử"}, "kind": "goal", "goal_types": ["work_it"],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 901,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    {"id": "a3000000-0000-4000-8000-000000000005", "key": "en:program:a3-test-goal-match", "source_id": "a3000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình đúng mục tiêu"}, "description": {"vi": "Dùng cho kiểm thử"}, "kind": "goal", "goal_types": ["foundation"],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 902,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
    {"id": "a3000000-0000-4000-8000-000000000006", "key": "en:program:a3-test-upper", "source_id": "a3000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình trung cấp"}, "description": {"vi": "Dùng cho kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "b1", "level_to": "b2", "order_index": 903,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}
  ],
  "units": [
    {"id": "a3000000-0000-4000-8000-000000000003", "key": "en:unit:a3-test-unit", "source_id": "a3000000-0000-4000-8000-000000000001",
     "program_id": "a3000000-0000-4000-8000-000000000002", "order_index": 1, "title": {"vi": "Đơn vị thử"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "3333333333333333333333333333333333333333333333333333333333333333"},
    {"id": "a3000000-0000-4000-8000-000000000007", "key": "en:unit:a3-test-goal-other", "source_id": "a3000000-0000-4000-8000-000000000001",
     "program_id": "a3000000-0000-4000-8000-000000000004", "order_index": 1, "title": {"vi": "Đơn vị mục tiêu khác"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},
    {"id": "a3000000-0000-4000-8000-000000000008", "key": "en:unit:a3-test-goal-match", "source_id": "a3000000-0000-4000-8000-000000000001",
     "program_id": "a3000000-0000-4000-8000-000000000005", "order_index": 1, "title": {"vi": "Đơn vị đúng mục tiêu"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},
    {"id": "a3000000-0000-4000-8000-000000000009", "key": "en:unit:a3-test-upper", "source_id": "a3000000-0000-4000-8000-000000000001",
     "program_id": "a3000000-0000-4000-8000-000000000006", "order_index": 1, "title": {"vi": "Đơn vị trung cấp"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}
  ],
  "lessons": [
    {"id": "a3000000-0000-4000-8000-000000000011", "key": "en:lesson:a3-test-l1", "source_id": "a3000000-0000-4000-8000-000000000001",
     "unit_id": "a3000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Chào hỏi"}, "objectives": [{"vi": "Chào bằng tiếng Anh"}],
     "body": [
       {"type": "objective", "text": {"vi": "Chào hỏi"}},
       {"type": "explain", "text": {"vi": "Hello dùng để chào."}},
       {"type": "example", "target": "Hello!", "target_lang": "en", "translation": {"vi": "Xin chào!"}},
       {"type": "common_mistake", "wrong": "Helo", "right": "Hello", "target_lang": "en", "note": {"vi": "Hai chữ l."}},
       {"type": "summary", "points": [{"vi": "Hello = xin chào"}]}
     ],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "4444444444444444444444444444444444444444444444444444444444444444"},
    {"id": "a3000000-0000-4000-8000-000000000012", "key": "en:lesson:a3-test-l2", "source_id": "a3000000-0000-4000-8000-000000000001",
     "unit_id": "a3000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 2,
     "title": {"vi": "Giới thiệu"}, "objectives": [{"vi": "Giới thiệu bản thân"}],
     "body": [{"type": "objective", "text": {"vi": "Giới thiệu"}}],
     "estimated_minutes": 5, "skills": ["speaking"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "5555555555555555555555555555555555555555555555555555555555555555"},
    {"id": "a3000000-0000-4000-8000-000000000013", "key": "en:lesson:a3-test-goal-other", "source_id": "a3000000-0000-4000-8000-000000000001",
     "unit_id": "a3000000-0000-4000-8000-000000000007", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Bài mục tiêu khác"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "0000000000000000000000000000000000000000000000000000000000000000"},
    {"id": "a3000000-0000-4000-8000-000000000014", "key": "en:lesson:a3-test-goal-match", "source_id": "a3000000-0000-4000-8000-000000000001",
     "unit_id": "a3000000-0000-4000-8000-000000000008", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Bài đúng mục tiêu"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"},
    {"id": "a3000000-0000-4000-8000-000000000015", "key": "en:lesson:a3-test-upper", "source_id": "a3000000-0000-4000-8000-000000000001",
     "unit_id": "a3000000-0000-4000-8000-000000000009", "language_code": "en", "level_code": "b1", "order_index": 1,
     "title": {"vi": "Bài trung cấp"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1"}
  ],
  "lesson_prerequisites": [
    {"lesson_id": "a3000000-0000-4000-8000-000000000012", "prerequisite_lesson_id": "a3000000-0000-4000-8000-000000000011"}
  ],
  "learning_items": [
    {"id": "a3000000-0000-4000-8000-000000000021", "key": "en:item:a3-test-hello", "source_id": "a3000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "hello"}, "back": {"meaning": {"vi": "xin chào"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666666"}
  ],
  "lesson_items": [
    {"lesson_id": "a3000000-0000-4000-8000-000000000011", "item_id": "a3000000-0000-4000-8000-000000000021", "position": 1, "role": "introduce"}
  ],
  "exercises": [
    {"id": "a3000000-0000-4000-8000-000000000031", "key": "en:exercise:a3-test-mcq", "source_id": "a3000000-0000-4000-8000-000000000001",
     "lesson_id": "a3000000-0000-4000-8000-000000000011", "item_id": "a3000000-0000-4000-8000-000000000021", "order_index": 3,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Chọn câu chào", "stem_lang": "vi", "options": [{"id": "o1", "text": "Hello", "lang": "en"}, {"id": "o2", "text": "Goodbye", "lang": "en"}], "shuffle": true},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "7777777777777777777777777777777777777777777777777777777777777777",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello là lời chào."}, "display_answer": "Hello"}},
    {"id": "a3000000-0000-4000-8000-000000000032", "key": "en:exercise:a3-test-fill", "source_id": "a3000000-0000-4000-8000-000000000001",
     "lesson_id": "a3000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 2,
     "exercise_type": "fill_blank", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"template": "Nice to {{b1}} you.", "blanks": [{"id": "b1"}]},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "8888888888888888888888888888888888888888888888888888888888888888",
     "key_data": {"answer_key": {"blanks": {"b1": ["meet"]}},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Nice to meet you."}, "display_answer": "meet"}},
    {"id": "a3000000-0000-4000-8000-000000000033", "key": "en:exercise:a3-test-translate", "source_id": "a3000000-0000-4000-8000-000000000001",
     "lesson_id": "a3000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 1,
     "exercise_type": "translate", "stage": "application", "answer_lang": "en", "difficulty": 1,
     "prompt": {"source_text": "Xin chào", "source_lang": "vi", "direction": "vi_to_target"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "9999999999999999999999999999999999999999999999999999999999999999",
     "key_data": {"answer_key": {"accepted": ["Hello", "Hi", "Hello there"]},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 1, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello hoặc Hi."}, "display_answer": "Hello"}},
    {"id": "a3000000-0000-4000-8000-000000000034", "key": "en:exercise:a3-test-draft", "source_id": "a3000000-0000-4000-8000-000000000001",
     "lesson_id": "a3000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 4,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Bản nháp", "stem_lang": "vi", "options": [{"id": "o1", "text": "Yes", "lang": "en"}, {"id": "o2", "text": "No", "lang": "en"}], "shuffle": true},
     "status": "draft", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Đáp án nháp."}, "display_answer": "Yes"}},
    {"id": "a3000000-0000-4000-8000-000000000035", "key": "en:exercise:a3-test-later", "source_id": "a3000000-0000-4000-8000-000000000001",
     "lesson_id": "a3000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 5,
     "exercise_type": "mcq", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Chọn lời tạm biệt", "stem_lang": "vi", "options": [{"id": "o1", "text": "Goodbye", "lang": "en"}, {"id": "o2", "text": "Hello", "lang": "en"}], "shuffle": true},
     "status": "approved", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Goodbye là lời tạm biệt."}, "display_answer": "Goodbye"}}
  ]
}
$bundle$::jsonb), null, 'test bundle imports');

select set_config('test.l1', 'a3000000-0000-4000-8000-000000000011', true);
select set_config('test.l2', 'a3000000-0000-4000-8000-000000000012', true);
select set_config('test.mcq', 'a3000000-0000-4000-8000-000000000031', true);
select set_config('test.fill', 'a3000000-0000-4000-8000-000000000032', true);
select set_config('test.tr', 'a3000000-0000-4000-8000-000000000033', true);
select set_config('test.draft', 'a3000000-0000-4000-8000-000000000034', true);
select set_config('test.later', 'a3000000-0000-4000-8000-000000000035', true);
select set_config('test.goal_other', 'a3000000-0000-4000-8000-000000000013', true);
select set_config('test.goal_match', 'a3000000-0000-4000-8000-000000000014', true);
select set_config('test.upper', 'a3000000-0000-4000-8000-000000000015', true);

-- Submits with fixed signals (confidence 2, 1.5 s, no hints). Rolled back with the test.
create function public.a3_submit(p_run text, p_exercise text, p_key text, p_response jsonb, p_version integer default 1)
returns jsonb
language sql
volatile
as $$
  select public.submit_exercise(p_run::uuid, p_exercise::uuid, p_version, p_key::uuid, p_response, 2::smallint, 1500, 0::smallint, now());
$$;

-- Number of answer-field keys found anywhere in a payload (recursive).
create function public.a3_leaks(p jsonb)
returns integer
language sql
immutable
as $$
  select count(*)::int
  from unnest(array['answer_key', 'accepted', 'correct_option_id', 'orders', 'explanation', 'display_answer', 'known_wrong', 'rubric']) as k
  where jsonb_path_exists(p, ('$.**.' || k)::jsonpath);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}');

-- ===== User A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates an EN path');
select lives_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates a KO path');
select set_config('test.a_en', (select id::text from public.learning_paths where language_code = 'en'), true);
select set_config('test.a_ko', (select id::text from public.learning_paths where language_code = 'ko'), true);

-- path_lessons before any run
select is(
  array(select lesson_id from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id in (current_setting('test.l1')::uuid, current_setting('test.l2')::uuid)),
  array[current_setting('test.l1')::uuid, current_setting('test.l2')::uuid], 'path_lessons lists L1 then L2');
select is((select run_status from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid), 'not_started', 'L1 not started');
select is((select prerequisite_ids from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l2')::uuid), array[current_setting('test.l1')::uuid], 'L2 lists L1 as prerequisite');
select is((select prerequisites_met from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l2')::uuid), false, 'L2 prerequisites not met yet');
select is((select prerequisites_met from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid), true, 'L1 has no prerequisites');
select is((select is_demo from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid), true, 'path_lessons carries is_demo');
select is((select count(*)::int from public.path_lessons(current_setting('test.a_ko')::uuid) where lesson_id in (current_setting('test.l1')::uuid, current_setting('test.l2')::uuid)), 0, 'KO path lists no EN lessons');
-- A's EN path: goal foundation, pre_a1 -> a1.
select is((select count(*)::int from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.goal_other')::uuid), 0, 'goal program for another goal is excluded');
select is((select count(*)::int from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.goal_match')::uuid), 1, 'goal program for the path goal is included');
select is((select count(*)::int from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.upper')::uuid), 0, 'program above the target level is excluded');

-- get_lesson before starting: public content only
select set_config('test.payload', public.get_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid)::text, true);
select is(current_setting('test.payload')::jsonb #>> '{lesson,key}', 'en:lesson:a3-test-l1', 'get_lesson returns the lesson');
select is(current_setting('test.payload')::jsonb #>> '{lesson,content_version}', '1', 'lesson content_version');
select is(current_setting('test.payload')::jsonb #>> '{lesson,program_title,vi}', 'Chương trình thử', 'lesson carries the program title');
select is(jsonb_array_length(current_setting('test.payload')::jsonb -> 'items'), 1, 'one lesson item');
select is(
  array(select e ->> 'id' from jsonb_array_elements(current_setting('test.payload')::jsonb -> 'exercises') as e),
  array[current_setting('test.mcq'), current_setting('test.fill'), current_setting('test.tr')], 'exercises ordered recognition, recall, application');
select is(
  (select count(*)::int from unnest(array['answer_key', 'accepted', 'correct_option_id', 'orders', 'explanation', 'display_answer', 'known_wrong', 'rubric']) as k
    where jsonb_path_exists(current_setting('test.payload')::jsonb, ('$.**.' || k)::jsonpath)),
  0, 'get_lesson exposes no answer field');
select is(current_setting('test.payload')::jsonb -> 'run', 'null'::jsonb, 'no run before start');
select is(current_setting('test.payload')::jsonb -> 'attempts', '[]'::jsonb, 'no attempts before start');

select throws_ok(format('select public.get_lesson(%L, %L)', current_setting('test.l1'), current_setting('test.a_ko')), 'P0001', 'lesson_not_in_path', 'EN lesson on the KO path');
select throws_ok(format('select public.get_lesson(%L, %L)', current_setting('test.l1'), gen_random_uuid()), 'P0001', 'path_not_found', 'unknown path');
select throws_ok(format('select public.get_lesson(%L, %L)', gen_random_uuid(), current_setting('test.a_en')), 'P0001', 'lesson_not_found', 'unknown lesson');
select throws_ok(format('select public.start_lesson(%L, %L)', current_setting('test.l1'), current_setting('test.a_ko')), 'P0001', 'lesson_not_in_path', 'cannot start an EN lesson on the KO path');

-- start_lesson
select set_config('test.start', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid)::text, true);
select set_config('test.run', current_setting('test.start')::jsonb ->> 'id', true);
select is(public.a3_leaks(current_setting('test.start')::jsonb), 0, 'start_lesson exposes no answer field');
select is(public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid) ->> 'id', current_setting('test.run'), 'start_lesson is idempotent');
select is((select count(*)::int from public.lesson_runs), 1, 'one run');
select is((select queue from public.lesson_runs where id = current_setting('test.run')::uuid),
  array[current_setting('test.mcq'), current_setting('test.fill'), current_setting('test.tr')]::uuid[], 'queue ordered by stage');
select is(public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid) - 'id',
  jsonb_build_object('status', 'in_progress', 'cursor', 0, 'queue', jsonb_build_array(current_setting('test.mcq'), current_setting('test.fill'), current_setting('test.tr')), 'next_review_at', null::text, 'summary', null::jsonb),
  'run JSON shape');
select is((select run_status from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid), 'in_progress', 'L1 in progress');
select throws_ok($$update public.lesson_runs set cursor = 5$$, '42501', null, 'no direct run update');
select throws_ok(format($$insert into public.attempts (user_id) values (%L)$$, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), '42501', null, 'no direct attempt insert');

-- save_lesson_cursor only moves forward
select lives_ok(format('select public.save_lesson_cursor(%L, 3::smallint)', current_setting('test.run')), 'cursor saved');
select lives_ok(format('select public.save_lesson_cursor(%L, 1::smallint)', current_setting('test.run')), 'older cursor accepted');
select is((select cursor::int from public.lesson_runs where id = current_setting('test.run')::uuid), 3, 'cursor keeps the furthest step');
select throws_ok(format('select public.save_lesson_cursor(%L, (-1)::smallint)', current_setting('test.run')), 'P0001', 'invalid_cursor', 'negative cursor refused');
select throws_ok(format('select public.save_lesson_cursor(%L, null::smallint)', current_setting('test.run')), 'P0001', 'invalid_cursor', 'null cursor refused');
select lives_ok(format('select public.save_lesson_cursor(%L, 32000::smallint)', current_setting('test.run')), 'huge cursor accepted');
-- 5 body blocks + 2 * 3 queue entries + 10
select is((select cursor::int from public.lesson_runs where id = current_setting('test.run')::uuid), 21, 'huge cursor clamped to the step bound');

-- First wrong answer: no reveal
select set_config('test.r1', public.a3_submit(current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000001', '{"option_id": "o2"}')::text, true);
select is(current_setting('test.r1')::jsonb - 'attempt_id',
  '{"attempt_no": 1, "verdict": "incorrect", "is_correct": false, "score": 0, "error_tags": [], "feedback_vi": null, "revealed": false,
    "display_answer": null, "explanation": null, "final": false, "requeued": false, "replayed": false}'::jsonb,
  'first wrong answer reveals nothing');
select set_config('test.payload', public.get_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid)::text, true);
select is(public.a3_leaks(current_setting('test.payload')::jsonb), 0, 'get_lesson after a wrong attempt exposes no answer field');
select is((current_setting('test.payload')::jsonb -> 'attempts' -> 0) ?| array['display_answer', 'explanation'], false, 'unrevealed attempt omits the answer keys');

-- Second wrong answer: reveal and re-queue
select set_config('test.r2', public.a3_submit(current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000002', '{"option_id": "o2"}')::text, true);
select is(current_setting('test.r2')::jsonb ->> 'attempt_no', '2', 'second attempt');
select is(current_setting('test.r2')::jsonb ->> 'revealed', 'true', 'second wrong answer reveals');
select is(current_setting('test.r2')::jsonb ->> 'final', 'true', 'revealed exercise is final');
select is(current_setting('test.r2')::jsonb ->> 'requeued', 'true', 'revealed wrong answer is re-queued');
select is(current_setting('test.r2')::jsonb ->> 'display_answer', 'Hello', 'display answer after reveal');
select is(current_setting('test.r2')::jsonb -> 'explanation', '{"vi": "Hello là lời chào."}'::jsonb, 'explanation after reveal');
select is((select queue from public.lesson_runs where id = current_setting('test.run')::uuid),
  array[current_setting('test.mcq'), current_setting('test.fill'), current_setting('test.tr'), current_setting('test.mcq')]::uuid[], 're-check appended to the queue');

-- Idempotency
select is(public.a3_submit(current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000002', '{"option_id": "o2"}'),
  (current_setting('test.r2')::jsonb - 'replayed') || '{"replayed": true}'::jsonb, 'same key and payload replays the stored result');
select is((select count(*)::int from public.attempts where idempotency_key = 'c0000000-0000-4000-8000-000000000002'), 1, 'replay stores nothing');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000002', '{"option_id": "o1"}'),
  'P0001', 'idempotency_conflict', 'same key with another payload');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', gen_random_uuid(), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000002', '{"option_id": "o2"}'),
  'P0001', 'idempotency_conflict', 'same key and response on another run');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L, 2)', current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000002', '{"option_id": "o2"}'),
  'P0001', 'idempotency_conflict', 'same key and response with another exercise version');

-- Validation
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L, 2)', current_setting('test.run'), current_setting('test.fill'), 'c0000000-0000-4000-8000-000000000010', '{"blanks": {"b1": "meet"}}'),
  'P0001', 'exercise_version_mismatch', 'unknown exercise version');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000011', '{"text": "x"}'),
  'P0001', 'invalid_response', 'text response to an mcq');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.tr'), 'c0000000-0000-4000-8000-000000000012', jsonb_build_object('text', repeat('x', 301))),
  'P0001', 'invalid_response', 'translation longer than 300 characters');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), gen_random_uuid(), 'c0000000-0000-4000-8000-000000000013', '{"option_id": "o1"}'),
  'P0001', 'exercise_not_in_lesson', 'exercise outside the lesson');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.draft'), 'c0000000-0000-4000-8000-000000000015', '{"give_up": true}'),
  'P0001', 'exercise_not_in_lesson', 'give-up on a draft exercise of the lesson is refused');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.later'), 'c0000000-0000-4000-8000-000000000016', '{"give_up": true}'),
  'P0001', 'exercise_not_in_lesson', 'give-up on an approved, unpublished exercise is refused');
-- Eight 290-character blanks: each within the 300-character cap, the whole response over 2 KB.
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.fill'), 'c0000000-0000-4000-8000-000000000017',
    jsonb_build_object('blanks', (select jsonb_object_agg('b' || i, repeat('x', 290)) from generate_series(1, 8) as i))),
  'P0001', 'invalid_response', 'response over 2 KB');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', gen_random_uuid(), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000014', '{"option_id": "o1"}'),
  'P0001', 'run_not_found', 'unknown run');

-- Remaining exercises answered correctly
select is(public.a3_submit(current_setting('test.run'), current_setting('test.fill'), 'c0000000-0000-4000-8000-000000000003', '{"blanks": {"b1": "Meet"}}') ->> 'verdict', 'correct', 'fill blank graded correct');
select set_config('test.r4', public.a3_submit(current_setting('test.run'), current_setting('test.tr'), 'c0000000-0000-4000-8000-000000000004', '{"text": "hello!"}')::text, true);
select is(current_setting('test.r4')::jsonb ->> 'verdict', 'correct', 'translation graded correct');
select is(current_setting('test.r4')::jsonb ->> 'display_answer', 'Hello', 'correct answer reveals the display answer');
select is((select normalized_response from public.attempts where idempotency_key = 'c0000000-0000-4000-8000-000000000004'), 'hello', 'normalized response stored');

select throws_ok(format('select public.complete_lesson(%L)', current_setting('test.run')), 'P0001', 'attempts_incomplete', 'cannot complete before the re-check');

-- Re-check after the reveal
select set_config('test.r5', public.a3_submit(current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000005', '{"option_id": "o1"}')::text, true);
select is(current_setting('test.r5')::jsonb ->> 'attempt_no', '3', 're-check is attempt 3');
select is(current_setting('test.r5')::jsonb ->> 'requeued', 'false', 're-check is not re-queued');
select is((select after_reveal from public.attempts where idempotency_key = 'c0000000-0000-4000-8000-000000000005'), true, 're-check is after_reveal');

-- Complete
select set_config('test.summary', public.complete_lesson(current_setting('test.run')::uuid)::text, true);
select is(current_setting('test.summary')::jsonb -> 'accuracy_by_stage', '{"recognition": 0, "recall": 1, "application": 1}'::jsonb, 'accuracy over first attempts');
select is(current_setting('test.summary')::jsonb - 'accuracy_by_stage' - 'next_review_at' - 'completed_at',
  '{"almost_count": 0, "confident_wrong": 0, "unsure_right": 0}'::jsonb, 'summary counters');
select is((current_setting('test.summary')::jsonb ->> 'next_review_at')::timestamptz,
  ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh', 'next review at the start of tomorrow in the learner timezone');
select is(public.complete_lesson(current_setting('test.run')::uuid), current_setting('test.summary')::jsonb, 'complete_lesson is idempotent');
select is((select status from public.lesson_runs where id = current_setting('test.run')::uuid), 'completed', 'run completed');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000020', '{"option_id": "o1"}'),
  'P0001', 'run_not_active', 'no submit on a completed run');
select throws_ok(format('select public.save_lesson_cursor(%L, 9::smallint)', current_setting('test.run')), 'P0001', 'run_not_active', 'no cursor on a completed run');

-- path_lessons after completion
select is((select run_status from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid), 'completed', 'L1 completed');
select is((select prerequisites_met from public.path_lessons(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l2')::uuid), true, 'L2 prerequisites met');

-- get_lesson shows the completed run with its attempts
select set_config('test.payload', public.get_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid)::text, true);
select is(current_setting('test.payload')::jsonb #>> '{run,id}', current_setting('test.run'), 'latest completed run returned');
select is(current_setting('test.payload')::jsonb #> '{run,summary}', current_setting('test.summary')::jsonb, 'run carries the summary');
select is(jsonb_array_length(current_setting('test.payload')::jsonb -> 'attempts'), 5, 'five stored attempts');
select is(
  (select array_agg(a ->> 'attempt_id' order by o) from jsonb_array_elements(current_setting('test.payload')::jsonb -> 'attempts') with ordinality as t(a, o) where o <= 2),
  array[current_setting('test.r1')::jsonb ->> 'attempt_id', current_setting('test.r2')::jsonb ->> 'attempt_id'], 'attempts oldest first');
select is((current_setting('test.payload')::jsonb -> 'attempts' -> 0) - 'attempt_id' - 'created_at',
  (current_setting('test.r1')::jsonb - 'attempt_id' - 'replayed' - 'display_answer' - 'explanation')
    || jsonb_build_object('exercise_id', current_setting('test.mcq'), 'after_reveal', false),
  'stored attempt equals the submit result, without the unrevealed answer keys');
select is((current_setting('test.payload')::jsonb -> 'attempts' -> 1) ->> 'display_answer', 'Hello', 'revealed attempt keeps the display answer');
select is((select count(*)::int from public.attempts), 5, 'A sees own attempts');

-- ===== User B =====
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'B creates an EN path');
select set_config('test.b_en', (select id::text from public.learning_paths where language_code = 'en'), true);
select is((select count(*)::int from public.attempts), 0, 'B sees none of A''s attempts');
select is((select count(*)::int from public.attempts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'B selecting A''s attempts by user_id gets no rows');
select is((select count(*)::int from public.lesson_runs), 0, 'B sees none of A''s runs');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000030', '{"option_id": "o1"}'),
  'P0001', 'run_not_found', 'B cannot submit on A''s run');
select throws_ok(format('select public.complete_lesson(%L)', current_setting('test.run')), 'P0001', 'run_not_found', 'B cannot complete A''s run');
select throws_ok(format('select public.save_lesson_cursor(%L, 1::smallint)', current_setting('test.run')), 'P0001', 'run_not_found', 'B cannot move A''s cursor');
select throws_ok(format('select public.get_lesson(%L, %L)', current_setting('test.l1'), current_setting('test.a_en')), 'P0001', 'path_not_found', 'B cannot open A''s path');
select is((select count(*)::int from public.path_lessons(current_setting('test.a_en')::uuid)), 0, 'path_lessons of another user''s path is empty');
select is((select run_status from public.path_lessons(current_setting('test.b_en')::uuid) where lesson_id = current_setting('test.l1')::uuid), 'not_started', 'B has not started L1');

-- Rate limit: 30 attempts in 10 seconds are accepted, the 31st is refused
select set_config('test.b_run', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.b_en')::uuid) ->> 'id', true);
select lives_ok($q$do $d$
begin
  for i in 1 .. 30 loop
    perform public.submit_exercise(current_setting('test.b_run')::uuid, current_setting('test.mcq')::uuid, 1, gen_random_uuid(), '{"option_id": "o1"}'::jsonb, null, 100, 0::smallint, now());
  end loop;
end
$d$$q$, 'B submits 30 times');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.b_run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000031', '{"option_id": "o1"}'),
  'P0001', 'rate_limited', '31st submit within 10 seconds');
-- The run is checked (and locked) before the rate limit; the limit still counts per user across runs.
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', gen_random_uuid(), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000033', '{"option_id": "o1"}'),
  'P0001', 'run_not_found', 'unknown run is reported before the rate limit');
select set_config('test.b_run2', public.start_lesson(current_setting('test.l2')::uuid, current_setting('test.b_en')::uuid) ->> 'id', true);
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.b_run2'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000034', '{"option_id": "o1"}'),
  'P0001', 'rate_limited', 'rate limit counts the user''s attempts on every run');

-- ===== User C: give-up, almost, content changes during a run =====
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'C creates an EN path');
select set_config('test.c_en', (select id::text from public.learning_paths where language_code = 'en'), true);
select set_config('test.c_run', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.c_en')::uuid) ->> 'id', true);

-- Give-up on the first attempt reveals and re-queues
select set_config('test.c1', public.a3_submit(current_setting('test.c_run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000101', '{"give_up": true}')::text, true);
select is(current_setting('test.c1')::jsonb - 'attempt_id' - 'error_tags' - 'feedback_vi',
  '{"attempt_no": 1, "verdict": "incorrect", "is_correct": false, "score": 0, "revealed": true,
    "display_answer": "Hello", "explanation": {"vi": "Hello là lời chào."}, "final": true, "requeued": true, "replayed": false}'::jsonb,
  'give-up on the first attempt reveals and re-queues');
select is((select gave_up from public.attempts where idempotency_key = 'c0000000-0000-4000-8000-000000000101'), true, 'give-up stored');

-- Almost reveals without a re-check
select set_config('test.c2', public.a3_submit(current_setting('test.c_run'), current_setting('test.tr'), 'c0000000-0000-4000-8000-000000000102', '{"text": "Hallo"}')::text, true);
select is(current_setting('test.c2')::jsonb ->> 'verdict', 'almost', 'one-letter typo is almost');
select is((current_setting('test.c2')::jsonb ->> 'revealed') || '/' || (current_setting('test.c2')::jsonb ->> 'final') || '/' || (current_setting('test.c2')::jsonb ->> 'requeued')
    || '/' || (current_setting('test.c2')::jsonb ->> 'display_answer'),
  'true/true/false/Hello', 'almost reveals the answer, is final and is not re-queued');

-- An exercise archived after the run started can no longer be answered nor block completion
reset role;
update public.exercises set status = 'archived' where id = current_setting('test.fill')::uuid;
set local role authenticated;
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.c_run'), current_setting('test.fill'), 'c0000000-0000-4000-8000-000000000103', '{"give_up": true}'),
  'P0001', 'exercise_not_in_lesson', 'give-up on an archived exercise of the queue is refused');
select throws_ok(format('select public.complete_lesson(%L)', current_setting('test.c_run')), 'P0001', 'attempts_incomplete', 'the re-check is still required');
select is(public.a3_submit(current_setting('test.c_run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000104', '{"option_id": "o1"}') ->> 'verdict', 'correct', 're-check answered');
select is(public.complete_lesson(current_setting('test.c_run')::uuid) ? 'accuracy_by_stage', true, 'run completes without the archived exercise');

-- A new run, then an import changes the lesson: queue synced on the next get_lesson/start_lesson
select set_config('test.c_run2', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.c_en')::uuid) ->> 'id', true);
select is((select queue from public.lesson_runs where id = current_setting('test.c_run2')::uuid),
  array[current_setting('test.mcq'), current_setting('test.tr')]::uuid[], 'new run queues only published exercises');
select is(public.a3_submit(current_setting('test.c_run2'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000105', '{"option_id": "o2"}') ->> 'verdict', 'incorrect', 'first attempt on the new run');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.c_run2'), current_setting('test.later'), 'c0000000-0000-4000-8000-000000000106', '{"option_id": "o1"}'),
  'P0001', 'exercise_not_in_lesson', 'unpublished exercise is not answerable');
reset role;
update public.exercises set status = 'published' where id = current_setting('test.later')::uuid;
update public.exercises set status = 'archived' where id = current_setting('test.tr')::uuid;
update public.lessons set version = version + 1 where id = current_setting('test.l1')::uuid;
set local role authenticated;
select set_config('test.payload', public.get_lesson(current_setting('test.l1')::uuid, current_setting('test.c_en')::uuid)::text, true);
select is(current_setting('test.payload')::jsonb #> '{run,queue}',
  jsonb_build_array(current_setting('test.mcq'), current_setting('test.later')), 'get_lesson drops archived and appends newly published exercises');
select is((select content_version from public.lesson_runs where id = current_setting('test.c_run2')::uuid), 2, 'run takes the lesson content_version');
select is(jsonb_array_length(current_setting('test.payload')::jsonb -> 'attempts'), 1, 'attempts kept on sync');
select is(public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.c_en')::uuid) -> 'queue',
  jsonb_build_array(current_setting('test.mcq'), current_setting('test.later')), 'start_lesson returns the synced queue');
select is(public.a3_submit(current_setting('test.c_run2'), current_setting('test.later'), 'c0000000-0000-4000-8000-000000000107', '{"option_id": "o1"}') ->> 'verdict', 'correct', 'newly published exercise is answerable');

-- Internal helpers are not callable by clients
select throws_ok($$select public.grade_exercise('mcq', '{"correct_option_id": "o1"}', '{}', '[]', 'en', '{"option_id": "o1"}')$$, '42501', null, 'authenticated cannot call grade_exercise');
select throws_ok($$select public.grading_normalize('x', 'en', '{}')$$, '42501', null, 'authenticated cannot call grading_normalize');
select throws_ok(format('select public.lesson_for_path(%L, %L, %L)', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.l1'), current_setting('test.b_en')), '42501', null, 'authenticated cannot call lesson_for_path');

-- Claims without a subject are not authenticated
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(format('select public.start_lesson(%L, %L)', current_setting('test.l1'), current_setting('test.b_en')), '42501', 'not_authenticated', 'start needs a subject');
select throws_ok(format('select public.a3_submit(%L, %L, %L, %L)', current_setting('test.b_run'), current_setting('test.mcq'), 'c0000000-0000-4000-8000-000000000032', '{"option_id": "o1"}'),
  '42501', 'not_authenticated', 'submit needs a subject');

-- ===== anon =====
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(format('select public.get_lesson(%L, %L)', current_setting('test.l1'), current_setting('test.b_en')), '42501', null, 'anon cannot call get_lesson');
select throws_ok(format('select * from public.path_lessons(%L)', current_setting('test.b_en')), '42501', null, 'anon cannot call path_lessons');
select throws_ok($$select count(*) from public.attempts$$, '42501', null, 'anon cannot read attempts');
select is(
  (select count(*)::int
   from unnest(array[
     'public.get_lesson(uuid, uuid)', 'public.start_lesson(uuid, uuid, uuid, timestamptz)', 'public.save_lesson_cursor(uuid, smallint)',
     'public.submit_exercise(uuid, uuid, integer, uuid, jsonb, smallint, integer, smallint, timestamptz)',
     'public.complete_lesson(uuid, timestamptz)', 'public.path_lessons(uuid)',
     'public.lesson_run_json(uuid, text, smallint, uuid[], timestamptz, jsonb)', 'public.lesson_run_sync(uuid, uuid, integer)'
   ]) as f(sig)
   where has_function_privilege('anon', f.sig, 'execute')),
  0, 'anon has no execute on the lesson RPCs and helpers');

select * from finish();
rollback;
