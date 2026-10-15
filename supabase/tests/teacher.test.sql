begin;
create extension if not exists pgtap with schema extensions;
select plan(137);

-- PRD P2 teacher tools (20261017000400_teacher_tools.sql): teacher status, classes, invites, joins, assignments,
-- aggregate-only rosters, RLS isolation between teachers and classes, leaving, archiving, export and deletion.

create function public.tc_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function public.tc_id(p_name text) returns uuid language sql immutable as $$
  select ('cc000000-0000-4000-8000-0000000000' || p_name)::uuid;
$$;
-- Error of a statement as 'SQLSTATE message', or 'ok'.
create function public.tc_err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;

-- t1, t2 teachers; a1 admin; l1, l2, l3 learners; n0 nobody special.
insert into auth.users (id, email, raw_user_meta_data) values
  (public.tc_id('01'), 'tc-t1@test.dev', '{}'), (public.tc_id('02'), 'tc-t2@test.dev', '{}'),
  (public.tc_id('0a'), 'tc-a1@test.dev', '{}'),
  (public.tc_id('11'), 'tc-l1@test.dev', '{}'), (public.tc_id('12'), 'tc-l2@test.dev', '{}'),
  (public.tc_id('13'), 'tc-l3@test.dev', '{}'), (public.tc_id('00'), 'tc-n0@test.dev', '{}');
update public.profiles set display_name = 'Cô Lan' where id = public.tc_id('01');
update public.profiles set display_name = 'Học viên Một' where id = public.tc_id('11');
insert into public.staff_roles (user_id, role) values (public.tc_id('0a'), 'admin');
select set_config('test.hello', (select id::text from public.lessons where key = 'en:lesson:hello'), true);
select set_config('test.ko_lesson', (select id::text from public.lessons where language_code = 'ko' and status = 'published' order by key limit 1), true);
select set_config('test.form', (select id::text from public.exam_forms where key = 'en:exam:cefr-a2-mock-1'), true);
select set_config('test.li', (select id::text from public.learning_items where language_code = 'en' and status = 'published' order by key limit 1), true);

-- ===== Schema and privileges =====
select is((select count(*)::integer from pg_class c where c.oid in ('public.teacher_profiles'::regclass, 'public.classes'::regclass,
    'public.class_members'::regclass, 'public.class_invites'::regclass, 'public.class_join_attempts'::regclass,
    'public.assignments'::regclass) and c.relrowsecurity), 6, 'RLS on every teacher table');
select ok(not has_table_privilege('authenticated', 'public.class_join_attempts', 'select'), 'join attempts are server-only');
select is((select count(*)::integer from unnest(array['public.teacher_profiles', 'public.classes', 'public.class_members',
    'public.class_invites', 'public.assignments']) t
    where has_table_privilege('authenticated', t, 'insert') or has_table_privilege('authenticated', t, 'update')
      or has_table_privilege('authenticated', t, 'delete')), 0, 'no direct writes for clients');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
      and (p.proname like 'teacher\_%' or p.proname like 'learner\_%' or p.proname in ('grant_teacher_role', 'is_teacher', 'class_access'))),
  array['class_access', 'grant_teacher_role', 'is_teacher', 'learner_join_class', 'learner_leave_class', 'learner_list_assignments',
    'learner_list_classes', 'teacher_archive_class', 'teacher_class_roster', 'teacher_create_assignment', 'teacher_create_class',
    'teacher_create_invite', 'teacher_delete_assignment', 'teacher_list_classes', 'teacher_remove_member', 'teacher_rename_class',
    'teacher_revoke_invite'], 'client RPC set (internal helpers are not executable)');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
      and (p.proname like 'teacher\_%' or p.proname like 'learner\_%' or p.proname in ('grant_teacher_role', 'is_teacher', 'class_access'))),
  'every client RPC is security definer with an empty search_path');
select is((select count(*)::integer from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
      and (p.proname like 'teacher\_%' or p.proname like 'learner\_%' or p.proname in ('grant_teacher_role', 'is_teacher', 'class_access'))),
  0, 'anon executes none of them');
