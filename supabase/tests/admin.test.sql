-- Spec 11 §3, §5: staff roles, the admin RPCs (role checks, status workflow, publish block, reports queue,
-- audit log, aggregate-only analytics) and the import precedence of 20261015000420. Uses the seed demo content.
begin;
create extension if not exists pgtap with schema extensions;
select plan(139);

-- L learner, E editor, R reviewer, A admin.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'learner@test.dev', '{}', now()),
  ('22222222-2222-4222-8222-222222222222', 'editor@test.dev', '{}', now()),
  ('33333333-3333-4333-8333-333333333333', 'reviewer@test.dev', '{}', now()),
  ('44444444-4444-4444-8444-444444444444', 'admin@test.dev', '{}', now());
-- Bootstrap by SQL (docs/DEPLOY.md "Quản trị nội dung").
insert into public.staff_roles (user_id, role) values
  ('22222222-2222-4222-8222-222222222222', 'editor'),
  ('33333333-3333-4333-8333-333333333333', 'reviewer'),
  ('44444444-4444-4444-8444-444444444444', 'admin');

create function public.c1a_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- SQLSTATE + message raised by a statement, or 'ok'.
create function public.c1a_err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function public.c1a_as(uuid), public.c1a_err(text) to authenticated;

select set_config('test.hello', (select id::text from public.lessons where key = 'en:lesson:hello'), true);
select set_config('test.iam', (select id::text from public.lessons where key = 'en:lesson:i-am'), true);
select set_config('test.iam_ex', (select id::text from public.exercises
  where lesson_id = current_setting('test.iam')::uuid and status = 'published' order by order_index limit 1), true);
select set_config('test.hello_ex', (select id::text from public.exercises
  where lesson_id = current_setting('test.hello')::uuid and status = 'published' order by order_index limit 1), true);
select set_config('test.item', (select id::text from public.learning_items where key = 'en:item:hello'), true);
select set_config('test.unit', (select id::text from public.units where key = 'en:unit:greetings'), true);
select set_config('test.program', (select id::text from public.programs where key = 'en:program:foundation'), true);
select set_config('test.assess', (select id::text from public.assessment_items
  where language_code = 'en' and skill = 'grammar' and status = 'published' order by key limit 1), true);
select set_config('test.form', (select id::text from public.exam_forms where key = 'ko:exam:topik-i-mock-1'), true);
select set_config('test.examq', (select id::text from public.exam_questions
  where form_id = current_setting('test.form')::uuid and status = 'published' order by seq limit 1), true);

-- ===== Schema and privileges =====
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.staff_roles'::regclass, 'public.admin_audit_log'::regclass)),
  'staff_roles and admin_audit_log have RLS');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_log', 'select'), 'learners cannot read the audit log');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_log', 'insert'), 'learners cannot write the audit log');
select ok(not has_table_privilege('authenticated', 'public.staff_roles', 'insert')
  and not has_table_privilege('authenticated', 'public.staff_roles', 'update'), 'learners cannot grant themselves a role');
select ok(not has_schema_privilege('authenticated', 'admin_private', 'usage') and not has_schema_privilege('anon', 'admin_private', 'usage'),
  'admin_private is closed to clients');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'admin_private'::regnamespace
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), 0,
  'no admin_private function is executable by clients');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'admin\_%' or p.proname = 'staff_role')),
  array['admin_ai_usage', 'admin_analytics', 'admin_audit_log_recent', 'admin_content_overview', 'admin_find_user',
    'admin_get_content', 'admin_grant_role', 'admin_list_content', 'admin_list_reports', 'admin_list_sources',
    'admin_list_staff', 'admin_list_teachers', 'admin_resolve_report', 'admin_set_status', 'staff_role'], 'the admin RPC set');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'admin\_%' or p.proname = 'staff_role')),
  'every admin RPC is security definer with an empty search_path');
select is((select count(*)::integer from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'admin\_%' or p.proname = 'staff_role')
      and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))), 0,
  'admin RPCs: authenticated only, never anon');

-- ===== Learner: no staff access anywhere =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.admin_content_overview()', '42501', 'not_authenticated', 'admin RPCs need a user');
select is(public.staff_role(), null, 'staff_role() is null without a user');

