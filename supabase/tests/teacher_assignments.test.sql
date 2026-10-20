begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- 20261021000100_teacher_assignments.sql: exam mode on assignments, editing and closing, the completion rules of
-- teacher_completions, 'closed' for learners, and classes in every language (en, ko, ja, de).

create function public.ta_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function public.ta_id(p_name text) returns uuid language sql immutable as $$
  select ('ee000000-0000-4000-8000-0000000000' || p_name)::uuid;
$$;
create function public.ta_err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;

-- t1, t2 teachers; l1, l2 learners.
insert into auth.users (id, email, raw_user_meta_data) values
  (public.ta_id('01'), 'ta-t1@test.dev', '{}'), (public.ta_id('02'), 'ta-t2@test.dev', '{}'),
  (public.ta_id('11'), 'ta-l1@test.dev', '{}'), (public.ta_id('12'), 'ta-l2@test.dev', '{}');
insert into public.teacher_profiles (user_id) values (public.ta_id('01')), (public.ta_id('02'));
select set_config('test.hello', (select id::text from public.lessons where key = 'en:lesson:hello'), true);
select set_config('test.form', (select id::text from public.exam_forms where key = 'en:exam:cefr-a2-mock-1'), true);
select set_config('test.jform', (select id::text from public.exam_forms where key = 'ja:exam:jlpt-n5-mock-1'), true);
select set_config('test.q1', (select id::text from public.exam_questions where form_id = current_setting('test.form')::uuid
  and status = 'published' order by seq limit 1), true);

-- A German lesson (the local content has none): program, unit and lesson as the importer would write them.
insert into public.content_sources (id, key, title, author_or_org, license, status, is_demo, content_hash)
values (md5('src:ta')::uuid, 'src:ta', 'TA test source', 'Linguo', 'own', 'published', true, md5('ta') || md5('ta#'));
insert into public.programs (id, key, source_id, language_code, title, description, kind, goal_types, level_from, level_to,
  order_index, status, is_demo, content_hash)
values (md5('de:program:ta')::uuid, 'de:program:ta', md5('src:ta')::uuid, 'de', '{"vi": "Đức"}', '{"vi": "Mô tả"}', 'core',
  '{}', 'pre_a1', 'a1', 0, 'published', true, md5('p') || md5('p#'));
insert into public.units (id, key, source_id, program_id, order_index, title, status, is_demo, content_hash)
values (md5('de:unit:ta')::uuid, 'de:unit:ta', md5('src:ta')::uuid, md5('de:program:ta')::uuid, 1, '{"vi": "Bài 1"}',
  'published', true, md5('u') || md5('u#'));
insert into public.lessons (id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
  estimated_minutes, skills, status, is_demo, content_hash)
values (md5('de:lesson:ta')::uuid, 'de:lesson:ta', md5('src:ta')::uuid, md5('de:unit:ta')::uuid, 'de', 'pre_a1', 1,
  '{"vi": "Hallo!"}', '[{"vi": "Hallo"}]', '[]', 5, array['reading'], 'published', true, md5('l') || md5('l#'));

-- ===== Classes in every language, joined by a learner =====
set local role authenticated;
select public.ta_as(public.ta_id('01'));
select set_config('test.ca', public.teacher_create_class('Anh A', 'en') ->> 'id', true);
select set_config('test.cj', public.teacher_create_class('Nhật N5', 'ja') ->> 'id', true);
select set_config('test.cd', public.teacher_create_class('Đức A1', 'de') ->> 'id', true);
select set_config('test.ck', public.teacher_create_class('Hàn 1', 'ko') ->> 'id', true);
select is((select array_agg(c ->> 'language_code' order by c ->> 'language_code') from jsonb_array_elements(public.teacher_list_classes()) c),
  array['de', 'en', 'ja', 'ko'], 'a teacher can run en, ko, ja and de classes');