select ok(public.account_optional_tables() @> array['teacher_profiles', 'class_members', 'class_join_attempts', 'personal_words', 'exam_attempts'],
  'teacher tables join the export, earlier tables stay');

-- ===== Teacher status =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.teacher_list_classes()', '42501', 'not_authenticated', 'teacher RPCs need a user');
select throws_ok('select public.learner_join_class(''ABCDEFGH'')', '42501', 'not_authenticated', 'learner RPCs need a user');
select is(public.is_teacher(), false, 'is_teacher() is false without a user');

select public.tc_as(public.tc_id('00'));
select throws_ok(format('select public.grant_teacher_role(%L, true)', public.tc_id('00')), 'P0001', 'staff_forbidden',
  'only an admin grants teacher status');
select throws_ok('select public.teacher_create_class(''Lớp'', ''en'')', 'P0001', 'teacher_forbidden', 'a learner cannot create a class');
select throws_ok('select public.teacher_list_classes()', 'P0001', 'teacher_forbidden', 'a learner cannot list teacher classes');

select public.tc_as(public.tc_id('0a'));
select is(public.grant_teacher_role(public.tc_id('01'), true),
  jsonb_build_object('user_id', public.tc_id('01'), 'is_teacher', true), 'admin grants t1');
select is(public.grant_teacher_role(public.tc_id('02'), true) ->> 'is_teacher', 'true', 'admin grants t2');
select is(public.grant_teacher_role(public.tc_id('02'), true) ->> 'is_teacher', 'true', 'granting twice is harmless');
select throws_ok('select public.grant_teacher_role(''cc000000-0000-4000-8000-0000000000ff'', true)', 'P0001', 'user_not_found',
  'unknown user');
reset role;
select is((select count(*)::integer from public.admin_audit_log where action = 'grant_teacher' and target_id = public.tc_id('01')::text), 1,
  'the grant is audited');
set local role authenticated;

select public.tc_as(public.tc_id('01'));
select is(public.is_teacher(), true, 't1 is a teacher');
select is((select count(*)::integer from public.teacher_profiles), 1, 't1 reads only their own teacher row');
select public.tc_as(public.tc_id('11'));
select is(public.is_teacher(), false, 'l1 is not');

-- ===== Classes =====
select public.tc_as(public.tc_id('01'));
select is(public.teacher_list_classes(), '[]'::jsonb, 'no class yet');
select set_config('test.ca', public.teacher_create_class('  Lớp   Anh A ', 'en') ->> 'id', true);
select is((select c - 'id' - 'created_at' from (select public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'class' as c) x),
  jsonb_build_object('name', 'Lớp Anh A', 'language_code', 'en', 'archived_at', null, 'member_count', 0, 'assignment_count', 0,
    'invites', '[]'::jsonb), 'class created with a cleaned name');
select set_config('test.cj', public.teacher_create_class('Lớp Nhật', 'ja') ->> 'id', true);
select is((select language_code from public.classes where id = current_setting('test.cj')::uuid), 'ja', 'ja classes are allowed');
select throws_ok('select public.teacher_create_class(''lớp anh a'', ''en'')', 'P0001', 'name_taken', 'names are unique per teacher');
select throws_ok('select public.teacher_create_class(''Lớp Pháp'', ''fr'')', 'P0001', 'invalid_language', 'unknown language');
select throws_ok('select public.teacher_create_class(''   '', ''en'')', 'P0001', 'invalid_name', 'blank name');
select throws_ok(format('select public.teacher_create_class(%L, ''en'')', repeat('x', 61)), 'P0001', 'invalid_name', 'name too long');
select is(public.teacher_rename_class(current_setting('test.cj')::uuid, 'Lớp Nhật N5') ->> 'name', 'Lớp Nhật N5', 'rename');
select throws_ok(format('select public.teacher_rename_class(%L, ''Lớp Anh A'')', current_setting('test.cj')), 'P0001', 'name_taken',
  'rename into a taken name');