select public.c1a_as('11111111-1111-4111-8111-111111111111');
select is(public.staff_role(), null, 'a learner has no staff role');
select is((select count(*)::integer from public.staff_roles), 0, 'a learner sees no staff_roles rows');
select throws_ok('select count(*) from public.admin_audit_log', '42501', null, 'a learner cannot read the audit log');
select throws_ok('select count(*) from content_private.exercise_keys', '42501', null, 'a learner cannot read exercise keys');
select throws_ok('select count(*) from content_private.exam_keys', '42501', null, 'a learner cannot read exam keys');
select throws_ok('select count(*) from content_private.revisions', '42501', null, 'a learner cannot read revisions');
select is(
  (select coalesce(array_agg(c order by c), '{}') from unnest(array[
    'select public.admin_content_overview()',
    'select public.admin_list_content()',
    format('select public.admin_get_content(''lesson'', %L)', current_setting('test.hello')),
    'select public.admin_list_sources()',
    format('select public.admin_set_status(''lesson'', %L, ''in_review'')', current_setting('test.hello')),
    'select public.admin_list_reports()',
    'select public.admin_resolve_report(array[gen_random_uuid()], ''fixed'')',
    'select public.admin_analytics(7)',
    'select public.admin_ai_usage(7)',
    'select public.admin_audit_log_recent()',
    'select public.admin_grant_role(''11111111-1111-4111-8111-111111111111'', ''admin'')'
  ]) c where public.c1a_err(c) <> 'P0001 staff_forbidden'),
  '{}'::text[], 'every admin_* RPC raises staff_forbidden for a learner');

-- ===== Editor: read RPCs and reports, no status changes, no admin pages =====
select public.c1a_as('22222222-2222-4222-8222-222222222222');
select is(public.staff_role(), 'editor', 'staff_role() returns the caller''s role');
select is((select count(*)::integer from public.staff_roles), 1, 'staff see only their own staff_roles row');
select is(
  (select coalesce(array_agg(c order by c), '{}') from unnest(array[
    format('select public.admin_set_status(''lesson'', %L, ''in_review'')', current_setting('test.hello')),
    'select public.admin_analytics(7)',
    'select public.admin_ai_usage(7)',
    'select public.admin_audit_log_recent()',
    'select public.admin_grant_role(''11111111-1111-4111-8111-111111111111'', ''editor'')'
  ]) c where public.c1a_err(c) <> 'P0001 staff_forbidden'),
  '{}'::text[], 'an editor cannot change status, read analytics or the audit log, or grant roles');

select set_config('test.ov', public.admin_content_overview()::text, true);
-- Comparisons read the tables as the test owner; the RPCs still run as the editor (request.jwt.claims).
reset role;
select ok((current_setting('test.ov')::jsonb -> 'counts') @> jsonb_build_array(jsonb_build_object(
    'kind', 'lesson', 'language_code', 'en', 'status', 'published',
    'count', (select count(*)::integer from public.lessons where language_code = 'en' and status = 'published'))),
  'overview counts lessons by language and status');
select ok((select bool_and(c ->> 'kind' in ('program', 'unit', 'lesson', 'learning_item', 'exercise', 'assessment_item', 'exam_form', 'exam_question'))
  from jsonb_array_elements(current_setting('test.ov')::jsonb -> 'counts') c), 'overview kinds are ADMIN_CONTENT_KINDS');
select is((current_setting('test.ov')::jsonb ->> 'demo_count')::integer,
  (select (select count(*) from public.programs where is_demo and status <> 'archived')
    + (select count(*) from public.units where is_demo and status <> 'archived')
    + (select count(*) from public.lessons where is_demo and status <> 'archived')
    + (select count(*) from public.learning_items where is_demo and status <> 'archived')
    + (select count(*) from public.exercises where is_demo and status <> 'archived')
    + (select count(*) from public.assessment_items where is_demo and status <> 'archived')
    + (select count(*) from public.exam_forms where is_demo and status <> 'archived')
    + (select count(*) from public.exam_questions q join public.exam_forms f on f.id = q.form_id where f.is_demo and q.status <> 'archived'))::integer,
  'overview demo_count');
-- Matches the index itself rather than assuming unreviewed content exists: the seed is fully reviewed once published.
select is((current_setting('test.ov')::jsonb ->> 'unreviewed_published_count')::integer,
  (select count(*)::integer from admin_private.content_index x where x.status in ('approved', 'published') and x.reviewed_at is null),
  'overview counts approved or published content without a review');
select is((current_setting('test.ov')::jsonb ->> 'open_report_count')::integer, 0, 'no open reports yet');

select is((public.admin_list_content('lesson', 'en') ->> 'total')::integer,
  (select count(*)::integer from public.lessons where language_code = 'en'), 'list filters by kind and language');
select is(jsonb_array_length(public.admin_list_content('lesson', 'en', null, null, 2, 0) -> 'items'), 2, 'list paginates');
select ok(public.admin_list_content('learning_item', 'en', null, 'HELLO', 200) -> 'items' @> '[{"key": "en:item:hello"}]'::jsonb,
  'search is case-insensitive over key and label');