select set_config('test.inv_a', public.teacher_create_invite(current_setting('test.ca')::uuid) ->> 'code', true);
select set_config('test.inv_j', public.teacher_create_invite(current_setting('test.cj')::uuid) ->> 'code', true);
select set_config('test.inv_d', public.teacher_create_invite(current_setting('test.cd')::uuid) ->> 'code', true);
select public.ta_as(public.ta_id('11'));
select public.learner_join_class(current_setting('test.inv_a'));
select public.learner_join_class(current_setting('test.inv_j'));
select public.learner_join_class(current_setting('test.inv_d'));
select public.ta_as(public.ta_id('12'));
select public.learner_join_class(current_setting('test.inv_a'));

-- ===== German and Japanese assignments =====
select public.ta_as(public.ta_id('01'));
select throws_ok(format('select public.teacher_create_assignment(%L, ''lesson'', %L)', current_setting('test.cd'), current_setting('test.hello')),
  'P0001', 'invalid_ref', 'an English lesson is refused in a German class');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L)', current_setting('test.cd'), current_setting('test.jform')),
  'P0001', 'invalid_ref', 'a Japanese exam form is refused in a German class');
select is(public.teacher_create_assignment(current_setting('test.cd')::uuid, 'lesson', md5('de:lesson:ta')::uuid) ->> 'title', 'Hallo!',
  'a German lesson goes to the German class');
select is(public.teacher_create_assignment(current_setting('test.cj')::uuid, 'exam', current_setting('test.jform')::uuid,
    null, null, null, 'full') ->> 'exam_mode', 'full', 'a JLPT form can be assigned as a full mock');
select is(public.teacher_create_assignment(current_setting('test.cj')::uuid, 'exam', current_setting('test.jform')::uuid,
    null, null, null, 'section', 'listening') ->> 'exam_section', 'listening', 'or as its listening section');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L, null, null, null, ''section'', ''writing'')',
    current_setting('test.cj'), current_setting('test.jform')), 'P0001', 'invalid_exam_mode',
  'N5 has no writing section, so it cannot be assigned');
select public.ta_as(public.ta_id('11'));
select is((select array_agg(a ->> 'state' order by a ->> 'title') from jsonb_array_elements(public.learner_list_assignments(current_setting('test.cd')::uuid)) a),
  array['pending'], 'the learner sees the German assignment as pending');
select is((select a ->> 'exam_mode' from jsonb_array_elements(public.learner_list_assignments(current_setting('test.cj')::uuid)) a
    where a ->> 'exam_section' = 'listening'), 'section', 'and the mode of a Japanese exam assignment');

-- ===== Exam mode validation =====
select public.ta_as(public.ta_id('01'));
select is((public.teacher_create_assignment(current_setting('test.ca')::uuid, 'exam', current_setting('test.form')::uuid, null, null, null, 'full')
    - 'id' - 'created_at' - 'class_id' - 'ref_id' - 'title'),
  jsonb_build_object('kind', 'exam', 'target_count', null, 'exam_mode', 'full', 'exam_section', null, 'due_at', null,
    'closed_at', null, 'note', null, 'completed_count', 0, 'member_count', 2), 'exam assignment with mode full');
select set_config('test.as_full', (select id::text from public.assignments where class_id = current_setting('test.ca')::uuid
  and exam_mode = 'full'), true);
select set_config('test.as_sec', public.teacher_create_assignment(current_setting('test.ca')::uuid, 'exam', current_setting('test.form')::uuid,
  null, null, null, 'section', 'reading') ->> 'id', true);
select set_config('test.as_any', public.teacher_create_assignment(current_setting('test.ca')::uuid, 'exam', current_setting('test.form')::uuid) ->> 'id', true);
select is((select array_agg(coalesce(exam_mode, '-') || '/' || coalesce(exam_section, '-') order by coalesce(exam_mode, '-'))
    from public.assignments where class_id = current_setting('test.ca')::uuid),
  array['-/-', 'full/-', 'section/reading'], 'modes are stored');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L, null, null, null, ''section'')',
    current_setting('test.ca'), current_setting('test.form')), 'P0001', 'invalid_exam_mode', 'a section mode needs its section');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L, null, null, null, ''full'', ''reading'')',
    current_setting('test.ca'), current_setting('test.form')), 'P0001', 'invalid_exam_mode', 'a full mock takes no section');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L, null, null, null, ''question_type'')',
    current_setting('test.ca'), current_setting('test.form')), 'P0001', 'invalid_exam_mode', 'question-type drills are not assignable');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L, null, null, null, ''section'', ''speaking'')',
    current_setting('test.ca'), current_setting('test.form')), 'P0001', 'invalid_exam_mode', 'unknown section');
