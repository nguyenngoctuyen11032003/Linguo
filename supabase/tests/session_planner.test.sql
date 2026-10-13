begin;
create extension if not exists pgtap with schema extensions;
select plan(169);

-- ===== Content =====
-- EN core program (pre_a1 -> a1): L1 (vocabulary; mcq, fill, translate), L2 (requires L1), L3 (grammar; fill),
-- L4 (reading; 11 mcq), L5 (draft). An EN goal program for another goal (LO) and a KO core program (LK).
-- Imported as the migration owner; the import archives seeded content absent from this bundle (rolled back).
-- Every row gets the shared defaults and a content_hash derived from its key.
create function public.p6_fix(b jsonb) returns jsonb language sql immutable as $$
  select b || (
    select jsonb_object_agg(k, (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', 'published', 'is_demo', true, 'reviewed_by', null, 'reviewed_at', null)
        || case when k = 'sources' then '{}'::jsonb else jsonb_build_object('source_id', 'c6000000-0000-4000-8000-000000000001') end
        || e
        || jsonb_build_object('content_hash', md5(e ->> 'key') || md5((e ->> 'key') || '#'))), '[]'::jsonb)
      from jsonb_array_elements(b -> k) as e))
    from unnest(array['sources', 'programs', 'units', 'lessons', 'learning_items', 'exercises']) as k
  );
$$;

create function public.p6_id(n integer) returns text language sql immutable as $$
  select 'c6000000-0000-4000-8000-' || lpad(n::text, 12, '0');
$$;