select is((public.admin_list_content('exam_question', 'ko', 'published') ->> 'total')::integer,
  (select count(*)::integer from public.exam_questions q join public.exam_forms f on f.id = q.form_id
   where f.language_code = 'ko' and q.status = 'published'), 'exam questions take their form''s language');
select is((public.admin_list_content(null, null, null, '100%_') ->> 'total')::integer, 0, 'LIKE wildcards in the search are literal');
set local role authenticated;
select throws_ok('select public.admin_list_content(''lessons'')', 'P0001', 'invalid_kind', 'kinds are singular');

-- Detail: answers from content_private for staff, repo path, revisions, source.
select set_config('test.det', public.admin_get_content('exercise', current_setting('test.hello_ex')::uuid)::text, true);
select ok((current_setting('test.det')::jsonb #> '{private,answer_key}') is not null
  and (current_setting('test.det')::jsonb #>> '{private,display_answer}') is not null, 'staff see the exercise answer key');
select is(current_setting('test.det')::jsonb ->> 'repo_path',
  'content/en/programs/foundation/units/01-greetings/lessons/01-hello.yaml', 'an exercise lives in its lesson file');
select ok(jsonb_array_length(current_setting('test.det')::jsonb -> 'revisions') >= 1, 'revisions are listed');
select is(current_setting('test.det')::jsonb #>> '{source,key}', 'src:linguo-demo', 'the source is attached');
select ok(current_setting('test.det')::jsonb ?& array['kind', 'id', 'key', 'status', 'is_demo', 'version', 'reviewed_by',
  'reviewed_at', 'row', 'private', 'source', 'revisions', 'repo_path'], 'detail matches adminContentDetailSchema');
select ok((public.admin_get_content('exam_question', current_setting('test.examq')::uuid) #> '{private,answer}') is not null,
  'staff see the exam answer');
select is(public.admin_get_content('exam_question', current_setting('test.examq')::uuid) ->> 'repo_path',
  'content/exams/ko/topik-i-mock-1.yaml', 'an exam question lives in its form file');
select is(public.admin_get_content('assessment_item', current_setting('test.assess')::uuid) ->> 'repo_path',
  'content/diagnostic/en/grammar.yaml', 'a diagnostic item lives in its skill file');
select ok((public.admin_get_content('assessment_item', current_setting('test.assess')::uuid) #>> '{private,answer_key}') is not null,
  'staff see the diagnostic answer key');
select is(public.admin_get_content('learning_item', current_setting('test.item')::uuid) ->> 'repo_path',
  'content/en/items/greetings.yaml', 'an item lives in the items file of its unit');
select is(public.admin_get_content('unit', current_setting('test.unit')::uuid) ->> 'repo_path',
  'content/en/programs/foundation/units/01-greetings/unit.yaml', 'unit repo path');
select is(public.admin_get_content('program', current_setting('test.program')::uuid) ->> 'repo_path',
  'content/en/programs/foundation/program.yaml', 'program repo path');
select is(public.admin_get_content('program', current_setting('test.program')::uuid) -> 'private', 'null'::jsonb,
  'a kind without answers has private = null');
select throws_ok(format('select public.admin_get_content(''lesson'', %L)', gen_random_uuid()), 'P0001', 'content_not_found', 'unknown id');
select throws_ok(format('select public.admin_get_content(''nope'', %L)', gen_random_uuid()), 'P0001', 'invalid_kind', 'unknown kind');

select ok((select (s ->> 'usage_count')::integer > 0 from jsonb_array_elements(public.admin_list_sources()) s
  where s ->> 'key' = 'src:linguo-demo'), 'sources list their usage');
select ok((select bool_and(s ?& array['id', 'key', 'name', 'license', 'attribution', 'url', 'status', 'usage_count'])
  from jsonb_array_elements(public.admin_list_sources()) s), 'sources match adminSourceSchema');

-- The learner still cannot read content_private after staff did.
select public.c1a_as('11111111-1111-4111-8111-111111111111');
select throws_ok('select count(*) from content_private.exercise_keys', '42501', null, 'learners still cannot read answer keys');

-- ===== Learner reports (wrong answers on hello's exercise and i-am's exercise) =====
select is(public.report_content('exercise', current_setting('test.hello_ex')::uuid, 'wrong_answer', 'Đáp án sai') ->> 'status', 'open',
  'learner reports a wrong answer');
select is(public.report_content('lesson', current_setting('test.hello')::uuid, 'wrong_answer', null) ->> 'status', 'open',
  'learner reports the lesson');
select is(public.report_content('exercise', current_setting('test.iam_ex')::uuid, 'typo', null) ->> 'status', 'open',
  'learner reports a typo');
reset role;
insert into public.content_reports (user_id, target_kind, target_id, reason, status) values
  ('22222222-2222-4222-8222-222222222222', 'exercise', current_setting('test.iam_ex')::uuid, 'wrong_answer', 'open');
set local role authenticated;

-- ===== Reviewer: status workflow =====
select public.c1a_as('33333333-3333-4333-8333-333333333333');
select is(public.admin_set_status('lesson', current_setting('test.hello')::uuid, 'in_review', 'Kiểm tra lại đáp án'),
  '{"status": "in_review"}'::jsonb, 'reviewer sends a published lesson back to review');
reset role;
select is((select status from public.lessons where id = current_setting('test.hello')::uuid), 'in_review', 'the lesson is in review');
set local role authenticated;
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''published'')', current_setting('test.hello')),
  'P0001', 'invalid_status_transition', 'in_review cannot jump to published');
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''archived'')', current_setting('test.hello')),
  'P0001', 'invalid_status_transition', 'in_review cannot be archived');
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''bogus'')', current_setting('test.hello')),
  'P0001', 'invalid_status_transition', 'unknown status');