select throws_ok(format('select public.teacher_create_assignment(%L, ''exam'', %L, null, null, null, null, ''reading'')',
    current_setting('test.ca'), current_setting('test.form')), 'P0001', 'invalid_exam_mode', 'a section without a mode');
select throws_ok(format('select public.teacher_create_assignment(%L, ''lesson'', %L, null, null, null, ''full'')',
    current_setting('test.ca'), current_setting('test.hello')), 'P0001', 'invalid_exam_mode', 'a lesson takes no exam mode');
select throws_ok(format('select public.teacher_create_assignment(%L, ''review'', null, null, null, 5, ''full'')',
    current_setting('test.ca')), 'P0001', 'invalid_exam_mode', 'a review takes no exam mode');

-- ===== Update, close, reopen =====
select set_config('test.as_l', public.teacher_create_assignment(current_setting('test.ca')::uuid, 'lesson', current_setting('test.hello')::uuid,
  now() + interval '2 days', 'Ghi chú đầu') ->> 'id', true);
select is((public.teacher_update_assignment(current_setting('test.as_l')::uuid, '  Ghi chú   mới ', false) - 'id' - 'created_at' - 'class_id'
    - 'ref_id' - 'title' - 'due_at'),
  jsonb_build_object('kind', 'lesson', 'target_count', null, 'exam_mode', null, 'exam_section', null, 'closed_at', null,
    'note', 'Ghi chú mới', 'completed_count', 0, 'member_count', 2), 'the note is replaced and cleaned');
select ok((select due_at is not null from public.assignments where id = current_setting('test.as_l')::uuid),
  'the due date is kept when p_set_due is false');
select ok((public.teacher_update_assignment(current_setting('test.as_l')::uuid, 'x', false, now() + interval '5 days', true) ->> 'due_at')::timestamptz
  > now() + interval '4 days', 'a new due date is set with p_set_due');
select throws_ok(format('select public.teacher_update_assignment(%L, ''x'', false, now() - interval ''1 hour'', true)', current_setting('test.as_l')),
  'P0001', 'invalid_due', 'a due date in the past is refused');
select throws_ok(format('select public.teacher_update_assignment(%L, ''x'', false, now() + interval ''400 days'', true)', current_setting('test.as_l')),
  'P0001', 'invalid_due', 'and so is one beyond 366 days');
select is(public.teacher_update_assignment(current_setting('test.as_l')::uuid, null, false, null, true) -> 'due_at', 'null'::jsonb,
  'p_set_due with no date clears the due date');
select is((select note from public.assignments where id = current_setting('test.as_l')::uuid), null, 'and a blank note clears the note');
select throws_ok(format('select public.teacher_update_assignment(%L, %L, false)', current_setting('test.as_l'), repeat('x', 501)),
  'P0001', 'note_too_long', 'note too long');
select ok((public.teacher_update_assignment(current_setting('test.as_l')::uuid, null, true) ->> 'closed_at') is not null, 'closing sets closed_at');
select set_config('test.closed_at', (select closed_at::text from public.assignments where id = current_setting('test.as_l')::uuid), true);
select public.teacher_update_assignment(current_setting('test.as_l')::uuid, null, true);
select is((select closed_at::text from public.assignments where id = current_setting('test.as_l')::uuid), current_setting('test.closed_at'),
  'closing again keeps the first closing time');
select ok((public.teacher_update_assignment(current_setting('test.as_l')::uuid, null, false) ->> 'closed_at') is null, 'reopening clears it');
select is(public.ta_err(format('select public.teacher_update_assignment(%L, null, false)', gen_random_uuid())), 'P0001 assignment_not_found',
  'an unknown assignment');
select public.ta_as(public.ta_id('02'));
select is(public.ta_err(format('select public.teacher_update_assignment(%L, ''x'', true)', current_setting('test.as_l'))), 'P0001 assignment_not_found',
  'another teacher cannot update it');