with b as (select $bundle$
{
  "bundle_version": 1,
  "git_sha": null,
  "sources": [
    {"id": "c6000000-0000-4000-8000-000000000001", "key": "src:p6-test", "title": "P6 test", "author_or_org": "Linguo", "url": null,
     "license": "own", "attribution_required": false}
  ],
  "programs": [
    {"id": "c6000000-0000-4000-8000-000000000002", "key": "en:program:p6-core", "language_code": "en",
     "title": {"vi": "Chương trình thử"}, "description": {"vi": "Kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 900},
    {"id": "c6000000-0000-4000-8000-000000000004", "key": "en:program:p6-goal-other", "language_code": "en",
     "title": {"vi": "Mục tiêu khác"}, "description": {"vi": "Kiểm thử"}, "kind": "goal", "goal_types": ["work_it"],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 901},
    {"id": "c6000000-0000-4000-8000-000000000005", "key": "ko:program:p6-core", "language_code": "ko",
     "title": {"vi": "Tiếng Hàn thử"}, "description": {"vi": "Kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "hangul", "level_to": "topik1", "order_index": 902}
  ],
  "units": [
    {"id": "c6000000-0000-4000-8000-000000000003", "key": "en:unit:p6-core", "program_id": "c6000000-0000-4000-8000-000000000002",
     "order_index": 1, "title": {"vi": "Đơn vị thử"}},
    {"id": "c6000000-0000-4000-8000-000000000008", "key": "en:unit:p6-goal-other", "program_id": "c6000000-0000-4000-8000-000000000004",
     "order_index": 1, "title": {"vi": "Đơn vị mục tiêu khác"}},
    {"id": "c6000000-0000-4000-8000-000000000009", "key": "ko:unit:p6-core", "program_id": "c6000000-0000-4000-8000-000000000005",
     "order_index": 1, "title": {"vi": "Đơn vị tiếng Hàn"}}
  ],
  "lessons": [
    {"id": "c6000000-0000-4000-8000-000000000011", "key": "en:lesson:p6-l1", "unit_id": "c6000000-0000-4000-8000-000000000003",
     "language_code": "en", "level_code": "pre_a1", "order_index": 1, "title": {"vi": "Chào hỏi"}, "objectives": [{"vi": "Chào"}],
     "body": [{"type": "objective", "text": {"vi": "Chào hỏi"}}], "estimated_minutes": 7, "skills": ["vocabulary"]},
    {"id": "c6000000-0000-4000-8000-000000000012", "key": "en:lesson:p6-l2", "unit_id": "c6000000-0000-4000-8000-000000000003",
     "language_code": "en", "level_code": "pre_a1", "order_index": 2, "title": {"vi": "Giới thiệu"}, "objectives": [{"vi": "Giới thiệu"}],
     "body": [{"type": "objective", "text": {"vi": "Giới thiệu"}}], "estimated_minutes": 5, "skills": ["speaking"]},
    {"id": "c6000000-0000-4000-8000-000000000013", "key": "en:lesson:p6-l3", "unit_id": "c6000000-0000-4000-8000-000000000003",
     "language_code": "en", "level_code": "pre_a1", "order_index": 3, "title": {"vi": "Động từ to be"}, "objectives": [{"vi": "Dùng am"}],
     "body": [{"type": "objective", "text": {"vi": "To be"}}], "estimated_minutes": 6, "skills": ["grammar"]},
    {"id": "c6000000-0000-4000-8000-000000000014", "key": "en:lesson:p6-l4", "unit_id": "c6000000-0000-4000-8000-000000000003",
     "language_code": "en", "level_code": "pre_a1", "order_index": 4, "title": {"vi": "Đọc hiểu"}, "objectives": [{"vi": "Đọc"}],
     "body": [{"type": "objective", "text": {"vi": "Đọc"}}], "estimated_minutes": 8, "skills": ["reading"]},
    {"id": "c6000000-0000-4000-8000-000000000015", "key": "en:lesson:p6-l5-draft", "unit_id": "c6000000-0000-4000-8000-000000000003",
     "language_code": "en", "level_code": "pre_a1", "order_index": 5, "title": {"vi": "Bản nháp"}, "objectives": [{"vi": "Nháp"}],
     "body": [{"type": "objective", "text": {"vi": "Nháp"}}], "estimated_minutes": 5, "skills": ["reading"], "status": "draft"},
    {"id": "c6000000-0000-4000-8000-000000000016", "key": "en:lesson:p6-other-goal", "unit_id": "c6000000-0000-4000-8000-000000000008",
     "language_code": "en", "level_code": "pre_a1", "order_index": 1, "title": {"vi": "Bài mục tiêu khác"}, "objectives": [{"vi": "Khác"}],
     "body": [{"type": "objective", "text": {"vi": "Khác"}}], "estimated_minutes": 5, "skills": ["vocabulary"]},
    {"id": "c6000000-0000-4000-8000-000000000017", "key": "ko:lesson:p6-ko", "unit_id": "c6000000-0000-4000-8000-000000000009",
     "language_code": "ko", "level_code": "hangul", "order_index": 1, "title": {"vi": "Bảng chữ cái"}, "objectives": [{"vi": "Hangul"}],
     "body": [{"type": "objective", "text": {"vi": "Hangul"}}], "estimated_minutes": 5, "skills": ["reading"]}
  ],
  "lesson_prerequisites": [
    {"lesson_id": "c6000000-0000-4000-8000-000000000012", "prerequisite_lesson_id": "c6000000-0000-4000-8000-000000000011"}
  ],
  "learning_items": [
    {"id": "c6000000-0000-4000-8000-000000000021", "key": "en:item:p6-hello", "language_code": "en", "item_type": "vocab",
     "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"], "front": {"text": "hello"},
     "back": {"meaning": {"vi": "xin chào"}, "examples": []}, "audio_path": null},
    {"id": "c6000000-0000-4000-8000-000000000022", "key": "en:item:p6-bye", "language_code": "en", "item_type": "vocab",
     "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"], "front": {"text": "bye"},
     "back": {"meaning": {"vi": "tạm biệt"}, "examples": []}, "audio_path": null},
    {"id": "c6000000-0000-4000-8000-000000000023", "key": "en:item:p6-thanks", "language_code": "en", "item_type": "vocab",
     "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"], "front": {"text": "thanks"},
     "back": {"meaning": {"vi": "cảm ơn"}, "examples": []}, "audio_path": null}
  ],
  "lesson_items": [
    {"lesson_id": "c6000000-0000-4000-8000-000000000011", "item_id": "c6000000-0000-4000-8000-000000000021", "position": 1, "role": "introduce"}
  ],
  "exercises": [
    {"id": "c6000000-0000-4000-8000-000000000031", "key": "en:exercise:p6-mcq", "lesson_id": "c6000000-0000-4000-8000-000000000011",
     "item_id": "c6000000-0000-4000-8000-000000000021", "order_index": 1, "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Chọn câu chào", "stem_lang": "vi", "options": [{"id": "o1", "text": "Hello", "lang": "en"}, {"id": "o2", "text": "Goodbye", "lang": "en"}], "shuffle": true},
     "key_data": {"answer_key": {"correct_option_id": "o1"}, "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello là lời chào."}, "display_answer": "Hello"}},
    {"id": "c6000000-0000-4000-8000-000000000032", "key": "en:exercise:p6-fill", "lesson_id": "c6000000-0000-4000-8000-000000000011",
     "item_id": null, "order_index": 2, "exercise_type": "fill_blank", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"template": "Nice to {{b1}} you.", "blanks": [{"id": "b1"}]},
     "key_data": {"answer_key": {"blanks": {"b1": ["meet"]}}, "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Nice to meet you."}, "display_answer": "meet"}},
    {"id": "c6000000-0000-4000-8000-000000000033", "key": "en:exercise:p6-translate", "lesson_id": "c6000000-0000-4000-8000-000000000011",
     "item_id": null, "order_index": 3, "exercise_type": "translate", "stage": "application", "answer_lang": "en", "difficulty": 1,
     "prompt": {"source_text": "Xin chào", "source_lang": "vi", "direction": "vi_to_target"},
     "key_data": {"answer_key": {"accepted": ["Hello", "Hi"]}, "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello hoặc Hi."}, "display_answer": "Hello"}},
    {"id": "c6000000-0000-4000-8000-000000000034", "key": "en:exercise:p6-l3-fill", "lesson_id": "c6000000-0000-4000-8000-000000000013",
     "item_id": null, "order_index": 1, "exercise_type": "fill_blank", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"template": "I {{b1}} a student.", "blanks": [{"id": "b1"}]},
     "key_data": {"answer_key": {"blanks": {"b1": ["am"]}}, "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "I am."}, "display_answer": "am"}}
  ]
}
$bundle$::jsonb as j)
select isnt(content_private.import_bundle(public.p6_fix(jsonb_set(b.j, '{exercises}', (b.j -> 'exercises') || (
  -- L4: 11 mcq exercises (ids 41..51).
  select jsonb_agg(jsonb_build_object(
    'id', public.p6_id(n), 'key', 'en:exercise:p6-l4-' || n, 'lesson_id', public.p6_id(14), 'item_id', null, 'order_index', n,
    'exercise_type', 'mcq', 'stage', 'recognition', 'answer_lang', 'en', 'difficulty', 1,
    'prompt', jsonb_build_object('stem', 'Câu ' || n, 'stem_lang', 'vi', 'shuffle', true,
      'options', '[{"id": "o1", "text": "Yes", "lang": "en"}, {"id": "o2", "text": "No", "lang": "en"}]'::jsonb),
    'key_data', jsonb_build_object('answer_key', '{"correct_option_id": "o1"}'::jsonb,
      'rubric', '{"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true}'::jsonb,
      'known_wrong', '[]'::jsonb, 'explanation', '{"vi": "Yes."}'::jsonb, 'display_answer', 'Yes')) order by n)
  from generate_series(41, 51) as n)))), null, 'test bundle imports')
from b;

select set_config('test.l1', public.p6_id(11), true);
select set_config('test.l2', public.p6_id(12), true);
select set_config('test.l3', public.p6_id(13), true);
select set_config('test.l4', public.p6_id(14), true);
select set_config('test.l5', public.p6_id(15), true);
select set_config('test.lo', public.p6_id(16), true);
select set_config('test.lk', public.p6_id(17), true);