select is(jsonb_array_length(public.teacher_list_classes()), 2, 't1 lists two classes');

-- t2 has a class of their own and cannot reach t1's.
select public.tc_as(public.tc_id('02'));
select set_config('test.cb', public.teacher_create_class('Lớp Anh A', 'en') ->> 'id', true);
select ok(current_setting('test.cb') <> '', 'another teacher may reuse the name');
select is(jsonb_array_length(public.teacher_list_classes()), 1, 't2 lists only their class');
select is((select count(*)::integer from public.classes), 1, 't2 reads only their class row');
select throws_ok(format('select public.teacher_class_roster(%L)', current_setting('test.ca')), 'P0001', 'class_not_found',
  't2 cannot read t1''s roster');
select throws_ok(format('select public.teacher_rename_class(%L, ''x'')', current_setting('test.ca')), 'P0001', 'class_not_found',
  't2 cannot rename t1''s class');
select throws_ok(format('select public.teacher_archive_class(%L, true)', current_setting('test.ca')), 'P0001', 'class_not_found',
  't2 cannot archive t1''s class');
select throws_ok(format('select public.teacher_create_invite(%L)', current_setting('test.ca')), 'P0001', 'class_not_found',
  't2 cannot invite into t1''s class');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', null, null, null, 5)', current_setting('test.ca')),
  'P0001', 'class_not_found', 't2 cannot assign work in t1''s class');

-- ===== Invites =====
select public.tc_as(public.tc_id('01'));
select set_config('test.code', public.teacher_create_invite(current_setting('test.ca')::uuid) ->> 'code', true);
select ok(current_setting('test.code') ~ '^[A-HJ-NP-Z2-9]{8}$', 'an 8-character code without ambiguous characters');
select ok((select expires_at between now() + interval '167 hours' and now() + interval '169 hours' from public.class_invites
  where code = current_setting('test.code')), 'default expiry is 7 days');
select set_config('test.code1', public.teacher_create_invite(current_setting('test.ca')::uuid, 24, 1) ->> 'code', true);
select throws_ok(format('select public.teacher_create_invite(%L, 0)', current_setting('test.ca')), 'P0001', 'invalid_expiry', 'expiry >= 1 hour');
select throws_ok(format('select public.teacher_create_invite(%L, 721)', current_setting('test.ca')), 'P0001', 'invalid_expiry', 'expiry <= 30 days');
select throws_ok(format('select public.teacher_create_invite(%L, 24, 0)', current_setting('test.ca')), 'P0001', 'invalid_max_uses', 'max uses >= 1');
select is(jsonb_array_length(public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'class' -> 'invites'), 2,
  'the class lists its active invites');
select set_config('test.codej', public.teacher_create_invite(current_setting('test.cj')::uuid) ->> 'code', true);

select public.tc_as(public.tc_id('02'));
select set_config('test.codeb', public.teacher_create_invite(current_setting('test.cb')::uuid) ->> 'code', true);
select is((select count(*)::integer from public.class_invites), 1, 't2 reads only their invites');
select throws_ok(format('select public.teacher_revoke_invite(%L)', current_setting('test.code')), 'P0001', 'invite_not_found',
  't2 cannot revoke t1''s invite');

-- ===== Joining =====
select public.tc_as(public.tc_id('11'));
select is((select count(*)::integer from public.classes), 0, 'a learner sees no class before joining');
select is((select r ->> 'status' from (select public.learner_join_class(lower(substr(current_setting('test.code'), 1, 4)) || '-' ||
    lower(substr(current_setting('test.code'), 5))) as r) x), 'joined', 'l1 joins with a lower-case, dashed code');
select is((select (r -> 'class') - 'joined_at' from (select public.learner_join_class(current_setting('test.code')) as r) x),
  jsonb_build_object('id', current_setting('test.ca')::uuid, 'name', 'Lớp Anh A', 'language_code', 'en', 'teacher_name', 'Cô Lan',
    'assignment_count', 0, 'pending_count', 0), 'joining again returns the class');
