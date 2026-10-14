-- Spec 11 §2: report_content (published targets of the 5 kinds, note limit, daily limit, 24 h duplicates),
-- list_my_reports, RLS select-own and the account export. Targets come from the demo content in seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}', now());

create function public.c1r_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.c1r_as(uuid) to authenticated;

-- Published targets of every kind (seed demo content).
select set_config('test.lesson', (select id::text from public.lessons where key = 'en:lesson:hello'), true);
select set_config('test.exercise', (select id::text from public.exercises
  where lesson_id = current_setting('test.lesson')::uuid and status = 'published' order by order_index limit 1), true);
select set_config('test.item', (select id::text from public.learning_items where key = 'en:item:hello'), true);
select set_config('test.item2', (select id::text from public.learning_items where key = 'en:item:hi'), true);
select set_config('test.assess', (select id::text from public.assessment_items
  where language_code = 'en' and status = 'published' order by key limit 1), true);
select set_config('test.examq', (select q.id::text from public.exam_questions q join public.exam_forms f on f.id = q.form_id
  where f.key = 'ko:exam:topik-i-mock-1' and q.status = 'published' order by q.seq limit 1), true);
-- An archived item is not reportable.
update public.learning_items set status = 'archived' where id = current_setting('test.item2')::uuid;

-- ===== Schema and privileges =====
select has_table('public', 'content_reports', 'content_reports exists');
select ok((select relrowsecurity from pg_class where oid = 'public.content_reports'::regclass), 'content_reports has RLS');
select ok(not has_table_privilege('authenticated', 'public.content_reports', 'insert'), 'learners cannot insert reports directly');
select ok(not has_table_privilege('authenticated', 'public.content_reports', 'update'), 'learners cannot update reports');
select ok(not has_table_privilege('anon', 'public.content_reports', 'select'), 'anon cannot read reports');
select ok(not has_function_privilege('anon', 'public.report_content(text, uuid, text, text)', 'execute'), 'anon cannot report');
select ok(has_function_privilege('authenticated', 'public.report_content(text, uuid, text, text)', 'execute'), 'authenticated can report');
select ok(has_function_privilege('authenticated', 'public.list_my_reports(integer)', 'execute'), 'authenticated can list own reports');
select ok(not has_function_privilege('authenticated', 'public.content_target_label(text, uuid, integer)', 'execute'), 'label helper is internal');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
  where p.oid in ('public.report_content(text, uuid, text, text)'::regprocedure, 'public.list_my_reports(integer)'::regprocedure)),
  'report RPCs are security definer with an empty search_path');

-- ===== Validation =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(format('select public.report_content(''lesson'', %L, ''typo'', null)', current_setting('test.lesson')),
  '42501', 'not_authenticated', 'reporting needs a user');

select public.c1r_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok(format('select public.report_content(''unit'', %L, ''typo'', null)', current_setting('test.lesson')),
  'P0001', 'invalid_target', 'unknown target kind');
select throws_ok(format('select public.report_content(''lesson'', %L, ''boring'', null)', current_setting('test.lesson')),
  'P0001', 'invalid_reason', 'unknown reason');
select throws_ok(format('select public.report_content(''lesson'', %L, ''typo'', %L)', current_setting('test.lesson'), repeat('x', 501)),
  'P0001', 'note_too_long', 'note longer than 500 characters');
select throws_ok(format('select public.report_content(''lesson'', %L, ''typo'', null)', gen_random_uuid()),
  'P0001', 'target_not_found', 'unknown target id');
select throws_ok(format('select public.report_content(''learning_item'', %L, ''typo'', null)', current_setting('test.item2')),
  'P0001', 'target_not_found', 'an unpublished (archived) target cannot be reported');
select throws_ok(format('select public.report_content(''exercise'', %L, ''typo'', null)', current_setting('test.lesson')),
  'P0001', 'target_not_found', 'the id must belong to the given kind');

-- ===== One report per kind =====
select is(public.report_content('lesson', current_setting('test.lesson')::uuid, 'typo', '  Sai chính tả ở tiêu đề  ') ->> 'status',
  'open', 'lesson reported');
select is(public.report_content('exercise', current_setting('test.exercise')::uuid, 'wrong_answer', null) ->> 'status',
  'open', 'exercise reported');
select is(public.report_content('learning_item', current_setting('test.item')::uuid, 'audio', '') ->> 'status',
  'open', 'learning item reported');
select is(public.report_content('assessment_item', current_setting('test.assess')::uuid, 'unclear', null) ->> 'status',
  'open', 'assessment item reported');