-- ===== Helpers (rolled back) =====
create function public.p6_as(p_sub text) returns void language sql volatile as $$
  select set_config('request.jwt.claims', case when p_sub is null then '{"role": "authenticated"}'
    else jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text end, true);
$$;

create function public.p6_act(
  p_id text, p_kind text, p_minutes integer, p_lesson text default null, p_limit integer default null, p_priority integer default 50
) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'kind', p_kind, 'minutes', p_minutes, 'lesson_id', p_lesson, 'review_limit', p_limit,
    'title_vi', 'Hoạt động ' || p_id, 'reason_vi', 'Lý do ' || p_id, 'priority', p_priority, 'status', 'pending', 'seconds_spent', 0);
$$;

create function public.p6_plan(p_acts jsonb, p_minutes integer default 30) returns jsonb language sql immutable as $$
  select jsonb_build_object('minutes', p_minutes, 'activities', p_acts, 'focus_vi', 'Ưu tiên ôn tập', 'backlog_mode', false);
$$;

-- The standard 30-minute plan: review, lesson L1, practice L3, recap.
create function public.p6_std() returns jsonb language sql immutable as $$
  select public.p6_plan(jsonb_build_array(
    public.p6_act('a1', 'review', 6, null, 20, 75),
    public.p6_act('a2', 'lesson', 10, public.p6_id(11), null, 60),
    public.p6_act('a3', 'practice', 10, public.p6_id(13), null, 54),
    public.p6_act('a4', 'recap', 3, null, null, 10)));
$$;

-- The standard plan with one activity field replaced.
create function public.p6_bad(p_index integer, p_field text, p_value jsonb) returns jsonb language sql immutable as $$
  select jsonb_set(public.p6_std(), array['activities', p_index::text, p_field], p_value);
$$;

create function public.p6_ids(p_session jsonb) returns text[] language sql immutable as $$
  select array_agg(e ->> 'id' order by o) from jsonb_array_elements(p_session #> '{plan,activities}') with ordinality as t(e, o);
$$;

create function public.p6_submit(p_run text, p_exercise text, p_response jsonb) returns jsonb language sql volatile as $$
  select public.submit_exercise(p_run::uuid, p_exercise::uuid, 1, gen_random_uuid(), p_response, 2::smallint, 1500, 0::smallint, now());
$$;

-- save_session_plan on A's path must fail with invalid_plan.
create function public.p6_invalid(p_plan jsonb, p_label text) returns text language sql volatile as $$
  select throws_ok(format('select public.save_session_plan(%L, %L, true)', current_setting('test.pa'), p_plan), 'P0001', 'invalid_plan', p_label);
$$;

-- ===== Users and paths =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}');
update public.profiles set timezone = 'Asia/Seoul' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select set_config('test.a_today', ((now() at time zone 'Asia/Seoul')::date)::text, true);
select set_config('test.a_start', ((current_setting('test.a_today')::date)::timestamp at time zone 'Asia/Seoul')::text, true);
select set_config('test.b_today', ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text, true);