select is((select r ->> 'status' from (select public.learner_join_class(current_setting('test.code')) as r) x), 'already_member',
  'a second join is already_member');
select is((select count(*)::integer from public.classes), 1, 'l1 now reads the class row');
select is((select count(*)::integer from public.class_invites), 0, 'learners never read invites');
select is(jsonb_array_length(public.learner_list_classes()), 1, 'l1 lists one class');
select is(public.learner_join_class(current_setting('test.codej')) ->> 'status', 'joined', 'l1 also joins the ja class');

select public.tc_as(public.tc_id('12'));
select is(public.learner_join_class(current_setting('test.code1')) ->> 'status', 'joined', 'l2 uses the single-use code');
select is((select count(*)::integer from public.class_members), 1, 'l2 reads only their own membership row');

select public.tc_as(public.tc_id('13'));
select is(public.learner_join_class(current_setting('test.code1')), '{"status": "invalid_code"}'::jsonb, 'a used-up code is invalid');
select is(public.learner_join_class('ZZZZ'), '{"status": "invalid_code"}'::jsonb, 'a malformed code is invalid');
select is(public.learner_join_class('ZZZZZZZZ'), '{"status": "invalid_code"}'::jsonb, 'an unknown code is invalid');
select is(public.learner_join_class(null), '{"status": "invalid_code"}'::jsonb, 'a null code is invalid');
select is((select count(*)::integer from public.assignments), 0, 'a non-member reads no assignment');
select throws_ok(format('select public.learner_list_assignments(%L)', current_setting('test.ca')), 'P0001', 'not_member',
  'a non-member cannot list a class''s assignments');
reset role;
select is((select count(*)::integer from public.class_join_attempts where user_id = public.tc_id('13') and not succeeded), 4,
  'failed attempts are recorded');
select is((select uses from public.class_invites where code = current_setting('test.code')), 1, 'already_member does not use the code');
select is((select uses from public.class_invites where code = current_setting('test.code1')), 1, 'the single-use code was used once');
-- Expired and revoked codes.
update public.class_invites set expires_at = now() - interval '1 minute' where code = current_setting('test.codeb');
set local role authenticated;
select public.tc_as(public.tc_id('13'));
select is(public.learner_join_class(current_setting('test.codeb')) ->> 'status', 'invalid_code', 'an expired code is invalid');
select public.tc_as(public.tc_id('01'));
select set_config('test.code2', public.teacher_create_invite(current_setting('test.ca')::uuid) ->> 'code', true);
select is(public.teacher_revoke_invite(lower(current_setting('test.code2'))), '{"revoked": true}'::jsonb, 't1 revokes an invite');
select public.tc_as(public.tc_id('13'));
select is(public.learner_join_class(current_setting('test.code2')) ->> 'status', 'invalid_code', 'a revoked code is invalid');
-- Rate limit: 6 attempts so far; 4 more are allowed, the 11th is refused.
select is(public.learner_join_class('YYYYYYYY') ->> 'status', 'invalid_code', 'attempt 7');
select is(public.learner_join_class('YYYYYYYY') ->> 'status', 'invalid_code', 'attempt 8');
select is(public.learner_join_class('YYYYYYYY') ->> 'status', 'invalid_code', 'attempt 9');
select is(public.learner_join_class('YYYYYYYY') ->> 'status', 'invalid_code', 'attempt 10');
select throws_ok(format('select public.learner_join_class(%L)', current_setting('test.code')), 'P0001', 'rate_limited',
  'the 11th attempt in an hour is rate limited, even with a valid code');
-- A teacher cannot join their own class.
select public.tc_as(public.tc_id('01'));
select throws_ok(format('select public.learner_join_class(%L)', current_setting('test.code')), 'P0001', 'own_class', 'own class');
select is((select count(*)::integer from public.class_members where class_id = current_setting('test.ca')::uuid), 2,
  't1 reads both membership rows of the class');

