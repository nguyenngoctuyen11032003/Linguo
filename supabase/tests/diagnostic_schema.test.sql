begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- ===== Structure =====
select has_table('public', 'assessments', 'assessments exists');
select has_table('public', 'assessment_items', 'assessment_items exists');
select has_table('public', 'assessment_attempts', 'assessment_attempts exists');
select has_table('public', 'assessment_responses', 'assessment_responses exists');

select ok((select relrowsecurity from pg_class where oid = 'public.assessments'::regclass), 'RLS on assessments');
select ok((select relrowsecurity from pg_class where oid = 'public.assessment_items'::regclass), 'RLS on assessment_items');
select ok((select relrowsecurity from pg_class where oid = 'public.assessment_attempts'::regclass), 'RLS on assessment_attempts');
select ok((select relrowsecurity from pg_class where oid = 'public.assessment_responses'::regclass), 'RLS on assessment_responses');

select columns_are('public', 'assessment_items', array[
  'id', 'key', 'assessment_id', 'language_code', 'skill', 'level_code', 'difficulty', 'item_type', 'prompt', 'answer_key',
  'explanation', 'key_confidence', 'status', 'is_demo', 'reviewed_by', 'reviewed_at', 'version', 'content_hash',
  'created_at', 'updated_at'
], 'assessment_items columns');
select columns_are('public', 'assessment_attempts', array[
  'id', 'user_id', 'learning_path_id', 'assessment_id', 'mode', 'status', 'current_item_id', 'current_served_at',
  'skipped', 'report', 'started_at', 'completed_at', 'applied_at', 'last_activity_at'
], 'assessment_attempts columns');
select columns_are('public', 'assessment_responses', array[
  'attempt_id', 'seq', 'item_id', 'skill', 'choice', 'is_correct', 'served_at', 'answered_at'
], 'assessment_responses columns');

select col_is_unique('public', 'assessment_items', array['key'], 'item key unique');
select col_is_pk('public', 'assessment_responses', array['attempt_id', 'seq'], 'responses keyed by (attempt, seq)');
select col_is_unique('public', 'assessment_responses', array['attempt_id', 'item_id'], 'one response per item per attempt');
select has_index('public', 'assessment_attempts', 'assessment_attempts_one_in_progress', array['learning_path_id'], 'one-in-progress index');
select is((select indisunique from pg_index where indexrelid = 'public.assessment_attempts_one_in_progress'::regclass), true,
  'one-in-progress index is unique');
select is((select pg_get_expr(indpred, indrelid) from pg_index where indexrelid = 'public.assessment_attempts_one_in_progress'::regclass),
  '(status = ''in_progress''::text)', 'one-in-progress index is partial');
select has_index('public', 'assessment_items', 'assessment_items_bank_idx', array['assessment_id', 'skill', 'difficulty'], 'bank index');
select has_index('public', 'assessment_responses', 'assessment_responses_item_id_idx', 'responses item index');

-- skill_estimates is reused unchanged and already accepts the diagnostic source.
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.skill_estimates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%')
  like '%diagnostic%', 'skill_estimates accepts source diagnostic');

-- ===== Privileges =====
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('assessments', 'assessment_items', 'assessment_attempts', 'assessment_responses')
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and not (grantee = 'authenticated' and privilege_type = 'SELECT' and table_name = 'assessment_attempts')),
  0, 'only grant: authenticated SELECT on assessment_attempts');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'assessment_attempts' and grantee = 'authenticated' and privilege_type = 'SELECT'),
  1, 'authenticated may select attempts');
select is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name in ('assessments', 'assessment_items', 'assessment_responses')
     and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0, 'no column grants on items/responses/assessments');
select is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'assessment_attempts'
     and grantee in ('anon', 'authenticated', 'PUBLIC') and not (grantee = 'authenticated' and privilege_type = 'SELECT')),
  0, 'no column write grants on attempts');