set local role authenticated;
select public.p6_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.pa', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[5,10,15,20,25,30,35]::smallint[])).id::text, true);
select set_config('test.pk', (public.create_learning_path('ko', 'new', 'hangul_basics', 'hangul', 'topik1', array[10,10,10,10,10,10,10]::smallint[])).id::text, true);
select public.p6_as('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('test.pb', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[20,20,20,20,20,20,20]::smallint[])).id::text, true);

-- ===== Privileges =====
reset role;
select ok(not has_function_privilege('anon', 'public.get_session_inputs(uuid)', 'execute'), 'anon cannot execute get_session_inputs');
select ok(not has_function_privilege('anon', 'public.save_session_plan(uuid, jsonb, boolean)', 'execute'), 'anon cannot execute save_session_plan');
select ok(not has_function_privilege('anon', 'public.get_today_session(uuid)', 'execute'), 'anon cannot execute get_today_session');
select ok(not has_function_privilege('anon', 'public.update_session_item(uuid, text, text, integer)', 'execute'), 'anon cannot execute update_session_item');
select ok(not has_function_privilege('anon', 'public.reorder_session(uuid, text[])', 'execute'), 'anon cannot execute reorder_session');
select ok(not has_function_privilege('anon', 'public.finish_session(uuid, text)', 'execute'), 'anon cannot execute finish_session');
select ok(not has_function_privilege('anon', 'public.session_recap(uuid)', 'execute'), 'anon cannot execute session_recap');
select ok(has_function_privilege('authenticated', 'public.get_session_inputs(uuid)', 'execute'), 'authenticated can execute get_session_inputs');
select ok(has_function_privilege('authenticated', 'public.save_session_plan(uuid, jsonb, boolean)', 'execute'), 'authenticated can execute save_session_plan');
select ok(has_function_privilege('authenticated', 'public.get_today_session(uuid)', 'execute'), 'authenticated can execute get_today_session');
select ok(has_function_privilege('authenticated', 'public.update_session_item(uuid, text, text, integer)', 'execute'), 'authenticated can execute update_session_item');
select ok(has_function_privilege('authenticated', 'public.reorder_session(uuid, text[])', 'execute'), 'authenticated can execute reorder_session');
select ok(has_function_privilege('authenticated', 'public.finish_session(uuid, text)', 'execute'), 'authenticated can execute finish_session');
select ok(has_function_privilege('authenticated', 'public.session_recap(uuid)', 'execute'), 'authenticated can execute session_recap');
select ok(not has_function_privilege('authenticated', 'public.study_session_json(uuid)', 'execute'), 'study_session_json is internal');
select ok(not has_function_privilege('authenticated', 'public.session_plan_normalize(uuid, jsonb)', 'execute'), 'session_plan_normalize is internal');
select ok(not has_function_privilege('authenticated', 'public.session_seconds_on(uuid, uuid, date)', 'execute'), 'session_seconds_on is internal');
select ok(not has_function_privilege('authenticated', 'public.session_answer_text(text, jsonb, jsonb)', 'execute'), 'session_answer_text is internal');
select ok((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.study_sessions'::regclass), 'study_sessions has RLS');
select ok(has_table_privilege('authenticated', 'public.study_sessions', 'select'), 'authenticated can select study_sessions');
select ok(not has_table_privilege('authenticated', 'public.study_sessions', 'insert'), 'authenticated cannot insert study_sessions');
select ok(not has_table_privilege('authenticated', 'public.study_sessions', 'update'), 'authenticated cannot update study_sessions');
select ok(not has_table_privilege('authenticated', 'public.study_sessions', 'delete'), 'authenticated cannot delete study_sessions');
select ok(not has_table_privilege('anon', 'public.study_sessions', 'select'), 'anon cannot select study_sessions');

set local role anon;
select throws_ok(format('select public.get_today_session(%L)', current_setting('test.pa')), '42501', null, 'anon is refused at execution');

-- ===== not_authenticated =====
set local role authenticated;
select public.p6_as(null);
select throws_ok(format('select public.get_session_inputs(%L)', current_setting('test.pa')), '42501', 'not_authenticated', 'inputs need a user');
select throws_ok(format('select public.save_session_plan(%L, %L, false)', current_setting('test.pa'), public.p6_std()), '42501', 'not_authenticated', 'save needs a user');
select throws_ok(format('select public.get_today_session(%L)', current_setting('test.pa')), '42501', 'not_authenticated', 'today needs a user');
select throws_ok(format('select public.update_session_item(%L, ''a1'', ''done'', 10)', gen_random_uuid()), '42501', 'not_authenticated', 'update needs a user');
select throws_ok(format('select public.reorder_session(%L, array[''a1''])', gen_random_uuid()), '42501', 'not_authenticated', 'reorder needs a user');
select throws_ok(format('select public.finish_session(%L, ''completed'')', gen_random_uuid()), '42501', 'not_authenticated', 'finish needs a user');
select throws_ok(format('select public.session_recap(%L)', gen_random_uuid()), '42501', 'not_authenticated', 'recap needs a user');

-- ===== path_not_found =====
select public.p6_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select throws_ok(format('select public.get_session_inputs(%L)', current_setting('test.pa')), 'P0001', 'path_not_found', 'inputs of another user''s path');
select throws_ok(format('select public.save_session_plan(%L, %L, false)', current_setting('test.pa'), public.p6_std()), 'P0001', 'path_not_found', 'save on another user''s path');
select throws_ok(format('select public.get_today_session(%L)', current_setting('test.pa')), 'P0001', 'path_not_found', 'today of another user''s path');
select throws_ok(format('select public.get_session_inputs(%L)', gen_random_uuid()), 'P0001', 'path_not_found', 'unknown path');

-- ===== get_session_inputs: fresh path =====
select public.p6_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.in', public.get_session_inputs(current_setting('test.pa')::uuid)::text, true);
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.in')::jsonb) as k),
  array['daily_goal_minutes', 'days_since_last_study', 'due_count', 'language_code', 'local_date', 'new_card_count', 'next_lessons',
        'overdue_count', 'path_id', 'skills', 'studied_seconds_today'], 'inputs have exactly the contract keys');
select is(current_setting('test.in')::jsonb ->> 'path_id', current_setting('test.pa'), 'inputs path_id');
select is(current_setting('test.in')::jsonb ->> 'language_code', 'en', 'inputs language');
select is(current_setting('test.in')::jsonb ->> 'local_date', current_setting('test.a_today'), 'local_date is the Seoul date');
select is((current_setting('test.in')::jsonb ->> 'daily_goal_minutes')::integer,
  5 * extract(isodow from current_setting('test.a_today')::date)::integer, 'daily goal is today''s weekly_minutes');
select is(current_setting('test.in')::jsonb -> 'studied_seconds_today', '0'::jsonb, 'nothing studied yet');
select is(array[(current_setting('test.in')::jsonb ->> 'due_count')::integer, (current_setting('test.in')::jsonb ->> 'overdue_count')::integer,
  (current_setting('test.in')::jsonb ->> 'new_card_count')::integer], array[0, 0, 0], 'no cards yet');
select is((select array_agg(e ->> 'lesson_id' order by o) from jsonb_array_elements(current_setting('test.in')::jsonb -> 'next_lessons') with ordinality as t(e, o)),
  array[current_setting('test.l1'), current_setting('test.l3'), current_setting('test.l4')],
  'next lessons in path order; locked, draft, other-goal and other-language lessons excluded');
select is(current_setting('test.in')::jsonb -> 'next_lessons' -> 0,
  jsonb_build_object('lesson_id', current_setting('test.l1'), 'title_vi', 'Chào hỏi', 'estimated_minutes', 7, 'skills', '["vocabulary"]'::jsonb,
    'run_status', 'not_started', 'unit_order', 1, 'lesson_order', 1), 'candidate lesson shape');
select is(jsonb_array_length(current_setting('test.in')::jsonb -> 'skills'), 6, 'one estimate per skill');
select ok((select bool_and(e -> 'recent_accuracy' = 'null'::jsonb and e ->> 'confidence' = 'self_reported' and e ->> 'level_code' = 'pre_a1')
  from jsonb_array_elements(current_setting('test.in')::jsonb -> 'skills') as e), 'self-reported estimates, no accuracy yet');
select is(current_setting('test.in')::jsonb -> 'days_since_last_study', 'null'::jsonb, 'never studied');

-- ===== Cards and attempts =====
reset role;
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, stability, difficulty, due_at, last_review_at, scheduled_days, reps)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, public.p6_id(21)::uuid, 'recognize', 'review', 5, 5, now() - interval '2 days', now() - interval '5 days', 3, 2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, public.p6_id(22)::uuid, 'recognize', 'review', 5, 5, current_setting('test.a_start')::timestamptz + interval '1 second', now() - interval '5 days', 3, 2);
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, due_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, public.p6_id(23)::uuid, 'recognize', 'new', current_setting('test.a_start')::timestamptz);