-- ===== Assignments =====
select is(public.teacher_create_assignment(current_setting('test.ca')::uuid, 'lesson', current_setting('test.hello')::uuid,
    now() + interval '3 days', '  Làm   trước thứ Sáu ') - 'id' - 'created_at' - 'due_at',
  jsonb_build_object('class_id', current_setting('test.ca')::uuid, 'kind', 'lesson', 'ref_id', current_setting('test.hello')::uuid,
    'title', (select title ->> 'vi' from public.lessons where key = 'en:lesson:hello'), 'target_count', null,
    'note', 'Làm trước thứ Sáu', 'completed_count', 0, 'member_count', 2), 'lesson assignment');
select set_config('test.as_lesson', (select id::text from public.assignments where kind = 'lesson'), true);
select set_config('test.as_exam', public.teacher_create_assignment(current_setting('test.ca')::uuid, 'exam',
  current_setting('test.form')::uuid) ->> 'id', true);
select set_config('test.as_review', public.teacher_create_assignment(current_setting('test.ca')::uuid, 'review', null, null, null, 2) ->> 'id', true);
select is((select title from (select public.teacher_create_assignment(current_setting('test.ca')::uuid, 'review', null, null, null, 1) ->> 'title' as title) x), null,
  'a review assignment has no title');
select is(public.teacher_delete_assignment((select id from public.assignments where kind = 'review' and target_count = 1)),
  '{"deleted": true}'::jsonb, 't1 deletes an assignment');
select throws_ok(format('select public.teacher_create_assignment(%L, ''vocab'', %L)', current_setting('test.ca'), current_setting('test.hello')),
  'P0001', 'invalid_kind', 'unknown kind');
select throws_ok(format('select public.teacher_create_assignment(%L, ''lesson'')', current_setting('test.ca')), 'P0001', 'invalid_ref', 'lesson needs a ref');
select throws_ok(format('select public.teacher_create_assignment(%L, ''lesson'', %L)', current_setting('test.ca'), current_setting('test.ko_lesson')),
  'P0001', 'invalid_ref', 'a lesson of another language');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L)', current_setting('test.ca'), current_setting('test.hello')),
  'P0001', 'invalid_ref', 'a lesson id is not an exam form');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', %L, null, null, 5)', current_setting('test.ca'), current_setting('test.hello')),
  'P0001', 'invalid_ref', 'review takes no ref');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'')', current_setting('test.ca')), 'P0001', 'invalid_target', 'review needs a target');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', null, null, null, 201)', current_setting('test.ca')),
  'P0001', 'invalid_target', 'target <= 200');
select throws_ok(format('select public.teacher_create_assignment(%L, ''lesson'', %L, null, null, 3)', current_setting('test.ca'), current_setting('test.hello')),
  'P0001', 'invalid_target', 'lesson takes no target');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', null, now() - interval ''1 hour'', null, 5)', current_setting('test.ca')),
  'P0001', 'invalid_due', 'due date in the past');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', null, null, %L, 5)', current_setting('test.ca'), repeat('x', 501)),
  'P0001', 'note_too_long', 'note too long');
select public.tc_as(public.tc_id('02'));
select throws_ok(format('select public.teacher_delete_assignment(%L)', current_setting('test.as_lesson')), 'P0001', 'assignment_not_found',
  't2 cannot delete t1''s assignment');
select is((select count(*)::integer from public.assignments), 0, 't2 reads none of t1''s assignments');