select is(public.admin_set_status('lesson', current_setting('test.hello')::uuid, 'approved') ->> 'status', 'approved', 'reviewer approves');
reset role;
select is((select reviewed_by from public.lessons where id = current_setting('test.hello')::uuid),
  '33333333-3333-4333-8333-333333333333', 'approval records reviewed_by');
select ok((select reviewed_at is not null from public.lessons where id = current_setting('test.hello')::uuid), 'approval records reviewed_at');
set local role authenticated;
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''published'')', current_setting('test.hello')),
  'P0001', 'open_wrong_answer_reports', 'publishing is blocked by open wrong_answer reports (lesson and its exercises)');
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''published'', null, true)', current_setting('test.hello')),
  'P0001', 'open_wrong_answer_reports', 'only an admin may force');
select throws_ok(format('select public.admin_set_status(''exam_question'', %L, ''in_review'')', current_setting('test.examq')),
  'P0001', 'invalid_status_transition', 'exam questions only have published/archived');
select is(public.admin_set_status('exam_question', current_setting('test.examq')::uuid, 'archived') ->> 'status', 'archived',
  'an exam question can be archived');
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''in_review'')', gen_random_uuid()),
  'P0001', 'content_not_found', 'unknown content');
select throws_ok(format('select public.admin_set_status(''source'', %L, ''in_review'')', gen_random_uuid()),
  'P0001', 'invalid_kind', 'unknown kind');

-- i-am: a wrong_answer report on one of its exercises blocks the lesson until it is resolved.
select is(public.admin_set_status('lesson', current_setting('test.iam')::uuid, 'in_review') ->> 'status', 'in_review', 'i-am to review');
select is(public.admin_set_status('lesson', current_setting('test.iam')::uuid, 'approved') ->> 'status', 'approved', 'i-am approved');
select throws_ok(format('select public.admin_set_status(''lesson'', %L, ''published'')', current_setting('test.iam')),
  'P0001', 'open_wrong_answer_reports', 'an exercise''s wrong_answer report blocks its lesson');

-- ===== Reports queue (editor) =====
select public.c1a_as('22222222-2222-4222-8222-222222222222');
select set_config('test.rl', public.admin_list_reports('open') ::text, true);
select is((current_setting('test.rl')::jsonb ->> 'total_groups')::integer, 3, 'open reports grouped by target');
select is((select g -> 'reasons' from jsonb_array_elements(current_setting('test.rl')::jsonb -> 'groups') g
  where g ->> 'target_id' = current_setting('test.iam_ex')), '{"typo": 1, "wrong_answer": 1}'::jsonb, 'reasons are counted per group');
select is(current_setting('test.rl')::jsonb -> 'groups' -> 0 ->> 'target_id', current_setting('test.iam_ex'),
  'the most reported target comes first');
select ok(position('11111111-1111-4111-8111-111111111111' in current_setting('test.rl')) = 0
  and position('user_id' in current_setting('test.rl')) = 0, 'the queue never reveals who reported');
select is((public.admin_list_reports(null, 'lesson') ->> 'total_groups')::integer, 1, 'the queue filters by kind');
select throws_ok('select public.admin_list_reports(''closed'')', 'P0001', 'invalid_report_status', 'unknown report status filter');
select throws_ok('select public.admin_list_reports(null, ''unit'')', 'P0001', 'invalid_kind', 'unknown report kind filter');
select throws_ok(format('select public.admin_resolve_report(array[%L]::uuid[], ''open'')', gen_random_uuid()),
  'P0001', 'invalid_report_status', 'reports cannot be reopened through resolve');
