begin;
create extension if not exists pgtap with schema extensions;
select plan(140);

-- ===== Clean slate: any seeded exam content is removed (rolled back) =====
delete from public.exam_answers;
delete from public.exam_attempts;
delete from content_private.exam_keys;
delete from public.exam_questions;
delete from public.exam_forms;

-- ===== Bundle helpers =====
create function public.x9_id(p_key text) returns uuid language sql immutable as $$
  select md5(p_key)::uuid;
$$;

create function public.x9_q(
  p_key text, p_seq integer, p_section text, p_kind text, p_type text, p_points integer, p_answer jsonb,
  p_script text default null, p_audio text default null, p_lang text default 'ko', p_level text default 'topik1'
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', public.x9_id(p_key), 'key', p_key, 'seq', p_seq, 'section', p_section, 'kind', p_kind,
    'question_type', p_type, 'level_code', p_level, 'points', p_points,
    'prompt', jsonb_build_object('instruction_vi', 'Chọn đáp án đúng.', 'stem', 'Stem ' || p_key, 'stem_lang', p_lang,
                                 'audio_asset_id', p_audio)
      || case when p_kind = 'mcq' then jsonb_build_object('options', jsonb_build_array(
           jsonb_build_object('id', 'a', 'text', 'A', 'lang', p_lang),
           jsonb_build_object('id', 'b', 'text', 'B', 'lang', p_lang),
           jsonb_build_object('id', 'c', 'text', 'C', 'lang', p_lang))) else '{}'::jsonb end
      || case when p_kind = 'essay' then '{"min_chars": 50, "max_chars": 300}'::jsonb else '{}'::jsonb end,
    'answer', p_answer,
    'explanation', jsonb_build_object('vi', 'Giải thích ' || p_key),
    'script', p_script,
    'rubric', case when p_kind = 'essay' then
      '[{"key": "content", "label_vi": "Nội dung", "description_vi": "Đủ ý", "max_points": 5}]'::jsonb end,
    'sample_answer', case when p_kind = 'essay' then 'Sample essay ' || p_key end,
    'content_hash', md5(p_key) || md5(p_key || '#')
  );
$$;

create function public.x9_form(
  p_key text, p_lang text, p_family text, p_from text, p_to text, p_limits jsonb, p_scoring jsonb, p_hash_seed text,
  p_questions jsonb, p_title text default null
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', public.x9_id(p_key), 'key', p_key, 'language_code', p_lang, 'family', p_family,
    'title_vi', coalesce(p_title, 'Đề ' || p_key), 'description_vi', 'Bài luyện mô phỏng', 'level_from', p_from,
    'level_to', p_to, 'source_key', 'src:x9', 'time_limits', p_limits, 'scoring', p_scoring,
    'is_demo', true, 'reviewed_by', null, 'reviewed_at', null,
    'content_hash', md5(p_hash_seed) || md5(p_hash_seed || '#'), 'questions', p_questions
  );
$$;

-- Variant 1: TOPIK I (4 q), a second TOPIK I form (10 reading q of one type), TOPIK II (5 q incl. 2
-- short_text + 1 essay) and CEFR A2 (5 q incl. 1 essay). Variant 2: the first TOPIK I form gets a new
-- title (new hash) and the second loses its last question (new hash).
create function public.x9_bundle(p_variant integer) returns jsonb language sql immutable as $$
  select jsonb_build_object('bundle_version', 1, 'forms', jsonb_build_array(
    public.x9_form('ko:exam:x9-t1', 'ko', 'topik_i', 'topik1', 'topik2', '{"listening": 15, "reading": 25}',
      '{"verified": false, "source_note_vi": "Thang tham khảo", "section_max": {"listening": 100, "reading": 100},
        "bands": [{"level_code": "topik1", "min_total": 80}, {"level_code": "topik2", "min_total": 140}], "pass_ratio": null}',
      't1-v' || p_variant,
      jsonb_build_array(
        public.x9_q('ko:examq:x9-t1-l1', 1, 'listening', 'mcq', 'tk1_listen_a', 2, '"a"', 'Script one'),
        public.x9_q('ko:examq:x9-t1-l2', 2, 'listening', 'mcq', 'tk1_listen_a', 2, '"b"', 'Secret script two', 'audio/x9-l2.mp3'),
        public.x9_q('ko:examq:x9-t1-r1', 3, 'reading', 'mcq', 'tk1_read_topic', 2, '"c"'),
        public.x9_q('ko:examq:x9-t1-r2', 4, 'reading', 'mcq', 'tk1_read_topic', 2, '"a"')),
      case when p_variant = 2 then 'Đề TOPIK I số 1 (sửa)' end),
    public.x9_form('ko:exam:x9-t1b', 'ko', 'topik_i', 'topik1', 'topik2', '{"reading": 30}',
      '{"verified": false, "source_note_vi": "Thang tham khảo", "section_max": {"listening": 100, "reading": 100},
        "bands": [{"level_code": "topik1", "min_total": 80}, {"level_code": "topik2", "min_total": 140}], "pass_ratio": null}',
      't1b-v' || p_variant,
      (select jsonb_agg(public.x9_q('ko:examq:x9-t1b-' || n, n, 'reading', 'mcq', 'tk1_read_topic', 2, '"a"') order by n)
       from generate_series(1, case when p_variant = 2 then 9 else 10 end) as n)),
    public.x9_form('ko:exam:x9-t2', 'ko', 'topik_ii', 'topik3', 'topik6', '{"listening": 20, "reading": 25, "writing": 20}',
      '{"verified": false, "source_note_vi": "Thang tham khảo", "section_max": {"listening": 100, "reading": 100, "writing": 100},
        "bands": [{"level_code": "topik3", "min_total": 120}, {"level_code": "topik4", "min_total": 150},
                  {"level_code": "topik5", "min_total": 190}, {"level_code": "topik6", "min_total": 230}], "pass_ratio": null}',
      't2',
      jsonb_build_array(
        public.x9_q('ko:examq:x9-t2-l1', 1, 'listening', 'mcq', 'tk2_listen', 2, '"b"', 'Script T2', null, 'ko', 'topik3'),
        public.x9_q('ko:examq:x9-t2-r1', 2, 'reading', 'mcq', 'tk1_read_topic', 2, '"b"', null, null, 'ko', 'topik3'),
        public.x9_q('ko:examq:x9-t2-w1', 3, 'writing', 'short_text', 'tk2_write_51', 5, '["학교에 갑니다", "학교에 가요"]', null, null, 'ko', 'topik3'),
        public.x9_q('ko:examq:x9-t2-w2', 4, 'writing', 'short_text', 'tk2_write_51', 5, '["도와주세요"]', null, null, 'ko', 'topik3'),
        public.x9_q('ko:examq:x9-t2-w3', 5, 'writing', 'essay', 'tk2_write_53', 10, 'null', null, null, 'ko', 'topik4'))),
    public.x9_form('en:exam:x9-c1', 'en', 'cefr', 'a1', 'a2', '{"listening": 10, "reading": 15, "writing": 15}',
      '{"verified": false, "source_note_vi": "Tham khảo CEFR", "section_max": {}, "bands": [], "pass_ratio": 0.6}',
      'c1',
      jsonb_build_array(
        public.x9_q('en:examq:x9-c1-l1', 1, 'listening', 'mcq', 'cefr_listen', 2, '"a"', 'Hello there', null, 'en', 'a2'),
        public.x9_q('en:examq:x9-c1-l2', 2, 'listening', 'mcq', 'cefr_listen', 2, '"b"', 'Good bye', null, 'en', 'a2'),
        public.x9_q('en:examq:x9-c1-r1', 3, 'reading', 'mcq', 'cefr_read_gist', 2, '"c"', null, null, 'en', 'a2'),
        public.x9_q('en:examq:x9-c1-r2', 4, 'reading', 'mcq', 'cefr_read_gist', 2, '"a"', null, null, 'en', 'a2'),
        public.x9_q('en:examq:x9-c1-w1', 5, 'writing', 'essay', 'cefr_write_email', 10, 'null', null, null, 'en', 'a2')))
  ));