select ok(not has_column_privilege('authenticated', 'public.assessment_items', 'answer_key', 'SELECT'), 'authenticated cannot read answer_key');
select ok(not has_column_privilege('authenticated', 'public.assessment_items', 'explanation', 'SELECT'), 'authenticated cannot read explanation');
select ok(not has_column_privilege('authenticated', 'public.assessment_responses', 'is_correct', 'SELECT'), 'authenticated cannot read is_correct');
select ok(not has_column_privilege('anon', 'public.assessment_items', 'answer_key', 'SELECT'), 'anon cannot read answer_key');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
     and tablename in ('assessments', 'assessment_items', 'assessment_attempts', 'assessment_responses')),
  1, 'exactly one policy (attempts read own)');
select is(
  (select cmd from pg_policies where schemaname = 'public' and tablename = 'assessment_attempts'), 'SELECT', 'attempt policy is select-only');

-- ===== Seed =====
select is((select array_agg(language_code order by language_code) from public.assessments where is_published and assessment_type = 'diagnostic'),
  array['de', 'en', 'ja', 'ko'], 'published diagnostic for de, en, ja and ko');
select is(
  (select config from public.assessments where key = 'en:assessment:diagnostic:v1'),
  '{"cooldown_days": 14, "abandon_days": 7, "max_items": 30, "foundation_max_items": 8, "foundation_max_b": 1.5,
    "prior_sd": 1.25, "stop_sd": 0.45, "min_items": 4, "max_items_per_skill": 8, "max_items_reading": 5,
    "rapid_ms": 800, "rapid_share": 0.3}'::jsonb, 'en config');
select is(
  (select config from public.assessments where key = 'ko:assessment:diagnostic:v1'),
  (select config from public.assessments where key = 'en:assessment:diagnostic:v1'), 'ko config equals en');
select is((select id from public.assessments where key = 'en:assessment:diagnostic:v1'), '994a20b9-416d-53f4-8918-00c27dc1dc74'::uuid, 'en assessment id');
select is((select id from public.assessments where key = 'ko:assessment:diagnostic:v1'), '7e36a091-ea02-5718-b5ee-72a402246a79'::uuid, 'ko assessment id');
select throws_ok($$update public.assessments set config = config - 'stop_sd' where key = 'en:assessment:diagnostic:v1'$$,
  '23514', null, 'config must keep every key');
select throws_ok($$insert into public.assessments (id, key, language_code, assessment_type, is_published, config)
  select gen_random_uuid(), 'en:assessment:diagnostic:v2', 'en', 'diagnostic', true, config from public.assessments where language_code = 'en'$$,
  '23505', null, 'one published diagnostic per language');

-- ===== Fixtures (as owner): two learners with one path each, two items =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('d2000000-0000-4000-8000-00000000000a', 'd2a@test.dev', '{}'),
  ('d2000000-0000-4000-8000-00000000000b', 'd2b@test.dev', '{}');