select throws_ok(format('select public.admin_resolve_report(array[%L]::uuid[], ''fixed'', %L)', gen_random_uuid(), repeat('x', 501)),
  'P0001', 'note_too_long', 'resolution note longer than 500');
select is(public.admin_resolve_report(
    (select array_agg((r ->> 'id')::uuid) from jsonb_array_elements(current_setting('test.rl')::jsonb -> 'groups') g,
       jsonb_array_elements(g -> 'reports') r where g ->> 'target_id' = current_setting('test.iam_ex')),
    'fixed', 'Đã sửa trong repo'),
  '{"updated": 2}'::jsonb, 'editor resolves a group of reports');
select is(public.admin_resolve_report(array[gen_random_uuid()], 'rejected'), '{"updated": 0}'::jsonb, 'unknown ids update nothing');
reset role;
select is((select count(*)::integer from public.content_reports
  where target_id = current_setting('test.iam_ex')::uuid and status = 'fixed'
    and resolved_by = '22222222-2222-4222-8222-222222222222' and resolved_at is not null and resolution_note = 'Đã sửa trong repo'), 2,
  'resolution records status, note, resolver and time');
set local role authenticated;
select public.c1a_as('11111111-1111-4111-8111-111111111111');
select is((select r ->> 'resolution_note' from jsonb_array_elements(public.list_my_reports()) r where r ->> 'target_id' = current_setting('test.iam_ex')),
  'Đã sửa trong repo', 'the learner sees how the report was resolved');

-- Resolved: i-am can be published now. hello still blocked for the reviewer, forced by the admin.
select public.c1a_as('33333333-3333-4333-8333-333333333333');
select is(public.admin_set_status('lesson', current_setting('test.iam')::uuid, 'published') ->> 'status', 'published',
  'publishing works once the wrong_answer reports are resolved');
select public.c1a_as('44444444-4444-4444-8444-444444444444');
select is(public.admin_set_status('lesson', current_setting('test.hello')::uuid, 'published', 'Đáp án đúng, báo nhầm', true) ->> 'status',
  'published', 'an admin may force publishing');
select is((select status || ':' || reviewed_by from public.lessons where id = current_setting('test.hello')::uuid),
  'published:44444444-4444-4444-8444-444444444444', 'publishing records the admin as reviewer');

-- ===== Audit log: every change has a row =====
reset role;
select is((select count(*)::integer from public.admin_audit_log where action = 'set_status'), 7, 'every status change is audited');
select is((select detail from public.admin_audit_log where action = 'set_status' and target_id = current_setting('test.hello')
    and actor = '44444444-4444-4444-8444-444444444444'),
  '{"from": "approved", "to": "published", "note": "Đáp án đúng, báo nhầm", "forced": true, "open_wrong_answer_reports": 2}'::jsonb,
  'the forced publish is audited with its reason');
select is((select actor_role || ':' || target_kind from public.admin_audit_log where action = 'set_status' and target_id = current_setting('test.examq')),
  'reviewer:exam_question', 'audit rows carry actor role and target');
select is((select count(*)::integer from public.admin_audit_log where action = 'resolve_reports'), 1,
  'resolving reports is audited (a no-op call is not)');
set local role authenticated;

-- ===== Admin: roles, audit log, analytics =====
select public.c1a_as('44444444-4444-4444-8444-444444444444');
select is(public.admin_grant_role('11111111-1111-4111-8111-111111111111', 'editor'),
  '{"user_id": "11111111-1111-4111-8111-111111111111", "role": "editor"}'::jsonb, 'admin grants a role');
select throws_ok('select public.admin_grant_role(''11111111-1111-4111-8111-111111111111'', ''owner'')', 'P0001', 'invalid_role', 'unknown role');
select throws_ok(format('select public.admin_grant_role(%L, ''editor'')', gen_random_uuid()), 'P0001', 'user_not_found', 'unknown user');
select public.c1a_as('11111111-1111-4111-8111-111111111111');
select is(public.staff_role(), 'editor', 'the granted role takes effect');
select public.c1a_as('44444444-4444-4444-8444-444444444444');
select is(public.admin_grant_role('11111111-1111-4111-8111-111111111111', null) ->> 'role', null, 'admin revokes a role');
select is(public.admin_audit_log_recent(2) -> 0 ->> 'action', 'revoke_role', 'the audit log lists the newest change first');
select is(public.admin_audit_log_recent(2) -> 0 -> 'detail', '{"role": null, "previous_role": "editor"}'::jsonb, 'role changes are audited');
select ok((select bool_and(e ?& array['id', 'actor', 'actor_role', 'action', 'target_kind', 'target_id', 'detail', 'created_at'])
  from jsonb_array_elements(public.admin_audit_log_recent()) e), 'audit entries match adminAuditEntrySchema');