$$;

-- ===== Test helpers =====
create function public.x9_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Every object key anywhere in a JSON value.
create function public.x9_keys(p jsonb) returns setof text language sql immutable as $$
  with recursive t(v) as (
    select p
    union all
    select c.value from t
    cross join lateral (
      select e.value from jsonb_each(case when jsonb_typeof(t.v) = 'object' then t.v else '{}'::jsonb end) as e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(t.v) = 'array' then t.v else '[]'::jsonb end) as a
    ) as c
  )
  select k from t cross join lateral jsonb_object_keys(case when jsonb_typeof(t.v) = 'object' then t.v else '{}'::jsonb end) as k;
$$;

create function public.x9_leaks(p jsonb) returns integer language sql immutable as $$
  select count(*)::integer from public.x9_keys(p) as k
  where k in ('script', 'correct_answer', 'is_correct', 'explanation', 'rubric', 'sample_answer', 'review');
$$;

create function public.x9_question(p_attempt jsonb, p_id uuid) returns jsonb language sql immutable as $$
  select q from jsonb_array_elements(p_attempt -> 'questions') as q where (q ->> 'question_id')::uuid = p_id;
$$;
create function public.x9_review(p_result jsonb, p_key text) returns jsonb language sql immutable as $$
  select r from jsonb_array_elements(p_result -> 'review') as r where (r ->> 'question_id')::uuid = public.x9_id(p_key);
$$;
create function public.x9_section(p_result jsonb, p_section text) returns jsonb language sql immutable as $$
  select s from jsonb_array_elements(p_result -> 'by_section') as s where s ->> 'section' = p_section;
$$;
create function public.x9_save(p_attempt text, p_key text, p_answer text, p_flagged boolean default false) returns jsonb
language sql volatile as $$
  select public.save_exam_answer(p_attempt::uuid, public.x9_id(p_key), p_answer, p_flagged, gen_random_uuid());
$$;
create function public.x9_j(p_setting text) returns jsonb language sql stable as $$
  select current_setting(p_setting)::jsonb;
$$;
-- Owner-side helpers (SECURITY DEFINER so they also work under the authenticated role).
create function public.x9_overdue(p_attempt text) returns void language sql volatile security definer set search_path = '' as $$
  update public.exam_attempts set deadline_at = now() - interval '1 minute' where id = p_attempt::uuid;
$$;
create function public.x9_status(p_attempt text) returns text language sql stable security definer set search_path = '' as $$
  select status from public.exam_attempts where id = p_attempt::uuid;
$$;

-- ===== Users, paths, source =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('e9000000-0000-4000-8000-00000000000a', 'x9a@test.dev', '{}'),
  ('e9000000-0000-4000-8000-00000000000b', 'x9b@test.dev', '{}'),
  ('e9000000-0000-4000-8000-00000000000c', 'x9c@test.dev', '{}'),
  ('e9000000-0000-4000-8000-00000000000d', 'x9d@test.dev', '{}');

insert into public.content_sources (id, key, title, author_or_org, license, status, is_demo, content_hash)
values (public.x9_id('src:x9'), 'src:x9', 'X9 test source', 'Linguo', 'own', 'published', true, md5('x9') || md5('x9#'));