-- ===== Learner activity (written as the server would) =====
select public.tc_as(public.tc_id('11'));
select set_config('test.p1', (public.create_learning_path('en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select is(jsonb_array_length(public.learner_list_assignments()), 3, 'l1 sees the three assignments');
select is((select array_agg(a ->> 'state' order by a ->> 'kind') from jsonb_array_elements(public.learner_list_assignments()) a),
  array['pending', 'pending', 'pending'], 'all pending');
reset role;
-- A run completed before the assignment does not count; one completed after it does.
insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue, status, started_at, completed_at, summary_json)
values (public.tc_id('11'), current_setting('test.p1')::uuid, current_setting('test.hello')::uuid, 1, '{}', 'completed',
  now() - interval '2 hours', now() - interval '1 hour', '{}');
select is((select public.teacher_assignment_done_at(a, 'en', public.tc_id('11')) from public.assignments a
  where a.id = current_setting('test.as_lesson')::uuid), null, 'work done before the assignment does not complete it');
insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue, status, started_at, completed_at, summary_json)
values (public.tc_id('11'), current_setting('test.p1')::uuid, current_setting('test.hello')::uuid, 1, '{}', 'completed', now(), now(), '{}');
insert into public.exam_attempts (user_id, learning_path_id, form_id, content_version, mode, section, question_ids, status, submitted_at, result)
values (public.tc_id('11'), current_setting('test.p1')::uuid, current_setting('test.form')::uuid, 1, 'section', 'reading',
  array[gen_random_uuid()], 'submitted', now(), '{}');
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, due_at)
values (public.tc_id('11'), current_setting('test.p1')::uuid, current_setting('test.li')::uuid, 'recognize', 'review', now() - interval '1 day');
insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash)
select c.user_id, c.learning_path_id, c.id, 'grade', r, r, current_date, gen_random_uuid(), 'h'
from public.review_cards c, unnest(array[3, 1]) r where c.user_id = public.tc_id('11');
insert into public.activity_days (user_id, learning_path_id, local_day, active_ms, lessons)
values (public.tc_id('11'), current_setting('test.p1')::uuid, public.learning_user_today(public.tc_id('11')), 600000, 1)
on conflict (user_id, learning_path_id, local_day) do update set active_ms = excluded.active_ms, lessons = excluded.lessons;

set local role authenticated;
select public.tc_as(public.tc_id('11'));
select is((select array_agg(a ->> 'state' order by a ->> 'kind') from jsonb_array_elements(public.learner_list_assignments()) a),
  array['done', 'done', 'done'], 'lesson, exam and review assignments are done');
select is((select (a ->> 'progress_count')::integer from jsonb_array_elements(public.learner_list_assignments()) a where a ->> 'kind' = 'review'),
  2, 'review progress is capped at the target');
select is((select x ->> 'pending_count' from jsonb_array_elements(public.learner_list_classes()) x where x ->> 'id' = current_setting('test.ca')), '0',
  'no pending work in the class');
select is(jsonb_array_length(public.learner_list_assignments(current_setting('test.cj')::uuid)), 0, 'filter by class');
select public.tc_as(public.tc_id('12'));
select is((select array_agg(a ->> 'state' order by a ->> 'kind') from jsonb_array_elements(public.learner_list_assignments()) a),
  array['pending', 'pending', 'pending'], 'l2 has done nothing');
reset role;
update public.assignments set due_at = now() - interval '1 day' where id = current_setting('test.as_exam')::uuid;
set local role authenticated;
select is((select a ->> 'state' from jsonb_array_elements(public.learner_list_assignments()) a where a ->> 'kind' = 'exam'), 'overdue',
  'an open assignment past its due date is overdue');

-- ===== Roster: aggregates only =====
select public.tc_as(public.tc_id('01'));
select set_config('test.roster', public.teacher_class_roster(current_setting('test.ca')::uuid)::text, true);
select is(jsonb_array_length(current_setting('test.roster')::jsonb -> 'members'), 2, 'two members');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.roster')::jsonb -> 'members' -> 0) k),
  array['assignments_done', 'assignments_total', 'display_name', 'has_path', 'joined_at', 'last_active_day', 'lessons_completed',
    'lessons_completed_7d', 'minutes_30d', 'minutes_7d', 'review_accuracy_30d', 'reviews_30d', 'reviews_due', 'streak_best',
    'streak_current', 'user_id'], 'a member carries identity and aggregates only');