select public.ta_as(public.ta_id('11'));
select is(public.ta_err(format('select public.teacher_update_assignment(%L, ''x'', true)', current_setting('test.as_l'))), 'P0001 teacher_forbidden',
  'a learner cannot update it');

-- ===== Completion rules (work written as the server would) =====
reset role;
insert into public.learning_paths (id, user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, status, estimate)
values (md5('ta:path')::uuid, public.ta_id('11'), 'en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[], 'active', '{}');
-- A question-type drill on the form is not an exam.
insert into public.exam_attempts (user_id, learning_path_id, form_id, content_version, mode, question_type, question_ids, status, submitted_at, result)
values (public.ta_id('11'), md5('ta:path')::uuid, current_setting('test.form')::uuid, 1, 'question_type', 'ta_drill',
  array[current_setting('test.q1')::uuid], 'submitted', now(), '{}');
-- An attempt that expired with no saved answer (superseded by another start) is not an exam either.
insert into public.exam_attempts (id, user_id, learning_path_id, form_id, content_version, mode, question_ids, status, submitted_at, result)
values (md5('ta:att1')::uuid, public.ta_id('11'), md5('ta:path')::uuid, current_setting('test.form')::uuid, 1, 'full',
  array[current_setting('test.q1')::uuid], 'expired', now(), '{}');
select is((select count(*)::integer from public.teacher_completions(current_setting('test.ca')::uuid, public.ta_id('11'))), 0,
  'drills and abandoned attempts complete nothing');
-- The same attempt with one saved answer counts: the learner did work on it.
insert into public.exam_answers (attempt_id, question_id, user_id, answer, idempotency_key, payload_hash)
values (md5('ta:att1')::uuid, current_setting('test.q1')::uuid, public.ta_id('11'), 'a', gen_random_uuid(), 'h');
select is((select array_agg(assignment_id::text order by assignment_id::text) from public.teacher_completions(current_setting('test.ca')::uuid, public.ta_id('11'))),
  (select array_agg(x order by x) from unnest(array[current_setting('test.as_full'), current_setting('test.as_any')]) x),
  'an expired full attempt with an answer completes the full-mock and the any-mode assignments, not the reading section');
-- A submitted listening section completes the any-mode assignment only (already done), not the reading one.
insert into public.exam_attempts (user_id, learning_path_id, form_id, content_version, mode, section, question_ids, status, submitted_at, result)
values (public.ta_id('11'), md5('ta:path')::uuid, current_setting('test.form')::uuid, 1, 'section', 'listening',
  array[current_setting('test.q1')::uuid], 'submitted', now(), '{}');
select is((select count(*)::integer from public.teacher_completions(current_setting('test.ca')::uuid, public.ta_id('11'))
    where assignment_id = current_setting('test.as_sec')::uuid), 0, 'a listening section does not complete the reading assignment');
insert into public.exam_attempts (user_id, learning_path_id, form_id, content_version, mode, section, question_ids, status, submitted_at, result)
values (public.ta_id('11'), md5('ta:path')::uuid, current_setting('test.form')::uuid, 1, 'section', 'reading',
  array[current_setting('test.q1')::uuid], 'submitted', now(), '{}');
select is((select count(*)::integer from public.teacher_completions(current_setting('test.ca')::uuid, public.ta_id('11'))
    where assignment_id = current_setting('test.as_sec')::uuid), 1, 'a reading section completes it');
select is((select public.teacher_assignment_done_at(a, 'en', public.ta_id('11')) is not null from public.assignments a where a.id = current_setting('test.as_sec')::uuid),
  true, 'teacher_assignment_done_at agrees with teacher_completions');
select is((select public.teacher_assignment_done_at(a, 'en', public.ta_id('12')) from public.assignments a where a.id = current_setting('test.as_sec')::uuid),
  null, 'and l2 has not done it');

-- Closing freezes completion: work after closed_at does not count, work before it does.
insert into public.assignments (id, class_id, kind, lesson_id, created_at, closed_at) values
  (md5('ta:as_before')::uuid, current_setting('test.ca')::uuid, 'lesson', current_setting('test.hello')::uuid, now() - interval '5 days', now() - interval '1 day'),
  (md5('ta:as_after')::uuid, current_setting('test.ca')::uuid, 'lesson', current_setting('test.hello')::uuid, now() - interval '5 days', now() - interval '3 days');
insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue, status, started_at, completed_at, summary_json)
values (public.ta_id('11'), md5('ta:path')::uuid, current_setting('test.hello')::uuid, 1, '{}', 'completed', now() - interval '3 days', now() - interval '2 days', '{}');
select is((select array_agg(assignment_id::text order by assignment_id::text) from public.teacher_completions(current_setting('test.ca')::uuid, public.ta_id('11'))
    where assignment_id in (md5('ta:as_before')::uuid, md5('ta:as_after')::uuid)), array[md5('ta:as_before')::uuid::text],
  'work done before the assignment was closed counts, work after it does not');