set local role authenticated;
select public.p6_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.run1', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.pa')::uuid) ->> 'id', true);
select is(public.p6_submit(current_setting('test.run1'), public.p6_id(31), '{"option_id": "o2"}') ->> 'revealed', 'false', 'mcq wrong once');
select is(public.p6_submit(current_setting('test.run1'), public.p6_id(31), '{"option_id": "o2"}') ->> 'revealed', 'true', 'mcq wrong twice reveals');
select is(public.p6_submit(current_setting('test.run1'), public.p6_id(33), '{"text": "Bye"}') ->> 'verdict', 'incorrect', 'translate wrong');
select is(public.p6_submit(current_setting('test.run1'), public.p6_id(33), '{"text": "Hello"}') ->> 'verdict', 'correct', 'translate right');
select is(public.p6_submit(current_setting('test.run1'), public.p6_id(32), '{"blanks": {"b1": "meet"}}') ->> 'verdict', 'correct', 'fill right');
select set_config('test.run3', public.start_lesson(current_setting('test.l3')::uuid, current_setting('test.pa')::uuid) ->> 'id', true);
select is(public.p6_submit(current_setting('test.run3'), public.p6_id(34), '{"blanks": {"b1": "is"}}') ->> 'revealed', 'false', 'L3 fill wrong, not revealed');

select set_config('test.in', public.get_session_inputs(current_setting('test.pa')::uuid)::text, true);
select is(array[(current_setting('test.in')::jsonb ->> 'due_count')::integer, (current_setting('test.in')::jsonb ->> 'overdue_count')::integer,
  (current_setting('test.in')::jsonb ->> 'new_card_count')::integer], array[2, 1, 1], 'due, overdue and new cards counted');
select is(current_setting('test.in')::jsonb -> 'skills' -> 0,
  '{"skill": "vocabulary", "level_code": "pre_a1", "confidence": "self_reported", "recent_accuracy": 0.4}'::jsonb,
  'weakest skill first with its 14-day accuracy (2 of 5)');
select is(current_setting('test.in')::jsonb -> 'skills' -> 1 -> 'recent_accuracy', 'null'::jsonb, 'fewer than 5 attempts: no accuracy');
select is(current_setting('test.in')::jsonb #>> '{next_lessons,0,run_status}', 'in_progress', 'started lesson is in_progress');
select is(current_setting('test.in')::jsonb -> 'days_since_last_study', 'null'::jsonb, 'attempts alone do not count as a study day');

-- ===== path_not_active =====
reset role;
update public.learning_paths set status = 'paused' where id = current_setting('test.pa')::uuid;
set local role authenticated;
select throws_ok(format('select public.get_session_inputs(%L)', current_setting('test.pa')), 'P0001', 'path_not_active', 'inputs need an active path');
select throws_ok(format('select public.save_session_plan(%L, %L, false)', current_setting('test.pa'), public.p6_std()), 'P0001', 'path_not_active', 'save needs an active path');
select lives_ok(format('select public.get_today_session(%L)', current_setting('test.pa')), 'today works on a paused path');
reset role;
update public.learning_paths set status = 'active' where id = current_setting('test.pa')::uuid;
set local role authenticated;

-- ===== get_today_session: nothing yet =====
select is(public.get_today_session(current_setting('test.pa')::uuid),
  jsonb_build_object('session', null, 'studied_seconds_today', 0, 'daily_goal_minutes', 5 * extract(isodow from current_setting('test.a_today')::date)::integer),
  'no session today');

-- ===== save_session_plan =====
select set_config('test.s1', public.save_session_plan(current_setting('test.pa')::uuid, public.p6_std(), false)::text, true);
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.s1')::jsonb) as k),
  array['completed_at', 'created_at', 'id', 'local_date', 'minutes_planned', 'path_id', 'plan', 'started_at', 'status'], 'session has exactly the contract keys');
select is(current_setting('test.s1')::jsonb ->> 'status', 'planned', 'new session is planned');
select is(current_setting('test.s1')::jsonb ->> 'local_date', current_setting('test.a_today'), 'session on the Seoul date');
select is(current_setting('test.s1')::jsonb ->> 'path_id', current_setting('test.pa'), 'session path');
select is(current_setting('test.s1')::jsonb -> 'minutes_planned', '30'::jsonb, 'minutes_planned from the plan');
select is(current_setting('test.s1')::jsonb -> 'plan', public.p6_std(), 'plan stored as sent');
select is(array[current_setting('test.s1')::jsonb -> 'started_at', current_setting('test.s1')::jsonb -> 'completed_at'], array['null'::jsonb, 'null'::jsonb], 'not started');

select is(public.save_session_plan(current_setting('test.pa')::uuid, jsonb_set(public.p6_std(), '{focus_vi}', '"Khác"'), false) ->> 'id',
  current_setting('test.s1')::jsonb ->> 'id', 'p_replace=false returns the open session');