select is((select m - 'joined_at' - 'last_active_day' - 'streak_best' from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'members') m
    where m ->> 'user_id' = public.tc_id('11')::text),
  jsonb_build_object('user_id', public.tc_id('11'), 'display_name', 'Học viên Một', 'has_path', true, 'streak_current', 1,
    'minutes_7d', 10, 'minutes_30d', 10, 'lessons_completed', 1, 'lessons_completed_7d', 1, 'reviews_due', 1, 'reviews_30d', 2,
    'review_accuracy_30d', null, 'assignments_done', 3, 'assignments_total', 3), 'l1''s aggregates');
select is((select m - 'joined_at' - 'user_id' from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'members') m
    where m ->> 'user_id' = public.tc_id('12')::text),
  jsonb_build_object('display_name', null, 'has_path', false, 'streak_current', 0, 'streak_best', 0, 'minutes_7d', 0, 'minutes_30d', 0,
    'last_active_day', null, 'lessons_completed', 0, 'lessons_completed_7d', 0, 'reviews_due', 0, 'reviews_30d', 0,
    'review_accuracy_30d', null, 'assignments_done', 0, 'assignments_total', 3), 'l2 without a path has zeros');
select is((select array_agg((a ->> 'completed_count') || '/' || (a ->> 'member_count') order by a ->> 'kind')
    from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'assignments') a),
  array['1/2', '1/2', '1/2'], 'completion counts per assignment');
-- Teachers still cannot read any learner table directly.
select is((select count(*)::integer from public.lesson_runs) + (select count(*)::integer from public.review_logs)
  + (select count(*)::integer from public.exam_attempts) + (select count(*)::integer from public.activity_days)
  + (select count(*)::integer from public.attempts), 0, 't1 reads none of l1''s raw learning data');
select is((select count(*)::integer from public.profiles where id = public.tc_id('11')), 0, 't1 cannot read l1''s profile row');

-- ===== Accuracy over 10 reviews =====
reset role;
insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash)
select c.user_id, c.learning_path_id, c.id, 'grade', r, r, current_date, gen_random_uuid(), 'h'
from public.review_cards c, unnest(array[3, 3, 3, 3, 3, 3, 4, 1]) r where c.user_id = public.tc_id('11');
set local role authenticated;
select public.tc_as(public.tc_id('01'));
select is((select (m ->> 'review_accuracy_30d')::numeric from jsonb_array_elements(public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'members') m
    where m ->> 'user_id' = public.tc_id('11')::text), 0.8, '8 of 10 reviews not "again"');

-- ===== Leaving and removal =====
select public.tc_as(public.tc_id('12'));
select is(public.learner_leave_class(current_setting('test.ca')::uuid), '{"left": true}'::jsonb, 'l2 leaves');
select throws_ok(format('select public.learner_leave_class(%L)', current_setting('test.ca')), 'P0001', 'not_member', 'leaving twice');
select is(public.learner_list_classes(), '[]'::jsonb, 'l2 has no class');
select is((select count(*)::integer from public.classes) + (select count(*)::integer from public.assignments), 0,
  'l2 no longer reads the class or its assignments');
select public.tc_as(public.tc_id('01'));
select is((select array_agg(m ->> 'user_id') from jsonb_array_elements(public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'members') m),
  array[public.tc_id('11')::text], 'l2 left the roster at once');
select throws_ok(format('select public.teacher_remove_member(%L, %L)', current_setting('test.ca'), public.tc_id('12')), 'P0001',
  'member_not_found', 'removing a non-member');
select is(public.teacher_remove_member(current_setting('test.cj')::uuid, public.tc_id('11')), '{"removed": true}'::jsonb,
  't1 removes l1 from the ja class');
select public.tc_as(public.tc_id('02'));
select throws_ok(format('select public.teacher_remove_member(%L, %L)', current_setting('test.ca'), public.tc_id('11')), 'P0001',
  'class_not_found', 't2 cannot remove t1''s members');

