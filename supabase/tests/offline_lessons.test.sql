begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- Offline learning (20261020000100_offline_lessons.sql): manifest, packs with answer keys, start_lesson with a
-- client-minted run id and complete_lesson with a client time.

-- ===== Content: one EN core program (pre_a1 -> a1), one unit, L1 (3 published exercises + a draft and an approved
-- one that must not be shipped), L2/L3/L4 without exercises =====
select isnt(content_private.import_bundle($bundle$
{
  "bundle_version": 1,
  "git_sha": null,
  "sources": [
    {"id": "a7000000-0000-4000-8000-000000000001", "key": "src:a7-test", "title": "A7 test", "author_or_org": "Linguo", "url": null,
     "license": "own", "attribution_required": false,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "1111111111111111111111111111111111111111111111111111111111111111"}
  ],
  "programs": [
    {"id": "a7000000-0000-4000-8000-000000000002", "key": "en:program:a7-test-core", "source_id": "a7000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình ngoại tuyến"}, "description": {"vi": "Dùng cho kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 900,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "2222222222222222222222222222222222222222222222222222222222222222"}
  ],
  "units": [
    {"id": "a7000000-0000-4000-8000-000000000003", "key": "en:unit:a7-test-unit", "source_id": "a7000000-0000-4000-8000-000000000001",
     "program_id": "a7000000-0000-4000-8000-000000000002", "order_index": 1, "title": {"vi": "Đơn vị ngoại tuyến"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "3333333333333333333333333333333333333333333333333333333333333333"}
  ],
  "lessons": [
    {"id": "a7000000-0000-4000-8000-000000000011", "key": "en:lesson:a7-test-l1", "source_id": "a7000000-0000-4000-8000-000000000001",
     "unit_id": "a7000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Chào hỏi"}, "objectives": [{"vi": "Chào bằng tiếng Anh"}],
     "body": [
       {"type": "objective", "text": {"vi": "Chào hỏi"}},
       {"type": "example", "target": "Hello!", "target_lang": "en", "translation": {"vi": "Xin chào!"}},
       {"type": "summary", "points": [{"vi": "Hello = xin chào"}]}
     ],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "4444444444444444444444444444444444444444444444444444444444444444"},
    {"id": "a7000000-0000-4000-8000-000000000012", "key": "en:lesson:a7-test-l2", "source_id": "a7000000-0000-4000-8000-000000000001",
     "unit_id": "a7000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 2,
     "title": {"vi": "Bài hai"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["speaking"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "5555555555555555555555555555555555555555555555555555555555555555"},
    {"id": "a7000000-0000-4000-8000-000000000013", "key": "en:lesson:a7-test-l3", "source_id": "a7000000-0000-4000-8000-000000000001",
     "unit_id": "a7000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 3,
     "title": {"vi": "Bài ba"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["speaking"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3"},
    {"id": "a7000000-0000-4000-8000-000000000014", "key": "en:lesson:a7-test-l4", "source_id": "a7000000-0000-4000-8000-000000000001",
     "unit_id": "a7000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 4,
     "title": {"vi": "Bài bốn"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["speaking"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4"}
  ],
  "lesson_prerequisites": [],
  "learning_items": [
    {"id": "a7000000-0000-4000-8000-000000000021", "key": "en:item:a7-test-hello", "source_id": "a7000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "hello"}, "back": {"meaning": {"vi": "xin chào"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666666"}
  ],
  "lesson_items": [
    {"lesson_id": "a7000000-0000-4000-8000-000000000011", "item_id": "a7000000-0000-4000-8000-000000000021", "position": 1, "role": "introduce"}
  ],
  "exercises": [
    {"id": "a7000000-0000-4000-8000-000000000031", "key": "en:exercise:a7-test-mcq", "source_id": "a7000000-0000-4000-8000-000000000001",
     "lesson_id": "a7000000-0000-4000-8000-000000000011", "item_id": "a7000000-0000-4000-8000-000000000021", "order_index": 3,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Chọn câu chào", "stem_lang": "vi", "options": [{"id": "o1", "text": "Hello", "lang": "en"}, {"id": "o2", "text": "Goodbye", "lang": "en"}], "shuffle": true},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "7777777777777777777777777777777777777777777777777777777777777777",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello là lời chào."}, "display_answer": "Hello"}},
    {"id": "a7000000-0000-4000-8000-000000000032", "key": "en:exercise:a7-test-fill", "source_id": "a7000000-0000-4000-8000-000000000001",
     "lesson_id": "a7000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 2,
     "exercise_type": "fill_blank", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"template": "Nice to {{b1}} you.", "blanks": [{"id": "b1"}]},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "8888888888888888888888888888888888888888888888888888888888888888",
     "key_data": {"answer_key": {"blanks": {"b1": ["meet"]}},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Nice to meet you."}, "display_answer": "meet"}},
    {"id": "a7000000-0000-4000-8000-000000000033", "key": "en:exercise:a7-test-translate", "source_id": "a7000000-0000-4000-8000-000000000001",
     "lesson_id": "a7000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 1,
     "exercise_type": "translate", "stage": "application", "answer_lang": "en", "difficulty": 1,
     "prompt": {"source_text": "Xin chào", "source_lang": "vi", "direction": "vi_to_target"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "9999999999999999999999999999999999999999999999999999999999999999",
     "key_data": {"answer_key": {"accepted": ["Hello", "Hi", "Hello there"]},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 1, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello hoặc Hi."}, "display_answer": "Hello"}},
    {"id": "a7000000-0000-4000-8000-000000000034", "key": "en:exercise:a7-test-draft", "source_id": "a7000000-0000-4000-8000-000000000001",
     "lesson_id": "a7000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 4,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Bản nháp", "stem_lang": "vi", "options": [{"id": "o1", "text": "Yes", "lang": "en"}, {"id": "o2", "text": "No", "lang": "en"}], "shuffle": true},
     "status": "draft", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Đáp án nháp."}, "display_answer": "Yes"}},
    {"id": "a7000000-0000-4000-8000-000000000035", "key": "en:exercise:a7-test-later", "source_id": "a7000000-0000-4000-8000-000000000001",
     "lesson_id": "a7000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 5,
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

select set_config('test.l1', 'a7000000-0000-4000-8000-000000000011', true);
select set_config('test.l2', 'a7000000-0000-4000-8000-000000000012', true);
select set_config('test.l3', 'a7000000-0000-4000-8000-000000000013', true);
select set_config('test.l4', 'a7000000-0000-4000-8000-000000000014', true);
select set_config('test.mcq', 'a7000000-0000-4000-8000-000000000031', true);
select set_config('test.fill', 'a7000000-0000-4000-8000-000000000032', true);
select set_config('test.tr', 'a7000000-0000-4000-8000-000000000033', true);
select set_config('test.r1', 'b7000000-0000-4000-8000-000000000001', true);
select set_config('test.r1b', 'b7000000-0000-4000-8000-000000000002', true);
select set_config('test.r2', 'b7000000-0000-4000-8000-000000000003', true);
select set_config('test.r3', 'b7000000-0000-4000-8000-000000000004', true);
select set_config('test.r4', 'b7000000-0000-4000-8000-000000000005', true);

create function public.a7_leaks(p jsonb)
returns integer
language sql
immutable
as $$
  select count(*)::int
  from unnest(array['answer_key', 'accepted', 'correct_option_id', 'orders', 'explanation', 'display_answer', 'known_wrong', 'rubric']) as k
  where jsonb_path_exists(p, ('$.**.' || k)::jsonpath);
$$;

create function public.a7_submit(p_run text, p_exercise text, p_key text, p_response jsonb, p_client_at timestamptz)
returns jsonb
language sql
volatile
as $$
  select public.submit_exercise(p_run::uuid, p_exercise::uuid, 1, p_key::uuid, p_response, 2::smallint, 1500, 0::smallint, p_client_at);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}');

-- ===== Privileges (as the migration owner) =====
select ok(not has_function_privilege('anon', 'public.offline_lesson_packs(uuid, uuid[])', 'execute'), 'anon cannot execute offline_lesson_packs');
select ok(not has_function_privilege('anon', 'public.offline_lesson_manifest(uuid)', 'execute'), 'anon cannot execute offline_lesson_manifest');
select ok(not has_function_privilege('anon', 'public.start_lesson(uuid, uuid, uuid, timestamptz)', 'execute'), 'anon cannot execute start_lesson');
select ok(not has_function_privilege('anon', 'public.complete_lesson(uuid, timestamptz)', 'execute'), 'anon cannot execute complete_lesson');
select ok(has_function_privilege('authenticated', 'public.offline_lesson_packs(uuid, uuid[])', 'execute'), 'authenticated can execute offline_lesson_packs');
select ok(not has_function_privilege('authenticated', 'public.offline_lesson_public_json(uuid)', 'execute'), 'authenticated cannot execute the internal pack helper');
select is(to_regprocedure('public.start_lesson(uuid, uuid)'), null, 'the old 2-argument start_lesson is gone');
select is(to_regprocedure('public.complete_lesson(uuid)'), null, 'the old 1-argument complete_lesson is gone');

-- ===== User A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates an EN path');
select lives_ok($$select public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates a KO path');
select set_config('test.a_en', (select id::text from public.learning_paths where language_code = 'en'), true);
select set_config('test.a_ko', (select id::text from public.learning_paths where language_code = 'ko'), true);

-- ----- manifest -----
select is(
  (select content_version from public.offline_lesson_manifest(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid),
  1, 'manifest carries the lesson content_version');
select is(
  (select exercise_versions_hash from public.offline_lesson_manifest(current_setting('test.a_en')::uuid) where lesson_id = current_setting('test.l1')::uuid),
  md5(current_setting('test.mcq') || ':1,' || current_setting('test.fill') || ':1,' || current_setting('test.tr') || ':1'),
  'manifest exercise hash covers the three published exercises (ids sorted) and no draft');
select is(
  (select count(*)::int from public.offline_lesson_manifest(current_setting('test.a_en')::uuid) where lesson_id in
    (current_setting('test.l1')::uuid, current_setting('test.l2')::uuid, current_setting('test.l3')::uuid, current_setting('test.l4')::uuid)),
  4, 'manifest lists the four test lessons');
select is(
  (select count(*)::int from public.offline_lesson_manifest(current_setting('test.a_ko')::uuid) where lesson_id = current_setting('test.l1')::uuid),
  0, 'KO path manifest has no EN lesson');
select is((select count(*)::int from public.offline_lesson_manifest(gen_random_uuid())), 0, 'unknown path: empty manifest');

-- ----- packs -----
select set_config('test.get_l1', public.get_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid)::text, true);
select set_config('test.packs', public.offline_lesson_packs(current_setting('test.a_en')::uuid,
  array[current_setting('test.l1')::uuid, current_setting('test.l2')::uuid, 'a7ffffff-ffff-4fff-8fff-ffffffffffff']::uuid[])::text, true);
select is(jsonb_array_length(current_setting('test.packs')::jsonb -> 'packs'), 2, 'two packs for the two known lessons');
select is(current_setting('test.packs')::jsonb -> 'missing', jsonb_build_array('a7ffffff-ffff-4fff-8fff-ffffffffffff'), 'unknown lesson id is reported missing');
select set_config('test.pack_l1', (select p::text from jsonb_array_elements(current_setting('test.packs')::jsonb -> 'packs') as p where p #>> '{lesson,id}' = current_setting('test.l1')), true);
select is(
  current_setting('test.pack_l1')::jsonb - 'keys' - 'content_version',
  current_setting('test.get_l1')::jsonb - 'run' - 'attempts',
  'pack lesson, items and exercises are identical to get_lesson');
select is((current_setting('test.pack_l1')::jsonb ->> 'content_version')::int, 1, 'pack content_version');
select is(jsonb_array_length(current_setting('test.pack_l1')::jsonb -> 'keys'), 3, 'keys only for the three published exercises');
select is(
  (select to_jsonb(k) - 'created_at' from jsonb_array_elements(current_setting('test.pack_l1')::jsonb -> 'keys') as k where k ->> 'exercise_id' = current_setting('test.mcq')),
  jsonb_build_object('exercise_id', current_setting('test.mcq'), 'version', 1, 'answer_key', jsonb_build_object('correct_option_id', 'o1'),
    'rubric', jsonb_build_object('punctuation', 'ignore', 'diacritics', 'strict', 'ko_spacing', 'lenient', 'typo_tolerance', 0, 'expand_contractions', true),
    'known_wrong', '[]'::jsonb, 'explanation', jsonb_build_object('vi', 'Hello là lời chào.'), 'display_answer', 'Hello'),
  'mcq key is shipped with answer, rubric, explanation and display answer');
select is(
  (select k #>> '{rubric,typo_tolerance}' from jsonb_array_elements(current_setting('test.pack_l1')::jsonb -> 'keys') as k where k ->> 'exercise_id' = current_setting('test.tr')),
  '1', 'translate key carries its rubric');
select ok((select (k ->> 'created_at') is not null from jsonb_array_elements(current_setting('test.pack_l1')::jsonb -> 'keys') as k where k ->> 'exercise_id' = current_setting('test.fill')), 'keys carry created_at');
select is(public.a7_leaks(current_setting('test.pack_l1')::jsonb - 'keys'), 0, 'answer fields appear only under keys');
select is(
  (select jsonb_array_length(p -> 'keys') from jsonb_array_elements(current_setting('test.packs')::jsonb -> 'packs') as p where p #>> '{lesson,id}' = current_setting('test.l2')),
  0, 'a lesson without exercises has no keys');
select is(
  public.offline_lesson_packs(current_setting('test.a_ko')::uuid, array[current_setting('test.l1')::uuid]),
  jsonb_build_object('packs', '[]'::jsonb, 'missing', jsonb_build_array(current_setting('test.l1'))),
  'an EN lesson is not packed for the KO path');
select is(public.offline_lesson_packs(current_setting('test.a_en')::uuid, '{}'::uuid[]), '{"packs": [], "missing": []}'::jsonb, 'empty id list: empty answer');
select throws_ok(format('select public.offline_lesson_packs(%L, (select array_agg(gen_random_uuid()) from generate_series(1, 21)))', current_setting('test.a_en')),
  'P0001', 'too_many_lessons', 'more than 20 ids refused');
select throws_ok(format('select public.offline_lesson_packs(%L, null)', current_setting('test.a_en')), 'P0001', 'invalid_lessons', 'null id list refused');
select throws_ok(format('select public.offline_lesson_packs(%L, array[%L]::uuid[])', gen_random_uuid(), current_setting('test.l1')), 'P0001', 'path_not_found', 'unknown path refused');
select throws_ok($$select count(*) from public.offline_pack_requests$$, '42501', null, 'the rate-limit log is not readable by clients');

-- Rate limit: 60 calls per hour (the calls above that were served count too).
do $$
declare
  n integer := 0;
begin
  loop
    begin
      perform public.offline_lesson_packs(current_setting('test.a_en')::uuid, '{}'::uuid[]);
      n := n + 1;
    exception when others then
      if sqlerrm = 'rate_limited' then
        exit;
      end if;
      raise;
    end;
  end loop;
  perform set_config('test.n_calls', n::text, true);
end;
$$;
select ok(current_setting('test.n_calls')::int between 40 and 59, 'rate limit stops the packs after 60 calls in an hour');
select throws_ok(format('select public.offline_lesson_packs(%L, array[%L]::uuid[])', current_setting('test.a_en'), current_setting('test.l1')), 'P0001', 'rate_limited', 'rate_limited persists');

-- ----- start_lesson with a client-minted run id -----
select is(
  public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid, current_setting('test.r1')::uuid, now() - interval '1 hour') ->> 'id',
  current_setting('test.r1'), 'start_lesson creates the run with the client id');
select is((select started_at from public.lesson_runs where id = current_setting('test.r1')::uuid), now() - interval '1 hour', 'started_at honours a client time within 12 hours');
select is(
  public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid, current_setting('test.r1')::uuid, now() - interval '1 hour') ->> 'id',
  current_setting('test.r1'), 'replaying the start returns the same run');
select is((select count(*)::int from public.lesson_runs), 1, 'the replay did not create a second run');
select is(
  public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid, current_setting('test.r1b')::uuid, now()) ->> 'id',
  current_setting('test.r1'), 'another run id while one is open returns the open run (the client remaps)');
select is(
  public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_en')::uuid) ->> 'id',
  current_setting('test.r1'), 'the 2-argument call still works');
select throws_ok(
  format('select public.start_lesson(%L, %L, %L, null)', current_setting('test.l2'), current_setting('test.a_en'), current_setting('test.r1')),
  'P0001', 'run_id_conflict', 'a run id already used by another lesson conflicts');
select is(
  public.start_lesson(current_setting('test.l2')::uuid, current_setting('test.a_en')::uuid, current_setting('test.r2')::uuid, now() + interval '2 days') ->> 'id',
  current_setting('test.r2'), 'a run with a future client time starts');
select ok((select started_at <= now() from public.lesson_runs where id = current_setting('test.r2')::uuid), 'a client time in the future is clamped');
select is(
  public.start_lesson(current_setting('test.l3')::uuid, current_setting('test.a_en')::uuid, current_setting('test.r3')::uuid, now() - interval '3 days') ->> 'id',
  current_setting('test.r3'), 'a run with an old client time starts');
select ok((select started_at > now() - interval '1 minute' from public.lesson_runs where id = current_setting('test.r3')::uuid), 'a client time older than 12 hours is replaced by the server time');

-- ----- answers replayed with client times, then complete_lesson -----
select is(
  (public.a7_submit(current_setting('test.r1'), current_setting('test.mcq'), 'c7000000-0000-4000-8000-000000000001', '{"option_id": "o1"}', now() - interval '50 minutes') ->> 'verdict'),
  'correct', 'offline mcq answer is graded by the server');
select is((select client_at from public.attempts where idempotency_key = 'c7000000-0000-4000-8000-000000000001'), now() - interval '50 minutes', 'the answer keeps its client time');
select lives_ok(format('select public.a7_submit(%L, %L, %L, %L::jsonb, now() - interval ''40 minutes'')',
  current_setting('test.r1'), current_setting('test.fill'), 'c7000000-0000-4000-8000-000000000002', '{"blanks": {"b1": "meet"}}'), 'offline fill answer');
select lives_ok(format('select public.a7_submit(%L, %L, %L, %L::jsonb, now() - interval ''30 minutes'')',
  current_setting('test.r1'), current_setting('test.tr'), 'c7000000-0000-4000-8000-000000000003', '{"text": "Hello"}'), 'offline translate answer');
select set_config('test.sum1', public.complete_lesson(current_setting('test.r1')::uuid, now() - interval '20 minutes')::text, true);
select is((select completed_at from public.lesson_runs where id = current_setting('test.r1')::uuid), now() - interval '20 minutes', 'completed_at honours a client time after the last attempt');
select is((current_setting('test.sum1')::jsonb ->> 'completed_at')::timestamptz, now() - interval '20 minutes', 'the summary carries the same completed_at');
select is(public.complete_lesson(current_setting('test.r1')::uuid), current_setting('test.sum1')::jsonb, 'complete_lesson is idempotent');
select is((select count(*)::int from public.review_cards), 2, 'completing enrols the introduced item (2 directions)');

-- Client time before the run start / the last attempt: the server time is used.
select lives_ok(format('select public.complete_lesson(%L)', current_setting('test.r2')), 'the 1-argument call completes a run without exercises');
select is((select completed_at from public.lesson_runs where id = current_setting('test.r2')::uuid), now(), 'no client time: server time');
select lives_ok(format('select public.complete_lesson(%L, now() - interval ''1 hour'')', current_setting('test.r3')), 'complete with a client time before the run start');
select is((select completed_at from public.lesson_runs where id = current_setting('test.r3')::uuid), now(), 'a client time before the run start is replaced by the server time');
select is(
  public.start_lesson(current_setting('test.l4')::uuid, current_setting('test.a_en')::uuid, current_setting('test.r4')::uuid, now()) ->> 'id',
  current_setting('test.r4'), 'run 4 starts');
select lives_ok(format('select public.complete_lesson(%L, now() + interval ''1 day'')', current_setting('test.r4')), 'complete with a client time in the future');
select ok((select completed_at <= now() from public.lesson_runs where id = current_setting('test.r4')::uuid), 'a client completion time in the future is clamped');

-- ===== User B =====
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'B creates an EN path');
select set_config('test.b_en', (select id::text from public.learning_paths where language_code = 'en'), true);
select throws_ok(format('select public.offline_lesson_packs(%L, array[%L]::uuid[])', current_setting('test.a_en'), current_setting('test.l1')), 'P0001', 'path_not_found', 'B cannot pack A''s path');
select is((select count(*)::int from public.offline_lesson_manifest(current_setting('test.a_en')::uuid)), 0, 'B sees no manifest for A''s path');
select throws_ok(format('select public.start_lesson(%L, %L, %L, null)', current_setting('test.l1'), current_setting('test.b_en'), current_setting('test.r1')),
  'P0001', 'run_id_conflict', 'B cannot reuse A''s run id');

-- ===== anon =====
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(format('select public.offline_lesson_packs(%L, array[%L]::uuid[])', current_setting('test.a_en'), current_setting('test.l1')), '42501', null, 'anon cannot call offline_lesson_packs');

select * from finish();
rollback;