select is((select count(*)::integer from public.study_sessions where path_id = current_setting('test.pa')::uuid), 1, 'still one session');
select is(public.get_today_session(current_setting('test.pa')::uuid) #>> '{session,id}', current_setting('test.s1')::jsonb ->> 'id', 'today returns the open session');

select set_config('test.s2', public.save_session_plan(current_setting('test.pa')::uuid, public.p6_std(), true)::text, true);
select isnt(current_setting('test.s2')::jsonb ->> 'id', current_setting('test.s1')::jsonb ->> 'id', 'p_replace=true creates a new session');
select is((select status from public.study_sessions where id = (current_setting('test.s1')::jsonb ->> 'id')::uuid), 'abandoned', 'the replaced session is abandoned');
select ok((select completed_at is not null from public.study_sessions where id = (current_setting('test.s1')::jsonb ->> 'id')::uuid), 'the replaced session is closed');
select is((select count(*)::integer from public.study_sessions where path_id = current_setting('test.pa')::uuid and status in ('planned', 'in_progress')), 1, 'one open session');

reset role;
select throws_ok(format($$insert into public.study_sessions (user_id, path_id, local_date, minutes_planned, plan) values (%L, %L, %L, 30, %L)$$,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa'), current_setting('test.a_today'), public.p6_std()),
  '23505', null, 'at most one open session per path and day');
set local role authenticated;

-- KO lesson on the KO path is fine.
select is(public.save_session_plan(current_setting('test.pk')::uuid,
  public.p6_plan(jsonb_build_array(public.p6_act('a1', 'lesson', 10, current_setting('test.lk')))), false) ->> 'status', 'planned', 'KO lesson on the KO path');

-- invalid_plan
select public.p6_invalid(null, 'null plan');
select public.p6_invalid('[]', 'plan is not an object');
select public.p6_invalid(jsonb_set(public.p6_std(), '{minutes}', '4'), 'plan minutes below 5');
select public.p6_invalid(jsonb_set(public.p6_std(), '{minutes}', '30.5'), 'plan minutes not an integer');
select public.p6_invalid(jsonb_set(public.p6_std(), '{activities}', '[]'), 'no activities');
select public.p6_invalid(public.p6_plan((select jsonb_agg(public.p6_act('a' || n, 'recap', 1)) from generate_series(1, 13) as n), 30), '13 activities');
select public.p6_invalid(public.p6_bad(0, 'id', '"b1"'), 'id not a<n>');
select public.p6_invalid(public.p6_bad(0, 'id', '"a123"'), 'id too long');
select public.p6_invalid(public.p6_bad(1, 'id', '"a1"'), 'duplicate id');
select public.p6_invalid(public.p6_bad(0, 'kind', '"quiz"'), 'unknown kind');
select public.p6_invalid(public.p6_bad(0, 'status', '"started"'), 'unknown activity status');
select public.p6_invalid(public.p6_bad(0, 'minutes', '0'), 'activity minutes 0');
select public.p6_invalid(public.p6_plan(jsonb_build_array(public.p6_act('a1', 'recap', 66), public.p6_act('a2', 'recap', 65)), 120), 'total over 130 minutes');
select public.p6_invalid(public.p6_bad(0, 'title_vi', '""'), 'empty title');
select public.p6_invalid(public.p6_bad(0, 'title_vi', to_jsonb(repeat('x', 121))), 'title over 120');
select public.p6_invalid(public.p6_bad(0, 'reason_vi', to_jsonb(repeat('x', 201))), 'reason over 200');
select public.p6_invalid(public.p6_bad(0, 'priority', '101'), 'priority over 100');
select public.p6_invalid(public.p6_bad(0, 'seconds_spent', '-1'), 'negative seconds');
select public.p6_invalid(public.p6_bad(0, 'review_limit', '0'), 'review_limit 0');
select public.p6_invalid(public.p6_bad(1, 'review_limit', '5'), 'review_limit on a lesson');
select public.p6_invalid(public.p6_bad(1, 'lesson_id', 'null'), 'lesson without lesson_id');
select public.p6_invalid(public.p6_bad(0, 'lesson_id', to_jsonb(current_setting('test.l1'))), 'lesson_id on a review');
select public.p6_invalid(public.p6_bad(1, 'lesson_id', '"abc"'), 'lesson_id not a uuid');
select public.p6_invalid(public.p6_bad(1, 'lesson_id', to_jsonb(gen_random_uuid())), 'unknown lesson');
select public.p6_invalid(public.p6_bad(1, 'lesson_id', to_jsonb(current_setting('test.l5'))), 'draft lesson');
select public.p6_invalid(public.p6_bad(1, 'lesson_id', to_jsonb(current_setting('test.lo'))), 'lesson of another goal program');
select public.p6_invalid(public.p6_bad(2, 'lesson_id', to_jsonb(current_setting('test.lk'))), 'KO lesson on an EN path');
select public.p6_invalid(jsonb_set(public.p6_std(), '{focus_vi}', '""'), 'empty focus');
select public.p6_invalid(jsonb_set(public.p6_std(), '{backlog_mode}', '"yes"'), 'backlog_mode not boolean');
select public.p6_invalid(jsonb_set(public.p6_std(), '{activities,0}', '"a1"'), 'activity not an object');
select is((select status from public.study_sessions where id = (current_setting('test.s2')::jsonb ->> 'id')::uuid), 'planned', 'rejected plans leave the open session');

-- ===== update_session_item =====
select set_config('test.s2id', current_setting('test.s2')::jsonb ->> 'id', true);
select throws_ok(format('select public.update_session_item(%L, ''a1'', ''done'', 10)', gen_random_uuid()), 'P0001', 'session_not_found', 'update unknown session');
select throws_ok(format('select public.update_session_item(%L, ''a9'', ''done'', 10)', current_setting('test.s2id')), 'P0001', 'item_not_found', 'update unknown item');
select throws_ok(format('select public.update_session_item(%L, ''a1'', ''started'', 10)', current_setting('test.s2id')), 'P0001', 'invalid_plan', 'update with an unknown status');

select set_config('test.u', public.update_session_item(current_setting('test.s2id')::uuid, 'a1', 'done', 120)::text, true);
select is(current_setting('test.u')::jsonb ->> 'status', 'in_progress', 'first update starts the session');
select ok(current_setting('test.u')::jsonb ->> 'started_at' is not null, 'started_at set');
select is((current_setting('test.u')::jsonb #> '{plan,activities,0}') - array['id', 'kind', 'minutes', 'lesson_id', 'review_limit', 'title_vi', 'reason_vi', 'priority'],
  '{"status": "done", "seconds_spent": 120}'::jsonb, 'item status and seconds updated');
select is(public.update_session_item(current_setting('test.s2id')::uuid, 'a1', 'done', 99999) #> '{plan,activities,0,seconds_spent}', '7320'::jsonb, 'seconds clamped to 7200 per call');
select is((public.update_session_item(current_setting('test.s2id')::uuid, 'a2', 'skipped', -5) #> '{plan,activities,1}') - array['id', 'kind', 'minutes', 'lesson_id', 'review_limit', 'title_vi', 'reason_vi', 'priority'],
  '{"status": "skipped", "seconds_spent": 0}'::jsonb, 'negative seconds count as 0');
select is(public.get_today_session(current_setting('test.pa')::uuid) -> 'studied_seconds_today', '7320'::jsonb, 'today sums session seconds');
select set_config('test.in', public.get_session_inputs(current_setting('test.pa')::uuid)::text, true);
select is(current_setting('test.in')::jsonb -> 'studied_seconds_today', '7320'::jsonb, 'inputs sum session seconds');
select is(current_setting('test.in')::jsonb -> 'days_since_last_study', '0'::jsonb, 'a started session counts as studying today');

-- ===== reorder_session =====
select throws_ok(format('select public.reorder_session(%L, array[''a1''])', gen_random_uuid()), 'P0001', 'session_not_found', 'reorder unknown session');
select set_config('test.r', public.reorder_session(current_setting('test.s2id')::uuid, array['a4', 'a3', 'a2', 'a1'])::text, true);
select is(public.p6_ids(current_setting('test.r')::jsonb), array['a4', 'a3', 'a2', 'a1'], 'reordered');
select is(current_setting('test.r')::jsonb #>> '{plan,activities,3,status}', 'done', 'items keep their state when moved');
select throws_ok(format('select public.reorder_session(%L, array[''a1'', ''a2'', ''a3''])', current_setting('test.s2id')), 'P0001', 'invalid_order', 'missing id');
select throws_ok(format('select public.reorder_session(%L, array[''a1'', ''a2'', ''a3'', ''a3''])', current_setting('test.s2id')), 'P0001', 'invalid_order', 'duplicate id');
select throws_ok(format('select public.reorder_session(%L, array[''a1'', ''a2'', ''a3'', ''a9''])', current_setting('test.s2id')), 'P0001', 'invalid_order', 'unknown id');
select throws_ok(format('select public.reorder_session(%L, array[''a1'', ''a2'', ''a3'', ''a4'', ''a5''])', current_setting('test.s2id')), 'P0001', 'invalid_order', 'extra id');
select throws_ok(format('select public.reorder_session(%L, array[''a1'', ''a2'', ''a3'', null])', current_setting('test.s2id')), 'P0001', 'invalid_order', 'null id');
select throws_ok(format('select public.reorder_session(%L, ''{}''::text[])', current_setting('test.s2id')), 'P0001', 'invalid_order', 'empty order');
select throws_ok(format('select public.reorder_session(%L, null)', current_setting('test.s2id')), 'P0001', 'invalid_order', 'null order');
select is(public.p6_ids(public.get_today_session(current_setting('test.pa')::uuid) -> 'session'), array['a4', 'a3', 'a2', 'a1'], 'rejected orders change nothing');

-- ===== Completion and closed sessions =====
select is(public.update_session_item(current_setting('test.s2id')::uuid, 'a3', 'done', 60) ->> 'status', 'in_progress', 'still pending items');
select set_config('test.u', public.update_session_item(current_setting('test.s2id')::uuid, 'a4', 'done', 30)::text, true);
select is(current_setting('test.u')::jsonb ->> 'status', 'completed', 'all done/skipped completes the session');
select ok(current_setting('test.u')::jsonb ->> 'completed_at' is not null, 'completed_at set');
select throws_ok(format('select public.update_session_item(%L, ''a1'', ''done'', 10)', current_setting('test.s2id')), 'P0001', 'session_closed', 'update a completed session');
select throws_ok(format('select public.reorder_session(%L, array[''a1'', ''a2'', ''a3'', ''a4''])', current_setting('test.s2id')), 'P0001', 'session_closed', 'reorder a completed session');
select is(public.finish_session(current_setting('test.s2id')::uuid, 'completed') ->> 'status', 'completed', 'finishing with the same status is idempotent');
select throws_ok(format('select public.finish_session(%L, ''abandoned'')', current_setting('test.s2id')), 'P0001', 'session_closed', 'abandon a completed session');
select throws_ok(format('select public.update_session_item(%L, ''a1'', ''done'', 10)', current_setting('test.s1')::jsonb ->> 'id'), 'P0001', 'session_closed', 'update an abandoned session');

-- ===== finish_session =====
select set_config('test.s3', public.save_session_plan(current_setting('test.pa')::uuid, public.p6_std(), false)::text, true);
select ok(current_setting('test.s3')::jsonb ->> 'id' not in (current_setting('test.s1')::jsonb ->> 'id', current_setting('test.s2id')), 'closed sessions do not block a new one');
select throws_ok(format('select public.finish_session(%L, ''planned'')', current_setting('test.s3')::jsonb ->> 'id'), 'P0001', 'invalid_plan', 'finish with an invalid status');
select throws_ok(format('select public.finish_session(%L, ''completed'')', gen_random_uuid()), 'P0001', 'session_not_found', 'finish unknown session');
select set_config('test.f', public.finish_session((current_setting('test.s3')::jsonb ->> 'id')::uuid, 'abandoned')::text, true);
select is(current_setting('test.f')::jsonb ->> 'status', 'abandoned', 'finish abandons');
select ok(current_setting('test.f')::jsonb ->> 'completed_at' is not null and current_setting('test.f')::jsonb -> 'started_at' = 'null'::jsonb, 'closed without starting');
select set_config('test.t', public.get_today_session(current_setting('test.pa')::uuid)::text, true);
select is(current_setting('test.t')::jsonb #>> '{session,id}', current_setting('test.s3')::jsonb ->> 'id', 'without an open session, today returns the latest');
select is(current_setting('test.t')::jsonb -> 'studied_seconds_today', '7410'::jsonb, 'seconds of every session today');

-- ===== session_recap =====
select set_config('test.rc', public.session_recap(current_setting('test.s2id')::uuid)::text, true);
select is(jsonb_array_length(current_setting('test.rc')::jsonb), 3, 'one entry per exercise answered wrong today');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.rc')::jsonb -> 0) as k),
  array['attempt_id', 'created_at', 'exercise_id', 'exercise_type', 'expected_answer', 'learner_answer', 'lesson_id', 'prompt_text'], 'recap entry keys');
select is((current_setting('test.rc')::jsonb -> 0) - array['attempt_id', 'created_at'],
  jsonb_build_object('lesson_id', current_setting('test.l3'), 'exercise_id', public.p6_id(34), 'exercise_type', 'fill_blank',
    'prompt_text', 'I ___ a student.', 'expected_answer', null, 'learner_answer', 'I is a student.'),
  'latest first; the answer stays hidden until revealed');
select is((current_setting('test.rc')::jsonb -> 1) - array['attempt_id', 'created_at'],
  jsonb_build_object('lesson_id', current_setting('test.l1'), 'exercise_id', public.p6_id(33), 'exercise_type', 'translate',
    'prompt_text', 'Xin chào', 'expected_answer', 'Hello', 'learner_answer', 'Bye'),
  'translate: revealed by the later correct answer');
select is((current_setting('test.rc')::jsonb -> 2) - array['attempt_id', 'created_at'],
  jsonb_build_object('lesson_id', current_setting('test.l1'), 'exercise_id', public.p6_id(31), 'exercise_type', 'mcq',
    'prompt_text', 'Chọn câu chào', 'expected_answer', 'Hello', 'learner_answer', 'Goodbye'),
  'mcq: option text, revealed after the second miss');
select throws_ok(format('select public.session_recap(%L)', gen_random_uuid()), 'P0001', 'session_not_found', 'recap unknown session');

-- ===== Two users =====
select is((select count(*)::integer from public.study_sessions where path_id = current_setting('test.pa')::uuid), 3, 'A sees own sessions');
select public.p6_as('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select count(*)::integer from public.study_sessions), 0, 'B sees no session of A');
select throws_ok(format('select public.update_session_item(%L, ''a1'', ''done'', 10)', current_setting('test.s2id')), 'P0001', 'session_not_found', 'B cannot update A''s session');
select throws_ok(format('select public.reorder_session(%L, array[''a4'', ''a3'', ''a2'', ''a1''])', current_setting('test.s2id')), 'P0001', 'session_not_found', 'B cannot reorder A''s session');
select throws_ok(format('select public.finish_session(%L, ''completed'')', current_setting('test.s3')::jsonb ->> 'id'), 'P0001', 'session_not_found', 'B cannot finish A''s session');
select throws_ok(format('select public.session_recap(%L)', current_setting('test.s2id')), 'P0001', 'session_not_found', 'B cannot read A''s recap');
select throws_ok(format('select public.save_session_plan(%L, %L, true)', current_setting('test.pa'), public.p6_std()), 'P0001', 'path_not_found', 'B cannot save on A''s path');
select throws_ok(format($$insert into public.study_sessions (user_id, path_id, local_date, minutes_planned, plan) values (%L, %L, %L, 30, %L)$$,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb'), current_setting('test.b_today'), public.p6_std()),
  '42501', null, 'no direct insert');
select throws_ok($$update public.study_sessions set status = 'completed'$$, '42501', null, 'no direct update');

-- B: unknown keys are dropped; the recap keeps the 10 latest mistakes.
select set_config('test.sb', public.save_session_plan(current_setting('test.pb')::uuid,
  jsonb_set(public.p6_std(), '{activities,0,foo}', '1') || '{"bar": 2}', false)::text, true);
select is(current_setting('test.sb')::jsonb -> 'plan', public.p6_std(), 'unknown keys are dropped');
reset role;
insert into public.lesson_runs (id, user_id, learning_path_id, lesson_id, content_version, queue)
select 'c6000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, public.p6_id(14)::uuid, 1,
  array(select public.p6_id(n)::uuid from generate_series(41, 51) as n);
insert into public.attempts (user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version,
  idempotency_key, payload_hash, response_json, verdict, is_correct, score, attempt_no, revealed, after_reveal, gave_up, feedback_json,
  stage, exercise_type, response_ms, hint_count, created_at)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, 'c6000000-0000-4000-8000-0000000000b1', public.p6_id(14)::uuid,
  public.p6_id(n)::uuid, 1, 1, gen_random_uuid(), 'x', '{"option_id": "o2"}', 'incorrect', false, 0, 1, false, false, false, '{}',
  'recognition', 'mcq', 1000, 0, now() + n * interval '1 millisecond'
from generate_series(41, 51) as n;
set local role authenticated;
select set_config('test.rc', public.session_recap((current_setting('test.sb')::jsonb ->> 'id')::uuid)::text, true);
select is(jsonb_array_length(current_setting('test.rc')::jsonb), 10, 'recap returns at most 10 entries');
select is(current_setting('test.rc')::jsonb -> 0 ->> 'prompt_text', 'Câu 51', 'newest first');
select is(current_setting('test.rc')::jsonb -> 0 -> 'learner_answer', '"No"'::jsonb, 'option text of the chosen option');
select is(public.get_today_session(current_setting('test.pb')::uuid) #>> '{session,id}', current_setting('test.sb')::jsonb ->> 'id', 'B sees own session');
select public.p6_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok(format('select public.session_recap(%L)', current_setting('test.sb')::jsonb ->> 'id'), 'P0001', 'session_not_found', 'A cannot read B''s recap');

select * from finish();
rollback;