-- ===== Archive =====
select public.tc_as(public.tc_id('01'));
select ok((public.teacher_archive_class(current_setting('test.ca')::uuid, true) ->> 'archived_at') is not null, 'archive');
select throws_ok(format('select public.teacher_create_invite(%L)', current_setting('test.ca')), 'P0001', 'class_archived', 'no invite when archived');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', null, null, null, 5)', current_setting('test.ca')),
  'P0001', 'class_archived', 'no assignment when archived');
select is(jsonb_array_length(public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'members'), 1, 'the roster stays readable');
select public.tc_as(public.tc_id('11'));
select is(public.learner_list_classes(), '[]'::jsonb, 'archived classes are hidden from learners');
select is(public.learner_list_assignments(), '[]'::jsonb, 'and so are their assignments');
select public.tc_as(public.tc_id('01'));
select ok((public.teacher_archive_class(current_setting('test.ca')::uuid, false) ->> 'archived_at') is null, 'restore');
select public.tc_as(public.tc_id('11'));
select is(jsonb_array_length(public.learner_list_classes()), 1, 'visible again');

-- ===== Invite limit =====
select public.tc_as(public.tc_id('01'));
select public.teacher_create_invite(current_setting('test.ca')::uuid) from generate_series(1, 10 - jsonb_array_length(
  public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'class' -> 'invites'));
select throws_ok(format('select public.teacher_create_invite(%L)', current_setting('test.ca')), 'P0001', 'invite_limit', '10 active invites');

-- ===== Export =====
select public.tc_as(public.tc_id('11'));
select is((select jsonb_array_length(x -> 'class_members') from (select public.export_my_data() as x) e), 1, 'l1''s export has the membership');
select public.tc_as(public.tc_id('01'));
select set_config('test.export', public.export_my_data()::text, true);
select is(jsonb_array_length(current_setting('test.export')::jsonb -> 'teacher_classes'), 2, 't1''s export has their classes');
select is(jsonb_array_length(current_setting('test.export')::jsonb -> 'teacher_profiles'), 1, 'and the teacher row');
select ok(position(public.tc_id('11')::text in current_setting('test.export')) = 0, 'but never a member''s id');
select is((select jsonb_array_length(c -> 'assignments') from jsonb_array_elements(current_setting('test.export')::jsonb -> 'teacher_classes') c
    where c ->> 'id' = current_setting('test.ca')), 3, 'with the class assignments');

-- ===== Revoking teacher status =====
select public.tc_as(public.tc_id('0a'));
select is(public.grant_teacher_role(public.tc_id('02'), false) ->> 'is_teacher', 'false', 'admin revokes t2');
select public.tc_as(public.tc_id('02'));
select throws_ok('select public.teacher_list_classes()', 'P0001', 'teacher_forbidden', 'a former teacher has no teacher RPCs');

-- ===== Account deletion =====
select public.tc_as(public.tc_id('11'));
select lives_ok('select public.delete_my_account(''XOA TAI KHOAN'')', 'l1 deletes their account');
reset role;
select is((select count(*)::integer from public.class_members where user_id = public.tc_id('11')), 0, 'memberships are deleted');
set local role authenticated;
select public.tc_as(public.tc_id('01'));
select is(jsonb_array_length(public.teacher_class_roster(current_setting('test.ca')::uuid) -> 'members'), 0, 'the roster is empty');
select lives_ok('select public.delete_my_account(''XOA TAI KHOAN'')', 't1 deletes their account');
reset role;
select is((select count(*)::integer from public.classes where teacher_id = public.tc_id('01'))
  + (select count(*)::integer from public.assignments where class_id = current_setting('test.ca')::uuid)
  + (select count(*)::integer from public.class_invites where class_id = current_setting('test.ca')::uuid)
  + (select count(*)::integer from public.teacher_profiles where user_id = public.tc_id('01')), 0,
  'classes, invites, assignments and teacher row go with the teacher');

select * from finish();
rollback;