set local role authenticated;
select public.x9_as('e9000000-0000-4000-8000-00000000000a');
select set_config('test.pa', (public.create_learning_path('ko', 'unsure', 'topik_i', 'topik1', 'topik2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.x9_as('e9000000-0000-4000-8000-00000000000b');
select set_config('test.pb', (public.create_learning_path('ko', 'unsure', 'topik_ii', 'topik2', 'topik4', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.x9_as('e9000000-0000-4000-8000-00000000000c');
select set_config('test.pc', (public.create_learning_path('en', 'unsure', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.x9_as('e9000000-0000-4000-8000-00000000000d');
select set_config('test.pd', (public.create_learning_path('ko', 'unsure', 'communication', 'topik1', 'topik3', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
reset role;

-- ===== Privileges =====
select ok(not has_table_privilege('authenticated', 'public.exam_questions', 'select'), 'authenticated cannot select exam_questions');
select ok(not has_table_privilege('anon', 'public.exam_questions', 'select'), 'anon cannot select exam_questions');
select ok(not has_table_privilege('authenticated', 'content_private.exam_keys', 'select'), 'authenticated cannot select exam_keys');
select ok((select relrowsecurity from pg_class where oid = 'public.exam_questions'::regclass), 'exam_questions has RLS enabled');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.exam_forms'::regclass, 'public.exam_attempts'::regclass, 'public.exam_answers'::regclass,
                         'content_private.exam_keys'::regclass)), 'every exam table has RLS enabled');
select ok(has_table_privilege('authenticated', 'public.exam_forms', 'select'), 'authenticated may read forms (RLS: published)');
select ok(not has_table_privilege('authenticated', 'public.exam_attempts', 'insert')
          and not has_table_privilege('authenticated', 'public.exam_answers', 'update'), 'attempts/answers are written only by RPCs');
select ok(not has_function_privilege('anon', 'public.start_exam(uuid, uuid, text, text, text)', 'execute'), 'anon cannot start');
select ok(not has_function_privilege('anon', 'public.list_exam_forms(text)', 'execute'), 'anon cannot list');
select ok(has_function_privilege('authenticated', 'public.save_exam_answer(uuid, uuid, text, boolean, uuid)', 'execute'), 'authenticated can save');
select ok(not has_function_privilege('authenticated', 'public.exam_build_result(uuid, text, timestamptz)', 'execute'), 'grader is internal');
select ok(not has_function_privilege('authenticated', 'public.exam_normalize_text(text)', 'execute'), 'normaliser is internal');
select ok(not has_function_privilege('authenticated', 'public.import_exam_content_bundle(jsonb)', 'execute'), 'authenticated cannot import');
select ok(has_function_privilege('service_role', 'public.import_exam_content_bundle(jsonb)', 'execute'), 'service_role can import');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'exam\_%' and p.proargtypes::oid[] && array(
    select c.reltype from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r')
), 'no exam helper takes a table row (no PostgREST computed columns)');
select ok((select bool_and(p.prosecdef) from pg_proc p where p.oid in (
  'public.list_exam_forms(text)'::regprocedure, 'public.start_exam(uuid, uuid, text, text, text)'::regprocedure,
  'public.get_exam_attempt(uuid)'::regprocedure, 'public.save_exam_answer(uuid, uuid, text, boolean, uuid)'::regprocedure,
  'public.submit_exam(uuid)'::regprocedure, 'public.exam_history(uuid, integer)'::regprocedure)), 'exam RPCs are SECURITY DEFINER');

-- ===== Import =====
select is(content_private.import_exam_bundle(public.x9_bundle(1)),
  '{"inserted": 28, "updated": 0, "archived": 0, "unchanged": 0}'::jsonb, 'first import inserts 4 forms and 24 questions');
select is(public.import_exam_content_bundle(public.x9_bundle(1)),
  '{"inserted": 0, "updated": 0, "archived": 0, "unchanged": 28}'::jsonb, 're-import through the wrapper changes nothing');
select is(content_private.import_exam_bundle(public.x9_bundle(2)),
  '{"inserted": 0, "updated": 2, "archived": 1, "unchanged": 25}'::jsonb, 'changed hashes update two forms, a dropped question is archived');
select is((select version from public.exam_forms where key = 'ko:exam:x9-t1'), 2, 'a changed hash bumps the form version');
select is((select title_vi from public.exam_forms where key = 'ko:exam:x9-t1'), 'Đề TOPIK I số 1 (sửa)', 'changed content is rewritten');
select is((select version from public.exam_forms where key = 'ko:exam:x9-t2'), 1, 'an unchanged form keeps its version');
select is((select status from public.exam_questions where key = 'ko:examq:x9-t1b-10'), 'archived', 'a question removed from its file is archived');
select is((select k.script from content_private.exam_keys k where k.question_id = public.x9_id('ko:examq:x9-t1-l1')), 'Script one',
  'the listening script is stored in content_private.exam_keys');
select ok(not exists (select 1 from public.exam_questions where prompt ? 'script'), 'no stored prompt holds a script');
select throws_ok(
  format('select content_private.import_exam_bundle(%L::jsonb)',
    jsonb_set(public.x9_bundle(2), '{forms,0,questions,0,answer}', '"z"')),
  'P0001', 'invalid_bundle', 'an mcq answer that is not an option is refused');
select throws_ok(
  format('select content_private.import_exam_bundle(%L::jsonb)',
    jsonb_set(public.x9_bundle(2), '{forms,2,questions,4,rubric}', 'null')),
  'P0001', 'invalid_bundle', 'an essay without a rubric is refused');
select throws_ok('select content_private.import_exam_bundle(''{"bundle_version": 1, "forms": []}'')',
  'P0001', 'empty_bundle', 'an empty bundle cannot archive everything');
select throws_ok(
  format('select content_private.import_exam_bundle(%L::jsonb)',
    jsonb_set(public.x9_bundle(2), '{forms,0,source_key}', '"src:missing"')),
  'P0001', 'source_not_found', 'a form''s source_key must name an imported source');

-- ===== Clients never read questions or keys =====
set local role authenticated;
select public.x9_as('e9000000-0000-4000-8000-00000000000a');
select throws_ok('select count(*) from public.exam_questions', '42501', null, 'client cannot read exam_questions');
select throws_ok('select count(*) from content_private.exam_keys', '42501', null, 'client cannot read exam_keys');
select is((select count(*)::integer from public.exam_forms), 4, 'client reads the published forms');
select throws_ok(format('select public.import_exam_content_bundle(%L::jsonb)', public.x9_bundle(2)), '42501', null,
  'client cannot import');

-- ===== Not authenticated =====
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.list_exam_forms(''ko'')', '42501', 'not_authenticated', 'list needs a user');
select throws_ok(format('select public.start_exam(%L, %L, ''full'')', current_setting('test.pa'), public.x9_id('ko:exam:x9-t1')),
  '42501', 'not_authenticated', 'start needs a user');
select throws_ok(format('select public.submit_exam(%L)', gen_random_uuid()), '42501', 'not_authenticated', 'submit needs a user');

-- ===== list_exam_forms =====
select public.x9_as('e9000000-0000-4000-8000-00000000000a');
select set_config('test.list', public.list_exam_forms('ko')::text, true);
select is(jsonb_array_length(public.x9_j('test.list')), 3, 'three Korean forms are listed');
select is((select f -> 'sections' from jsonb_array_elements(public.x9_j('test.list')) f where f ->> 'key' = 'ko:exam:x9-t1'),
  '[{"section": "listening", "question_count": 2, "minutes": 15}, {"section": "reading", "question_count": 2, "minutes": 25}]'::jsonb,
  'sections carry question counts and minutes');
select is((select f -> 'question_types' -> 0 from jsonb_array_elements(public.x9_j('test.list')) f where f ->> 'key' = 'ko:exam:x9-t1b'),
  '{"question_type": "tk1_read_topic", "section": "reading", "count": 9}'::jsonb, 'question types are counted (archived excluded)');
select is((select f -> 'last_attempt' from jsonb_array_elements(public.x9_j('test.list')) f where f ->> 'key' = 'ko:exam:x9-t1'),
  'null'::jsonb, 'no last attempt yet');
select is((select (f ->> 'scoring_verified')::boolean from jsonb_array_elements(public.x9_j('test.list')) f where f ->> 'key' = 'ko:exam:x9-t1'),
  false, 'scoring_verified mirrors the scoring config');
select is(jsonb_array_length(public.list_exam_forms('en')), 1, 'one English form');
select is(public.list_exam_forms('xx'), '[]'::jsonb, 'unknown language lists nothing');

-- ===== start_exam errors =====
select throws_ok(format('select public.start_exam(%L, %L, ''full'')', current_setting('test.pb'), public.x9_id('ko:exam:x9-t1')),
  'P0001', 'path_not_found', 'another user''s path is not found');
select throws_ok(format('select public.start_exam(%L, %L, ''full'')', current_setting('test.pa'), gen_random_uuid()),
  'P0001', 'form_not_found', 'unknown form');
select throws_ok(format('select public.start_exam(%L, %L, ''full'')', current_setting('test.pa'), public.x9_id('en:exam:x9-c1')),
  'P0001', 'language_mismatch', 'a Korean path cannot take an English form');
select throws_ok(format('select public.start_exam(%L, %L, ''bogus'')', current_setting('test.pa'), public.x9_id('ko:exam:x9-t1')),
  'P0001', 'invalid_mode', 'unknown mode');
select throws_ok(format('select public.start_exam(%L, %L, ''section'')', current_setting('test.pa'), public.x9_id('ko:exam:x9-t1')),
  'P0001', 'invalid_mode', 'section mode needs a section');
select throws_ok(format('select public.start_exam(%L, %L, ''question_type'')', current_setting('test.pa'), public.x9_id('ko:exam:x9-t1')),
  'P0001', 'invalid_mode', 'question_type mode needs a question type');
select throws_ok(format('select public.start_exam(%L, %L, ''section'', ''writing'')', current_setting('test.pa'), public.x9_id('ko:exam:x9-t1')),
  'P0001', 'invalid_mode', 'a section without questions is refused');

-- ===== Full mock: served questions =====
select set_config('test.a1', public.start_exam(current_setting('test.pa')::uuid, public.x9_id('ko:exam:x9-t1'), 'full')::text, true);
select is(public.x9_j('test.a1') ->> 'status', 'in_progress', 'full mock starts in progress');
select is((select array_agg(q ->> 'section' order by (q ->> 'seq')::integer) from jsonb_array_elements(public.x9_j('test.a1') -> 'questions') q),
  array['listening', 'listening', 'reading', 'reading'], 'all questions in section order');
select is((public.x9_j('test.a1') ->> 'deadline_at')::timestamptz, now() + interval '40 minutes', 'deadline = now + total minutes');
select is(public.x9_j('test.a1') -> 'structure_warning_vi', 'null'::jsonb, 'no warning when the form matches the goal');
select is(public.x9_leaks(public.x9_j('test.a1')), 0, 'served attempt has no script, key, explanation or rubric');
select is(public.x9_question(public.x9_j('test.a1'), public.x9_id('ko:examq:x9-t1-l1')) #>> '{prompt,tts_text}', 'Script one',
  'listening without a recording carries tts_text');
select ok(position('Secret script two' in public.x9_j('test.a1')::text) = 0, 'a recorded listening question never serves its script');
select is(public.x9_question(public.x9_j('test.a1'), public.x9_id('ko:examq:x9-t1-l2')) #>> '{prompt,audio_asset_id}', 'audio/x9-l2.mp3',
  'recorded listening serves its audio asset');
select is(public.start_exam(current_setting('test.pa')::uuid, public.x9_id('ko:exam:x9-t1'), 'full') ->> 'attempt_id',
  public.x9_j('test.a1') ->> 'attempt_id', 'starting the same attempt again resumes it');

-- ===== One in-progress attempt per path =====
select set_config('test.a2', public.start_exam(current_setting('test.pa')::uuid, public.x9_id('ko:exam:x9-t1'), 'section', 'reading')::text, true);
select isnt(public.x9_j('test.a2') ->> 'attempt_id', public.x9_j('test.a1') ->> 'attempt_id', 'another mode starts a new attempt');
select is((select status from public.exam_attempts where id = (public.x9_j('test.a1') ->> 'attempt_id')::uuid), 'expired',
  'the previous attempt is closed as expired');
select is((select count(*)::integer from public.exam_attempts where learning_path_id = current_setting('test.pa')::uuid and status = 'in_progress'),
  1, 'one in-progress attempt per path');
select is(public.get_exam_attempt((public.x9_j('test.a1') ->> 'attempt_id')::uuid) ->> 'status', 'expired',
  'the closed attempt returns its result');
select is(public.x9_j('test.a2') -> 'deadline_at', 'null'::jsonb, 'section practice is untimed');
reset role;
select throws_ok(format(
  'insert into public.exam_attempts (user_id, learning_path_id, form_id, content_version, mode, question_ids) values (%L, %L, %L, 1, ''full'', array[%L]::uuid[])',
  'e9000000-0000-4000-8000-00000000000a', current_setting('test.pa'), public.x9_id('ko:exam:x9-t1'), public.x9_id('ko:examq:x9-t1-l1')),
  '23505', null, 'the partial unique index allows a single in-progress attempt');
set local role authenticated;
select public.x9_as('e9000000-0000-4000-8000-00000000000a');

-- ===== save_exam_answer =====
select set_config('test.k1', gen_random_uuid()::text, true);
select is(public.save_exam_answer((public.x9_j('test.a2') ->> 'attempt_id')::uuid, public.x9_id('ko:examq:x9-t1-r1'), 'c', false,
  current_setting('test.k1')::uuid) - 'server_now', '{"saved": true, "status": "in_progress", "replayed": false}'::jsonb, 'answer saved');
select is(public.save_exam_answer((public.x9_j('test.a2') ->> 'attempt_id')::uuid, public.x9_id('ko:examq:x9-t1-r1'), 'c', false,
  current_setting('test.k1')::uuid) - 'server_now', '{"saved": true, "status": "in_progress", "replayed": true}'::jsonb, 'same key and payload replays');
select throws_ok(format('select public.save_exam_answer(%L, %L, ''a'', false, %L)', public.x9_j('test.a2') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t1-r1'), current_setting('test.k1')), 'P0001', 'idempotency_conflict', 'same key, other payload');
select throws_ok(format('select public.save_exam_answer(%L, %L, ''a'', false, %L)', public.x9_j('test.a2') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t1-r2'), current_setting('test.k1')), 'P0001', 'idempotency_conflict', 'same key, other question');
select throws_ok(format('select public.save_exam_answer(%L, %L, ''a'', false, %L)', public.x9_j('test.a2') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t1-l1'), gen_random_uuid()), 'P0001', 'question_not_in_attempt', 'question outside the attempt');
select throws_ok(format('select public.save_exam_answer(%L, %L, %L, false, %L)', public.x9_j('test.a2') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t1-r2'), repeat('x', 201), gen_random_uuid()), 'P0001', 'answer_too_long', 'mcq/short_text answers max 200 chars');
select is(public.x9_save(public.x9_j('test.a2') ->> 'attempt_id', 'ko:examq:x9-t1-r2', 'b', true) ->> 'saved', 'true', 'flagged answer saved');
select is(public.x9_question(public.get_exam_attempt((public.x9_j('test.a2') ->> 'attempt_id')::uuid), public.x9_id('ko:examq:x9-t1-r2')),
  public.x9_question(public.get_exam_attempt((public.x9_j('test.a2') ->> 'attempt_id')::uuid), public.x9_id('ko:examq:x9-t1-r2'))
    || '{"answer": "b", "flagged": true}'::jsonb, 'get_exam_attempt returns saved answers and flags');
select is((select count(*)::integer from public.exam_answers), 2, 'the learner reads their own answers');

-- ===== User A cannot see user B's attempt (and vice versa) =====
select public.x9_as('e9000000-0000-4000-8000-00000000000b');
select throws_ok(format('select public.get_exam_attempt(%L)', public.x9_j('test.a2') ->> 'attempt_id'), 'P0001', 'attempt_not_found',
  'B cannot read A''s attempt');
select throws_ok(format('select public.save_exam_answer(%L, %L, ''a'', false, %L)', public.x9_j('test.a2') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t1-r1'), gen_random_uuid()), 'P0001', 'attempt_not_found', 'B cannot save into A''s attempt');
select throws_ok(format('select public.submit_exam(%L)', public.x9_j('test.a2') ->> 'attempt_id'), 'P0001', 'attempt_not_found',
  'B cannot submit A''s attempt');
select is((select count(*)::integer from public.exam_attempts), 0, 'RLS hides A''s attempts from B');
select is((select count(*)::integer from public.exam_answers), 0, 'RLS hides A''s answers from B');
select throws_ok(format('select public.exam_history(%L)', current_setting('test.pa')), 'P0001', 'path_not_found', 'B cannot read A''s history');

-- ===== submit_exam (section practice) =====
select public.x9_as('e9000000-0000-4000-8000-00000000000a');
select set_config('test.r2', public.submit_exam((public.x9_j('test.a2') ->> 'attempt_id')::uuid)::text, true);
select is(public.x9_j('test.r2') ->> 'status', 'submitted', 'submitted');
select is((public.x9_j('test.r2') ->> 'total')::numeric || '/' || (public.x9_j('test.r2') ->> 'max'), '2/4', 'mcq graded by option id');
select is(public.x9_section(public.x9_j('test.r2'), 'reading'),
  '{"section": "reading", "points": 2, "max": 4, "correct": 1, "total": 2, "scaled": null}'::jsonb, 'by_section without scaling outside full mocks');
select is(public.x9_j('test.r2') -> 'by_question_type',
  '[{"question_type": "tk1_read_topic", "section": "reading", "points": 2, "max": 4, "correct": 1, "total": 2}]'::jsonb, 'by_question_type');
select is(public.x9_j('test.r2') -> 'estimated_level', 'null'::jsonb, 'no level estimate outside full mocks');
select is(public.x9_review(public.x9_j('test.r2'), 'ko:examq:x9-t1-r2') - 'prompt' - 'question_id',
  '{"seq": 2, "section": "reading", "kind": "mcq", "question_type": "tk1_read_topic", "points": 2, "answer": "b", "is_correct": false,
    "correct_answer": "a", "explanation": {"vi": "Giải thích ko:examq:x9-t1-r2"}, "rubric": null, "sample_answer": null}'::jsonb,
  'review shows answer, key and explanation after submit');
select is(public.submit_exam((public.x9_j('test.a2') ->> 'attempt_id')::uuid), public.x9_j('test.r2'), 'submit is idempotent');
select is(public.get_exam_attempt((public.x9_j('test.a2') ->> 'attempt_id')::uuid), public.x9_j('test.r2'), 'get returns the stored result');
select throws_ok(format('select public.save_exam_answer(%L, %L, ''a'', false, %L)', public.x9_j('test.a2') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t1-r1'), gen_random_uuid()), 'P0001', 'attempt_closed', 'no saves after submit');
select is(public.save_exam_answer((public.x9_j('test.a2') ->> 'attempt_id')::uuid, public.x9_id('ko:examq:x9-t1-r1'), 'c', false,
  current_setting('test.k1')::uuid) ->> 'replayed', 'true', 'a late replay of a stored save still replays');

-- ===== TOPIK I full mock: scaling and band =====
select set_config('test.a3', public.start_exam(current_setting('test.pa')::uuid, public.x9_id('ko:exam:x9-t1'), 'full')::text, true);
select public.x9_save(public.x9_j('test.a3') ->> 'attempt_id', 'ko:examq:x9-t1-l1', 'a');
select public.x9_save(public.x9_j('test.a3') ->> 'attempt_id', 'ko:examq:x9-t1-l2', 'c');
select public.x9_save(public.x9_j('test.a3') ->> 'attempt_id', 'ko:examq:x9-t1-r1', 'c');
select public.x9_save(public.x9_j('test.a3') ->> 'attempt_id', 'ko:examq:x9-t1-r2', 'b');
select set_config('test.r3', public.submit_exam((public.x9_j('test.a3') ->> 'attempt_id')::uuid)::text, true);
select is((public.x9_section(public.x9_j('test.r3'), 'listening') ->> 'scaled')::numeric, 50.0, 'scaled = points / max x section_max');
select is((public.x9_j('test.r3') -> 'estimated_level') - 'label_vi', '{"level_code": "topik1", "scaled_total": 100.0}'::jsonb,
  'scaled total 100 lands in the topik1 band');
select ok(position('Quy đổi tham khảo' in public.x9_j('test.r3') #>> '{estimated_level,label_vi}') > 0, 'band labelled as a reference conversion');
select is(public.x9_j('test.r3') -> 'cefr_sections', 'null'::jsonb, 'no CEFR judgement for TOPIK');
select is(public.x9_review(public.x9_j('test.r3'), 'ko:examq:x9-t1-l2') #>> '{prompt,script}', 'Secret script two',
  'the listening script is revealed in the review');
select is(public.x9_j('test.r3') -> 'scoring_verified', 'false'::jsonb, 'unverified scoring is flagged');

-- ===== Expiry (TOPIK II, user B) =====
select public.x9_as('e9000000-0000-4000-8000-00000000000b');
select set_config('test.b1', public.start_exam(current_setting('test.pb')::uuid, public.x9_id('ko:exam:x9-t2'), 'full')::text, true);
select public.x9_save(public.x9_j('test.b1') ->> 'attempt_id', 'ko:examq:x9-t2-l1', 'b');
select public.x9_overdue(public.x9_j('test.b1') ->> 'attempt_id');
select is(public.x9_save(public.x9_j('test.b1') ->> 'attempt_id', 'ko:examq:x9-t2-r1', 'b') - 'server_now',
  '{"saved": false, "status": "expired", "replayed": false}'::jsonb, 'a save past deadline + grace is refused as expired');
select is(public.x9_status(public.x9_j('test.b1') ->> 'attempt_id'), 'expired', 'the overdue attempt is closed');
select set_config('test.rb1', public.submit_exam((public.x9_j('test.b1') ->> 'attempt_id')::uuid)::text, true);
select is(public.x9_j('test.rb1') ->> 'status', 'expired', 'submit after expiry still returns the result');
select is((public.x9_j('test.rb1') ->> 'total')::numeric, 2::numeric, 'answers saved before the deadline count');

select set_config('test.b2', public.start_exam(current_setting('test.pb')::uuid, public.x9_id('ko:exam:x9-t2'), 'full')::text, true);
select public.x9_overdue(public.x9_j('test.b2') ->> 'attempt_id');
select is(public.get_exam_attempt((public.x9_j('test.b2') ->> 'attempt_id')::uuid) ->> 'status', 'expired',
  'get_exam_attempt auto-grades an overdue attempt');

-- ===== TOPIK II: short_text normalisation, essay not scored =====
select set_config('test.b3', public.start_exam(current_setting('test.pb')::uuid, public.x9_id('ko:exam:x9-t2'), 'full')::text, true);
select public.x9_save(public.x9_j('test.b3') ->> 'attempt_id', 'ko:examq:x9-t2-l1', 'b');
select public.x9_save(public.x9_j('test.b3') ->> 'attempt_id', 'ko:examq:x9-t2-r1', 'b');
select public.x9_save(public.x9_j('test.b3') ->> 'attempt_id', 'ko:examq:x9-t2-w1', normalize('  학교에   갑니다. ', nfd));
select public.x9_save(public.x9_j('test.b3') ->> 'attempt_id', 'ko:examq:x9-t2-w2', '도와줘');
select is(public.x9_save(public.x9_j('test.b3') ->> 'attempt_id', 'ko:examq:x9-t2-w3', repeat('가', 5000)) ->> 'saved', 'true',
  'essays accept up to 5000 chars');
select throws_ok(format('select public.save_exam_answer(%L, %L, %L, false, %L)', public.x9_j('test.b3') ->> 'attempt_id',
  public.x9_id('ko:examq:x9-t2-w3'), repeat('가', 5001), gen_random_uuid()), 'P0001', 'answer_too_long', 'essays max 5000 chars');
select set_config('test.rb3', public.submit_exam((public.x9_j('test.b3') ->> 'attempt_id')::uuid)::text, true);
select is(public.x9_review(public.x9_j('test.rb3'), 'ko:examq:x9-t2-w1') -> 'is_correct', 'true'::jsonb,
  'short_text: NFD input, extra spaces and trailing punctuation still match');
select is(public.x9_review(public.x9_j('test.rb3'), 'ko:examq:x9-t2-w2') -> 'is_correct', 'false'::jsonb, 'short_text: a different answer is wrong');
select is(public.x9_review(public.x9_j('test.rb3'), 'ko:examq:x9-t2-w2') ->> 'correct_answer', '도와주세요', 'short_text shows the first accepted answer');
select is(public.x9_review(public.x9_j('test.rb3'), 'ko:examq:x9-t2-w3') -> 'is_correct', 'null'::jsonb, 'essays are not graded');
select ok(public.x9_review(public.x9_j('test.rb3'), 'ko:examq:x9-t2-w3') -> 'rubric' <> 'null'::jsonb
          and public.x9_review(public.x9_j('test.rb3'), 'ko:examq:x9-t2-w3') ->> 'sample_answer' = 'Sample essay ko:examq:x9-t2-w3',
  'essay review carries rubric and sample answer');
select is((public.x9_j('test.rb3') ->> 'total')::numeric || '/' || (public.x9_j('test.rb3') ->> 'max'), '9/14',
  'essay points are excluded from total and max');
select is(public.x9_section(public.x9_j('test.rb3'), 'writing'),
  '{"section": "writing", "points": 5, "max": 10, "correct": 1, "total": 2, "scaled": 25.0}'::jsonb,
  'TOPIK II writing adds only short_text points (essay counted as 0)');
select is((public.x9_j('test.rb3') -> 'estimated_level') - 'label_vi', '{"level_code": "topik5", "scaled_total": 225.0}'::jsonb,
  '100 + 100 + 25 = 225 lands in the topik5 band');
select ok(position('Phần viết luận chưa tính điểm' in public.x9_j('test.rb3') #>> '{estimated_level,label_vi}') > 0,
  'the band notes that the essay is not scored');
select ok(not exists (select 1 from jsonb_array_elements(public.x9_j('test.rb3') -> 'by_question_type') t
                      where t ->> 'question_type' = 'tk2_write_53'), 'essay types are left out of by_question_type');

-- ===== Structure warning =====
select set_config('test.b4', public.start_exam(current_setting('test.pb')::uuid, public.x9_id('ko:exam:x9-t1'), 'full')::text, true);
select ok(public.x9_j('test.b4') ->> 'structure_warning_vi' like '%TOPIK I%', 'a TOPIK II goal warns on a TOPIK I form');
select ok(public.get_exam_attempt((public.x9_j('test.b4') ->> 'attempt_id')::uuid) ->> 'structure_warning_vi' is not null,
  'the warning is repeated by get_exam_attempt');

-- ===== CEFR: reached per section, no conversion =====
select public.x9_as('e9000000-0000-4000-8000-00000000000c');
select set_config('test.c1', public.start_exam(current_setting('test.pc')::uuid, public.x9_id('en:exam:x9-c1'), 'full')::text, true);
select public.x9_save(public.x9_j('test.c1') ->> 'attempt_id', 'en:examq:x9-c1-l1', 'a');
select public.x9_save(public.x9_j('test.c1') ->> 'attempt_id', 'en:examq:x9-c1-l2', 'b');
select public.x9_save(public.x9_j('test.c1') ->> 'attempt_id', 'en:examq:x9-c1-r1', 'c');
select public.x9_save(public.x9_j('test.c1') ->> 'attempt_id', 'en:examq:x9-c1-r2', 'b');
select public.x9_save(public.x9_j('test.c1') ->> 'attempt_id', 'en:examq:x9-c1-w1', 'Dear Anna, thank you for your email.');
select set_config('test.rc1', public.submit_exam((public.x9_j('test.c1') ->> 'attempt_id')::uuid)::text, true);
select is(public.x9_j('test.rc1') -> 'cefr_sections',
  '[{"section": "listening", "level_code": "a2", "reached": true}, {"section": "reading", "level_code": "a2", "reached": false}]'::jsonb,
  'CEFR: reached = points / max >= pass_ratio per auto-graded section');
select is(public.x9_j('test.rc1') -> 'estimated_level', 'null'::jsonb, 'CEFR: no score conversion');
select is(public.x9_section(public.x9_j('test.rc1'), 'reading') -> 'scaled', 'null'::jsonb, 'CEFR: no scaled scores');
select is(public.x9_section(public.x9_j('test.rc1'), 'writing') - 'section',
  '{"points": 0, "max": 0, "correct": 0, "total": 0, "scaled": null}'::jsonb, 'CEFR: the essay-only writing section scores nothing');

-- ===== Question-type drill =====
select public.x9_as('e9000000-0000-4000-8000-00000000000a');
select throws_ok(format('select public.start_exam(%L, %L, ''question_type'', null, ''no_such_type'')', current_setting('test.pa'),
  public.x9_id('ko:exam:x9-t1')), 'P0001', 'invalid_mode', 'a question type without questions is refused');
select set_config('test.a4', public.start_exam(current_setting('test.pa')::uuid, public.x9_id('ko:exam:x9-t1'), 'question_type', null, 'tk1_read_topic')::text, true);
select is(jsonb_array_length(public.x9_j('test.a4') -> 'questions'), 10, 'a drill serves at most 10 questions');
select ok((select bool_and(q ->> 'question_type' = 'tk1_read_topic') from jsonb_array_elements(public.x9_j('test.a4') -> 'questions') q),
  'all drill questions share the type');
select ok(public.x9_question(public.x9_j('test.a4'), public.x9_id('ko:examq:x9-t2-r1')) is null, 'drills stay within the family');
select ok(public.x9_question(public.x9_j('test.a4'), public.x9_id('ko:examq:x9-t1b-10')) is null, 'archived questions are never served');
select ok(public.x9_question(public.x9_j('test.a4'), public.x9_id('ko:examq:x9-t1-r2')) is not null
          and public.x9_question(public.x9_j('test.a4'), public.x9_id('ko:examq:x9-t1-r1')) is null,
  'unanswered and recently wrong questions come before ones answered right');
select is(public.x9_j('test.a4') -> 'deadline_at', 'null'::jsonb, 'drills are untimed');
select is(public.x9_j('test.a4') ->> 'section', 'reading', 'the drill section is the type''s section');
select is((select array_agg((q ->> 'seq')::integer order by (q ->> 'seq')::integer) from jsonb_array_elements(public.x9_j('test.a4') -> 'questions') q),
  array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'served seq is the position in the attempt');

-- ===== History and list =====
select set_config('test.hist', public.exam_history(current_setting('test.pa')::uuid)::text, true);
select is(jsonb_array_length(public.x9_j('test.hist')), 4, 'history lists every attempt of the path');
select is((select h ->> 'estimated_level_code' from jsonb_array_elements(public.x9_j('test.hist')) h
           where h ->> 'attempt_id' = public.x9_j('test.a3') ->> 'attempt_id'), 'topik1', 'history carries the estimated level');
select is((select h - 'started_at' - 'submitted_at' from jsonb_array_elements(public.x9_j('test.hist')) h
           where h ->> 'attempt_id' = public.x9_j('test.a4') ->> 'attempt_id'),
  jsonb_build_object('attempt_id', public.x9_j('test.a4') ->> 'attempt_id', 'form_title_vi', 'Đề TOPIK I số 1 (sửa)', 'family', 'topik_i',
    'mode', 'question_type', 'section', 'reading', 'status', 'in_progress', 'total', null, 'max', null, 'estimated_level_code', null,
    'scoring_verified', false), 'an open attempt has no score yet');
select is(jsonb_array_length(public.exam_history(current_setting('test.pa')::uuid, 1)), 1, 'history honours the limit');
select ok((select f -> 'last_attempt' from jsonb_array_elements(public.list_exam_forms('ko')) f where f ->> 'key' = 'ko:exam:x9-t1')
          ?& array['attempt_id', 'submitted_at', 'total', 'max'], 'list shows the latest closed attempt');

-- ===== Rate limit: 10 new attempts per hour =====
select public.x9_as('e9000000-0000-4000-8000-00000000000d');
select lives_ok($$
  select public.start_exam(current_setting('test.pd')::uuid, public.x9_id('ko:exam:x9-t1'),
    case when n % 2 = 0 then 'full' else 'section' end, case when n % 2 = 0 then null else 'reading' end)
  from generate_series(1, 10) as n
$$, 'ten starts within an hour are allowed');
select throws_ok(format('select public.start_exam(%L, %L, ''section'', ''listening'')', current_setting('test.pd'), public.x9_id('ko:exam:x9-t1')),
  'P0001', 'rate_limited', 'the eleventh start within an hour is rate limited');
select is(public.start_exam(current_setting('test.pd')::uuid, public.x9_id('ko:exam:x9-t1'), 'full') ->> 'status', 'in_progress',
  'resuming the open attempt is not rate limited');

-- ===== Normalisation helper and cascade =====
reset role;
select is(public.exam_normalize_text('  Hello   World!! '), 'hello world', 'normalise: trim, collapse, trailing punctuation, case');
select is(public.exam_normalize_text(normalize('Café。', nfd)), 'café', 'normalise: NFC and CJK full stop');
-- short_text grading fixtures (shared with the TS grader) live in exam_grading.test.sql, generated by
-- scripts/sync-exam-grading-fixtures.mjs from packages/shared/src/exam/grading.fixtures.json.
select is(public.exam_normalize_text('좋아요 .'), '좋아요 ', 'no re-trim after stripping trailing punctuation');
delete from auth.users where id = 'e9000000-0000-4000-8000-00000000000a';
select is((select count(*)::integer from public.exam_attempts where user_id = 'e9000000-0000-4000-8000-00000000000a'), 0,
  'deleting a user cascades to their exam attempts');

select * from finish();
rollback;