-- ===== What learners and the teacher see =====
set local role authenticated;
select public.ta_as(public.ta_id('11'));
select is((select a ->> 'state' from jsonb_array_elements(public.learner_list_assignments(current_setting('test.ca')::uuid)) a
    where a ->> 'id' = md5('ta:as_after')::uuid::text), 'closed', 'a closed assignment that was not done is closed for the learner');
select is((select a ->> 'state' from jsonb_array_elements(public.learner_list_assignments(current_setting('test.ca')::uuid)) a
    where a ->> 'id' = md5('ta:as_before')::uuid::text), 'done', 'a closed assignment that was done stays done');
select is((select array_agg(a ->> 'state' order by ordinality) from jsonb_array_elements(public.learner_list_assignments(current_setting('test.ca')::uuid))
    with ordinality as t(a, ordinality)), array['pending', 'closed', 'done', 'done', 'done', 'done'],
  'open work first, then closed, then done');
select is((select x ->> 'pending_count' from jsonb_array_elements(public.learner_list_classes()) x where x ->> 'id' = current_setting('test.ca')),
  '1', 'pending_count ignores closed and done assignments');
select public.ta_as(public.ta_id('12'));
select is((select x ->> 'pending_count' from jsonb_array_elements(public.learner_list_classes()) x where x ->> 'id' = current_setting('test.ca')),
  '4', 'l2 has four open assignments (the closed ones do not count)');

select public.ta_as(public.ta_id('01'));
select set_config('test.roster', public.teacher_class_roster(current_setting('test.ca')::uuid)::text, true);
select is((select array_agg(a ->> 'closed_at' is not null order by ordinality) from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'assignments')
    with ordinality as t(a, ordinality)), array[false, false, false, false, true, true], 'the roster lists open assignments before closed ones');
select is((select array_agg((a ->> 'completed_count') || '/' || (a ->> 'member_count') order by a ->> 'completed_count')
    from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'assignments') a),
  array['0/2', '0/2', '1/2', '1/2', '1/2', '1/2'], 'completion counts per assignment come from one set-based pass');
select is((select m ->> 'assignments_done' from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'members') m
    where m ->> 'user_id' = public.ta_id('11')::text), '4', 'l1 completed four of the six assignments');
select is((select m ->> 'assignments_total' from jsonb_array_elements(current_setting('test.roster')::jsonb -> 'members') m
    where m ->> 'user_id' = public.ta_id('12')::text), '6', 'the total counts every assignment of the class');

-- An archived class accepts no update.
select public.teacher_archive_class(current_setting('test.ca')::uuid, true);
select is(public.ta_err(format('select public.teacher_update_assignment(%L, ''x'', false)', current_setting('test.as_l'))), 'P0001 class_archived',
  'an archived class cannot be edited');

-- Privileges: the new RPC is for signed-in users only; the helper is internal.
select ok(not has_function_privilege('anon', 'public.teacher_update_assignment(uuid, text, boolean, timestamptz, boolean)', 'execute'), 'anon cannot update assignments');
select ok(not has_function_privilege('authenticated', 'public.teacher_completions(uuid, uuid)', 'execute'), 'clients cannot call teacher_completions');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where proname = 'teacher_update_assignment'),
  'teacher_update_assignment is security definer with an empty search_path');

select * from finish();
rollback;