select public.c1a_as('11111111-1111-4111-8111-111111111111');
select is(public.staff_role(), null, 'the revoked role is gone');

-- Analytics data: L active today with a review session; AI usage and a report.
reset role;
insert into public.analytics_events (user_id, name, props) values
  ('11111111-1111-4111-8111-111111111111', 'review_session_completed', '{}'),
  ('11111111-1111-4111-8111-111111111111', 'page_view', '{}');
insert into public.ai_usage (id, user_id, task, prompt_version, model, status, latency_ms, cached) values
  ('aa000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'explain_concept', 'v1', 'm', 'ok', 100, false),
  ('aa000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'explain_concept', 'v1', 'm', 'ok', 300, true);
insert into public.ai_reports (user_id, usage_id, task, prompt_version, reason) values
  ('11111111-1111-4111-8111-111111111111', 'aa000000-0000-4000-8000-000000000001', 'explain_concept', 'v1', 'wrong');
set local role authenticated;
select public.c1a_as('44444444-4444-4444-8444-444444444444');
select set_config('test.an', public.admin_analytics(7)::text, true);
select is(jsonb_array_length(current_setting('test.an')::jsonb -> 'daily'), 7, 'one daily row per day of the range');
select ok((current_setting('test.an')::jsonb -> 'daily' -> 6 ->> 'dau')::integer >= 1
  and (current_setting('test.an')::jsonb -> 'daily' -> 6 ->> 'review_sessions')::integer >= 1, 'today counts the active learner and the review session');
select ok((current_setting('test.an')::jsonb #>> '{funnel,signed_up}')::integer >= 4, 'the funnel counts new sign-ups');
select ok(current_setting('test.an')::jsonb ?& array['days', 'daily', 'wau', 'onboarding_completed', 'funnel'], 'analytics match adminAnalyticsSchema');
select ok(position('11111111-1111-4111-8111-111111111111' in current_setting('test.an')) = 0
  and position('user_id' in current_setting('test.an')) = 0 and position('@' in current_setting('test.an')) = 0,
  'analytics carry no user id or email');
select throws_ok('select public.admin_analytics(30)', 'P0001', 'invalid_range', 'only 7, 28 or 90 days');
select set_config('test.ai', public.admin_ai_usage(28)::text, true);
select is(current_setting('test.ai')::jsonb -> 'by_task', '[{"task": "explain_concept", "status": "ok", "count": 2}]'::jsonb, 'AI requests by task and status');
select is((current_setting('test.ai')::jsonb ->> 'cache_hit_rate')::numeric, 0.5, 'AI cache hit rate');
select is((current_setting('test.ai')::jsonb ->> 'latency_p50_ms')::numeric, 200.0, 'AI latency p50');
select is(current_setting('test.ai')::jsonb -> 'reports_by_reason', '{"wrong": 1}'::jsonb, 'AI reports by reason');
select ok(position('11111111-1111-4111-8111-111111111111' in current_setting('test.ai')) = 0, 'AI usage carries no user id');
select throws_ok('select public.admin_ai_usage(1)', 'P0001', 'invalid_range', 'AI usage range is checked');
reset role;

-- ===== Import precedence (20261015000420): a re-import never downgrades a published row =====
-- Bundle rebuilt from the database itself, so every content_hash is unchanged.
create function pg_temp.c1a_bundle() returns jsonb language sql as $$
  select jsonb_build_object(
    'bundle_version', 1, 'git_sha', null,
    'sources', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.content_sources s where s.status <> 'archived'),
    'programs', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.programs p where p.status <> 'archived'),
    'units', (select coalesce(jsonb_agg(to_jsonb(u)), '[]') from public.units u where u.status <> 'archived'),
    'lessons', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.lessons l where l.status <> 'archived'),
    'lesson_prerequisites', (select coalesce(jsonb_agg(to_jsonb(lp)), '[]') from public.lesson_prerequisites lp
      join public.lessons l on l.id = lp.lesson_id where l.status <> 'archived'),
    'learning_items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from public.learning_items i where i.status <> 'archived'),
    'lesson_items', (select coalesce(jsonb_agg(to_jsonb(li)), '[]') from public.lesson_items li
      join public.lessons l on l.id = li.lesson_id where l.status <> 'archived'),
    'exercises', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('key_data', jsonb_build_object(
        'answer_key', k.answer_key, 'rubric', k.rubric, 'known_wrong', k.known_wrong, 'explanation', k.explanation,
        'display_answer', k.display_answer))), '[]')
      from public.exercises e join content_private.exercise_keys k on k.exercise_id = e.id and k.version = e.version
      where e.status <> 'archived'));