select is(public.report_content('exam_question', current_setting('test.examq')::uuid, 'translation', null) ->> 'status',
  'open', 'exam question reported');
select is(public.report_content('lesson', current_setting('test.lesson')::uuid, 'other', repeat('x', 500)) ->> 'status',
  'duplicate', 'reporting the same target again within 24 h is a duplicate');
select ok((public.report_content('learning_item', current_setting('test.item')::uuid, 'typo', null) ->> 'report_id') is not null,
  'a duplicate still returns its report id');
select is((select count(*)::integer from public.content_reports), 7, 'A sees all 7 of A''s reports, duplicates included');
select is((select note from public.content_reports where reason = 'typo' and target_kind = 'lesson'),
  'Sai chính tả ở tiêu đề', 'note is trimmed');
select is((select note from public.content_reports where reason = 'audio'), null, 'blank note is stored as null');
select is((select content_version from public.content_reports where target_kind = 'lesson' and reason = 'typo'),
  (select version from public.lessons where id = current_setting('test.lesson')::uuid), 'the content version is recorded');

-- ===== Another learner: duplicate across users, RLS =====
select public.c1r_as('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is(public.report_content('exercise', current_setting('test.exercise')::uuid, 'wrong_answer', 'Đáp án B mới đúng') ->> 'status',
  'duplicate', 'a target reported by someone else within 24 h is a duplicate');
select is((select count(*)::integer from public.content_reports), 1, 'B sees only B''s report');
select is(jsonb_array_length(public.list_my_reports()), 1, 'list_my_reports returns only B''s report');
select is((select count(*)::integer from public.content_reports where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'B cannot read A''s reports');
select throws_ok($$update public.content_reports set status = 'fixed'$$, '42501', null, 'B cannot update reports');

-- ===== list_my_reports =====
-- All rows of this transaction share now(): make A's last report the newest.
reset role;
update public.content_reports set created_at = created_at + interval '1 second'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and target_kind = 'learning_item' and reason = 'typo';
set local role authenticated;
select public.c1r_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is(jsonb_array_length(public.list_my_reports()), 7, 'A lists 7 reports');
select is(jsonb_array_length(public.list_my_reports(2)), 2, 'p_limit caps the list');
select is(public.list_my_reports(1) -> 0 ->> 'target_kind', 'learning_item', 'newest report first');
select is((select r ->> 'target_label' from jsonb_array_elements(public.list_my_reports()) r where r ->> 'target_kind' = 'lesson' limit 1),
  (select title ->> 'vi' from public.lessons where id = current_setting('test.lesson')::uuid), 'a lesson is labelled by its title');
select is((select r ->> 'target_label' from jsonb_array_elements(public.list_my_reports()) r where r ->> 'reason' = 'audio'),
  'hello', 'an item is labelled by its headword');
select ok((select bool_and(r ?& array['id', 'target_kind', 'target_id', 'target_label', 'reason', 'note', 'status',
    'resolution_note', 'created_at', 'resolved_at'] and not r ? 'user_id')
  from jsonb_array_elements(public.list_my_reports()) r), 'list items match myReportSchema and carry no user id');

-- ===== Daily limit (20 in 24 h) and the duplicate window =====
reset role;
insert into public.content_reports (user_id, target_kind, target_id, content_version, reason, status, created_at)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lesson', current_setting('test.lesson')::uuid, 1, 'other', 'duplicate', now() - interval '1 hour'
from generate_series(1, 13);
set local role authenticated;
select public.c1r_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok(format('select public.report_content(''lesson'', %L, ''typo'', null)', current_setting('test.lesson')),
  'P0001', 'rate_limited', 'the 21st report within 24 hours is refused');
reset role;
-- Push everything back by 25 hours: the limit and the duplicate window are rolling 24-hour windows.
update public.content_reports set created_at = created_at - interval '25 hours';
set local role authenticated;
select public.c1r_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is(public.report_content('exam_question', current_setting('test.examq')::uuid, 'audio', null) ->> 'status',
  'open', 'after 24 hours the limit resets and the target is no longer a duplicate');

-- ===== Account export =====
select set_config('test.export', public.export_my_data()::text, true);
select is(jsonb_array_length(current_setting('test.export')::jsonb -> 'content_reports'), 21, 'export_my_data includes the learner''s reports');
select ok(position('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' in current_setting('test.export')) = 0, 'A''s export carries none of B''s reports');
reset role;

select * from finish();
rollback;