insert into public.learning_paths (id, user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, estimate) values
  ('d2000000-0000-4000-8000-0000000000a1', 'd2000000-0000-4000-8000-00000000000a', 'en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[], '{}'),
  ('d2000000-0000-4000-8000-0000000000b1', 'd2000000-0000-4000-8000-00000000000b', 'en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[], '{}');

insert into public.assessment_items (id, key, assessment_id, language_code, skill, level_code, difficulty, item_type, prompt, answer_key, explanation, status, is_demo, content_hash) values
  ('d2000000-0000-4000-8000-000000000011', 'en:diag:d2-test-1', '994a20b9-416d-53f4-8918-00c27dc1dc74', 'en', 'vocabulary', 'a1', 1.5, 'mcq',
   '{"stem": "cat", "stem_lang": "en", "options": [{"id": "a", "text": "mèo", "lang": "vi"}, {"id": "b", "text": "chó", "lang": "vi"}]}',
   'a', '{"vi": "cat = mèo"}', 'published', true, repeat('1', 64)),
  ('d2000000-0000-4000-8000-000000000012', 'en:diag:d2-test-2', '994a20b9-416d-53f4-8918-00c27dc1dc74', 'en', 'vocabulary', 'a1', 1.5, 'mcq',
   '{"stem": "dog", "stem_lang": "en", "options": [{"id": "a", "text": "mèo", "lang": "vi"}, {"id": "b", "text": "chó", "lang": "vi"}]}',
   'b', null, 'published', true, repeat('2', 64));

insert into public.assessment_attempts (id, user_id, learning_path_id, assessment_id, current_item_id, current_served_at) values
  ('d2000000-0000-4000-8000-0000000000c1', 'd2000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-0000000000a1',
   '994a20b9-416d-53f4-8918-00c27dc1dc74', 'd2000000-0000-4000-8000-000000000012', now()),
  ('d2000000-0000-4000-8000-0000000000c2', 'd2000000-0000-4000-8000-00000000000b', 'd2000000-0000-4000-8000-0000000000b1',
   '994a20b9-416d-53f4-8918-00c27dc1dc74', null, null);
insert into public.assessment_responses (attempt_id, seq, item_id, skill, choice, is_correct, served_at) values
  ('d2000000-0000-4000-8000-0000000000c1', 1, 'd2000000-0000-4000-8000-000000000011', 'vocabulary', 'a', true, now()),
  ('d2000000-0000-4000-8000-0000000000c2', 1, 'd2000000-0000-4000-8000-000000000011', 'vocabulary', null, false, now());

-- ===== Defaults and constraints (as owner) =====
select is(
  (select row(mode, status, skipped, report, completed_at, applied_at)::text from public.assessment_attempts where id = 'd2000000-0000-4000-8000-0000000000c2'),
  '(full,in_progress,{},,,)', 'attempt defaults');
select is((select key_confidence from public.assessment_items where id = 'd2000000-0000-4000-8000-000000000011'), 'unreviewed', 'key_confidence defaults to unreviewed');
select throws_ok($$insert into public.assessment_attempts (user_id, learning_path_id, assessment_id) values
  ('d2000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-0000000000a1', '994a20b9-416d-53f4-8918-00c27dc1dc74')$$,
  '23505', null, 'second in-progress attempt for a path refused');
select lives_ok($$insert into public.assessment_attempts (user_id, learning_path_id, assessment_id, status) values
  ('d2000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-0000000000a1', '994a20b9-416d-53f4-8918-00c27dc1dc74', 'abandoned')$$,
  'abandoned attempts do not count toward the in-progress limit');
select throws_ok($$update public.assessment_attempts set status = 'completed', completed_at = now(), current_item_id = null, current_served_at = null
  where id = 'd2000000-0000-4000-8000-0000000000c2'$$, '23514', null, 'completed attempt needs a report');
select throws_ok($$update public.assessment_attempts set current_served_at = null where id = 'd2000000-0000-4000-8000-0000000000c1'$$,
  '23514', null, 'current item and served_at go together');
select throws_ok($$update public.assessment_attempts set applied_at = now() where id = 'd2000000-0000-4000-8000-0000000000c2'$$,
  '23514', null, 'only completed attempts can be applied');
select throws_ok($$insert into public.assessment_responses (attempt_id, seq, item_id, skill, choice, is_correct, served_at) values
  ('d2000000-0000-4000-8000-0000000000c1', 2, 'd2000000-0000-4000-8000-000000000011', 'vocabulary', 'b', false, now())$$,
  '23505', null, 'same item twice in an attempt refused');
select throws_ok($$insert into public.assessment_responses (attempt_id, seq, item_id, skill, choice, is_correct, served_at) values
  ('d2000000-0000-4000-8000-0000000000c1', 1, 'd2000000-0000-4000-8000-000000000012', 'vocabulary', 'b', true, now())$$,
  '23505', null, 'same seq twice in an attempt refused');
select throws_ok($$insert into public.assessment_items (id, key, assessment_id, language_code, skill, level_code, difficulty, item_type, prompt, answer_key, content_hash)
  values (gen_random_uuid(), 'en:diag:d2-bad-key', '994a20b9-416d-53f4-8918-00c27dc1dc74', 'en', 'grammar', 'a1', 1.5, 'mcq',
  '{"stem": "x", "stem_lang": "en", "options": [{"id": "a", "text": "1", "lang": "en"}, {"id": "b", "text": "2", "lang": "en"}]}', 'z', repeat('3', 64))$$,
  '23514', null, 'answer_key must be an option id');
select throws_ok($$insert into public.assessment_items (id, key, assessment_id, language_code, skill, level_code, difficulty, item_type, prompt, answer_key, content_hash)
  values (gen_random_uuid(), 'en:diag:d2-bad-lang', '994a20b9-416d-53f4-8918-00c27dc1dc74', 'ko', 'grammar', 'topik1', 1.5, 'mcq',
  '{"stem": "x", "stem_lang": "ko", "options": [{"id": "a", "text": "1", "lang": "ko"}, {"id": "b", "text": "2", "lang": "ko"}]}', 'a', repeat('3', 64))$$,
  '23503', null, 'item language must match its assessment');
select throws_ok($$insert into public.assessment_items (id, key, assessment_id, language_code, skill, level_code, difficulty, item_type, prompt, answer_key, content_hash)
  values (gen_random_uuid(), 'en:diag:d2-listening', '994a20b9-416d-53f4-8918-00c27dc1dc74', 'en', 'listening', 'a1', 1.5, 'mcq',
  '{"stem": "x", "stem_lang": "en", "options": [{"id": "a", "text": "1", "lang": "en"}, {"id": "b", "text": "2", "lang": "en"}]}', 'a', repeat('3', 64))$$,
  '23514', null, 'only vocabulary/grammar/reading items');
select throws_ok($$update public.assessment_items set status = 'draft' where id = 'd2000000-0000-4000-8000-000000000011'$$,
  'P0001', 'invalid_status_transition', 'items follow the content status workflow');

-- ===== As learner A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d2000000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.assessment_attempts), 2, 'A sees only own attempts');
select throws_ok($$select id from public.assessment_items$$, '42501', null, 'A cannot read items');
select throws_ok($$select attempt_id from public.assessment_responses$$, '42501', null, 'A cannot read responses');
select throws_ok($$select id from public.assessments$$, '42501', null, 'A cannot read assessments');
select throws_ok($$update public.assessment_attempts set status = 'completed'$$, '42501', null, 'A cannot update attempts');
select throws_ok($$insert into public.assessment_attempts (user_id, learning_path_id, assessment_id) values
  ('d2000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-0000000000a1', '994a20b9-416d-53f4-8918-00c27dc1dc74')$$,
  '42501', null, 'A cannot insert attempts');

-- ===== As learner B =====
select set_config('request.jwt.claims', '{"sub": "d2000000-0000-4000-8000-00000000000b", "role": "authenticated"}', true);
select is((select array_agg(id::text) from public.assessment_attempts), array['d2000000-0000-4000-8000-0000000000c2'], 'B sees only own attempt');

-- ===== As anon =====
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select id from public.assessment_attempts$$, '42501', null, 'anon cannot read attempts');
select throws_ok($$select id from public.assessment_items$$, '42501', null, 'anon cannot read items');

-- ===== Cascade (as owner) =====
reset role;
delete from public.learning_paths where id = 'd2000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int from public.assessment_attempts where user_id = 'd2000000-0000-4000-8000-00000000000a')
  + (select count(*)::int from public.assessment_responses where attempt_id = 'd2000000-0000-4000-8000-0000000000c1'),
  0, 'deleting a path removes its attempts and responses');

select * from finish();
rollback;