$$;
select set_config('test.bundle', pg_temp.c1a_bundle()::text, true);
select is((content_private.import_bundle(current_setting('test.bundle')::jsonb) ->> 'updated')::integer, 0,
  'a bundle equal to the database changes nothing');
-- The YAML still says `approved` for hello (published by the admin above): the import keeps it published.
select lives_ok(format('select content_private.import_bundle(%L::jsonb)', jsonb_set(current_setting('test.bundle')::jsonb, '{lessons}',
  (select jsonb_agg(case when l ->> 'id' = current_setting('test.hello') then l || '{"status": "approved"}' else l end)
   from jsonb_array_elements(current_setting('test.bundle')::jsonb -> 'lessons') l))), 'a stale approved status does not fail the import');
select is((select status from public.lessons where id = current_setting('test.hello')::uuid), 'published', 'the published lesson stays published');
-- The YAML says `published` for i-am, which a reviewer sent back to review: the review decision is kept.
set local role authenticated;
select public.c1a_as('33333333-3333-4333-8333-333333333333');
select is(public.admin_set_status('lesson', current_setting('test.iam')::uuid, 'in_review') ->> 'status', 'in_review', 'i-am back to review');
reset role;
select is((content_private.import_bundle(current_setting('test.bundle')::jsonb) ->> 'updated')::integer, 0,
  'the import keeps the reviewer''s decision instead of failing');
select is((select status from public.lessons where id = current_setting('test.iam')::uuid), 'in_review', 'i-am is still in review');
-- Archiving through the YAML still works.
select is((content_private.import_bundle(jsonb_set(current_setting('test.bundle')::jsonb, '{lessons}',
  (select jsonb_agg(case when l ->> 'id' = current_setting('test.hello') then l || '{"status": "archived"}' else l end)
   from jsonb_array_elements(current_setting('test.bundle')::jsonb -> 'lessons') l))) ->> 'updated')::integer, 1,
  'a published lesson can still be archived by the import');
select is((select status from public.lessons where id = current_setting('test.hello')::uuid), 'archived', 'hello archived');

-- ===== Import vs the report gate and human decisions (20261016000500) =====
-- The learning item "hello" was written by the YAML (reviewed_by is a reviewer name, not a user id). A reviewer sent it
-- back to review because of a report; the YAML now says `approved` / `published`.
create function pg_temp.c1a_bundle_item(p_status text) returns jsonb language sql as $$
  select jsonb_set(pg_temp.c1a_bundle(), '{learning_items}',
    (select jsonb_agg(case when i ->> 'id' = current_setting('test.item') then i || jsonb_build_object('status', p_status) else i end)
     from jsonb_array_elements(pg_temp.c1a_bundle() -> 'learning_items') i));
$$;
select set_config('linguo.content_import', 'admin', true);
update public.learning_items set status = 'in_review' where id = current_setting('test.item')::uuid;
select set_config('linguo.content_import', '', true);
insert into public.content_reports (user_id, target_kind, target_id, reason, status) values
  ('11111111-1111-4111-8111-111111111111', 'learning_item', current_setting('test.item')::uuid, 'typo', 'open');
select content_private.import_bundle(pg_temp.c1a_bundle_item('approved'));
select is((select status from public.learning_items where id = current_setting('test.item')::uuid), 'in_review',
  'the import does not approve a row with an unresolved report');
update public.content_reports set status = 'fixed', resolved_at = now()
where target_id = current_setting('test.item')::uuid and status = 'open';
select content_private.import_bundle(pg_temp.c1a_bundle_item('approved'));
select is((select status from public.learning_items where id = current_setting('test.item')::uuid), 'approved',
  'once the report is resolved the import approves it');
insert into public.content_reports (user_id, target_kind, target_id, reason, status) values
  ('11111111-1111-4111-8111-111111111111', 'learning_item', current_setting('test.item')::uuid, 'audio', 'triaged');
select content_private.import_bundle(pg_temp.c1a_bundle_item('published'));
select is((select status from public.learning_items where id = current_setting('test.item')::uuid), 'approved',
  'the import does not publish a row with a triaged report');
update public.content_reports set status = 'rejected', resolved_at = now()
where target_id = current_setting('test.item')::uuid and status = 'triaged';
select content_private.import_bundle(pg_temp.c1a_bundle_item('published'));
select is((select status from public.learning_items where id = current_setting('test.item')::uuid), 'published',
  'once nothing is unresolved the import publishes it');
-- A reviewer deliberately sends the (now published) item back: admin_set_status stamps the reviewer on the row, and a
-- stale YAML status does not undo that decision.
set local role authenticated;
select public.c1a_as('33333333-3333-4333-8333-333333333333');
select is(public.admin_set_status('learning_item', current_setting('test.item')::uuid, 'in_review', 'Cần xem lại') ->> 'status', 'in_review',
  'a reviewer sends the item back to review');
reset role;
select is((select reviewed_by from public.learning_items where id = current_setting('test.item')::uuid),
  '33333333-3333-4333-8333-333333333333', 'every admin status change stamps the reviewer on the row');
select content_private.import_bundle(pg_temp.c1a_bundle_item('approved'));
select is((select status from public.learning_items where id = current_setting('test.item')::uuid), 'in_review',
  'a stale YAML approved does not re-approve a row an admin sent back');
select is(content_private.import_keep_stored('lesson', gen_random_uuid(), 'in_review', 'Claude (AI)', 'approved'), false,
  'a YAML-written, report-free row still advances one workflow step');

-- ===== Audit log: append-only, answer reads audited =====
select throws_ok($$update public.admin_audit_log set action = 'forged'$$, 'P0001', 'audit_log_append_only', 'audit rows cannot be updated');
select throws_ok($$delete from public.admin_audit_log$$, 'P0001', 'audit_log_append_only', 'audit rows cannot be deleted');
select throws_ok($$truncate public.admin_audit_log$$, 'P0001', 'audit_log_append_only', 'the audit log cannot be truncated');
-- The editor read hello's exercise answer key earlier: one row; reading it again within 10 minutes adds none.
set local role authenticated;
select public.c1a_as('22222222-2222-4222-8222-222222222222');
select ok((public.admin_get_content('exercise', current_setting('test.hello_ex')::uuid) #> '{private,answer_key}') is not null,
  'the editor reads the answer key again');
select public.admin_get_content('program', current_setting('test.program')::uuid);
reset role;
select is((select count(*)::integer from public.admin_audit_log where action = 'read_answers' and target_kind = 'exercise'
    and target_id = current_setting('test.hello_ex') and actor = '22222222-2222-4222-8222-222222222222'), 1,
  'reading answers is audited once per staff member and target within 10 minutes');
select is((select count(*)::integer from public.admin_audit_log where action = 'read_answers' and target_kind = 'program'), 0,
  'content without answers is not audited');
alter table public.admin_audit_log disable trigger admin_audit_log_append_only_row;
update public.admin_audit_log set created_at = created_at - interval '11 minutes' where action = 'read_answers';
alter table public.admin_audit_log enable trigger admin_audit_log_append_only_row;
set local role authenticated;
select public.c1a_as('22222222-2222-4222-8222-222222222222');
select public.admin_get_content('exercise', current_setting('test.hello_ex')::uuid);
reset role;
select is((select count(*)::integer from public.admin_audit_log where action = 'read_answers' and target_kind = 'exercise'
    and target_id = current_setting('test.hello_ex') and actor = '22222222-2222-4222-8222-222222222222'), 2,
  'a read after the 10-minute window is audited again');

-- ===== The last admin cannot be removed or demoted =====
set local role authenticated;
select public.c1a_as('44444444-4444-4444-8444-444444444444');
select throws_ok('select public.admin_grant_role(''44444444-4444-4444-8444-444444444444'', ''editor'')', 'P0001', 'last_admin_required',
  'the only admin cannot demote themselves');
select throws_ok('select public.admin_grant_role(''44444444-4444-4444-8444-444444444444'', null)', 'P0001', 'last_admin_required',
  'the only admin cannot remove their own role');
select is(public.admin_grant_role('11111111-1111-4111-8111-111111111111', 'admin') ->> 'role', 'admin', 'a second admin can be added');
select is(public.admin_grant_role('44444444-4444-4444-8444-444444444444', 'editor') ->> 'role', 'editor',
  'with two admins one may step down');
select public.c1a_as('11111111-1111-4111-8111-111111111111');
select throws_ok('select public.admin_grant_role(''11111111-1111-4111-8111-111111111111'', ''reviewer'')', 'P0001', 'last_admin_required',
  'the remaining admin cannot demote themselves either');
reset role;

select * from finish();
rollback;
