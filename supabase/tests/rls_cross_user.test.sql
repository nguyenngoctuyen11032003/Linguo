-- Spec 7 §1: learner B can never read, write or act on learner A's data.
-- Tables are enumerated from the catalog, so a table added by a later migration is checked automatically:
-- a public table is "user-owned" when it has a user_id column, is profiles, or points at a learning path
-- (learning_path_id / path_id), a lesson run or a diagnostic attempt. Ownership predicates are built as
-- the test owner with A's ids inlined as literals, so they do not depend on what B's RLS lets B see.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}');

-- ===== Helpers (security invoker: they run with the caller's role and RLS) =====
create schema rls_t;
grant usage on schema rls_t to authenticated;

-- Row count of a count(*) query, or -1 when the role has no privilege.
create function rls_t.try_count(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute p_sql into v;
  return v;
exception when insufficient_privilege then
  return -1;
end $$;

-- Rows affected by a DML statement, or -1 when denied (privilege or RLS check).
create function rls_t.try_rows(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
exception when insufficient_privilege then
  return -1;
end $$;

-- SQLSTATE + message raised by a statement, or 'ok' when it succeeded.
create function rls_t.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on all functions in schema rls_t to authenticated;

create function rls_t.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function rls_t.as_user(uuid) to authenticated;

-- ===== Data for A and B, created through the RPCs where they exist =====
set local role authenticated;
select rls_t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.pa', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select set_config('test.la', (select lesson_id::text from public.path_lessons(current_setting('test.pa')::uuid) where prerequisites_met order by unit_order, lesson_order limit 1), true);
select set_config('test.ra', (public.start_lesson(current_setting('test.la')::uuid, current_setting('test.pa')::uuid) ->> 'id'), true);
select set_config('test.sa', public.start_diagnostic(current_setting('test.pa')::uuid, 'foundation')::text, true);
select set_config('test.aa', current_setting('test.sa')::jsonb ->> 'attempt_id', true);
select set_config('test.ia', current_setting('test.sa')::jsonb #>> '{item,id}', true);
-- Answer the first item, so A has a diagnostic response and a new current item.
select set_config('test.sa2', public.answer_diagnostic(current_setting('test.aa')::uuid, current_setting('test.ia')::uuid, null)::text, true);
select set_config('test.ia', current_setting('test.sa2')::jsonb #>> '{item,id}', true);
select public.ai_quota_consume(20) is not null;
select public.export_my_data() is not null;

select rls_t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('test.pb', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
reset role;

-- Rows without a learner RPC: an attempt, review state and AI usage (as the Edge Function would write).
select set_config('test.ea', (select r.queue[1]::text from public.lesson_runs r where r.id = current_setting('test.ra')::uuid), true);
insert into public.attempts (user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version,
  idempotency_key, payload_hash, response_json, verdict, is_correct, score, attempt_no, revealed, after_reveal, gave_up,
  feedback_json, stage, exercise_type, response_ms, hint_count)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, current_setting('test.ra')::uuid,
  current_setting('test.la')::uuid, e.id, e.version, 1, gen_random_uuid(), 'h', '{}', 'correct', true, 1, 1, false, false, false,
  '{}', 'recognition', 'mcq', 1000, 0
from public.exercises e where e.id = current_setting('test.ea')::uuid;
select set_config('test.li', (select id::text from public.learning_items where language_code = 'en' and status = 'published' order by key limit 1), true);
insert into public.review_cards (id, user_id, learning_path_id, learning_item_id, direction, due_at) values
  ('ca000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid,
   current_setting('test.li')::uuid, 'recognize', now() - interval '1 hour');
insert into public.review_item_mastery (user_id, learning_path_id, learning_item_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, current_setting('test.li')::uuid);
insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 'ca000000-0000-4000-8000-000000000001',
  'grade', 3, 3, current_date, gen_random_uuid(), 'h');
set local role service_role;
select set_config('test.ua', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'explain_concept', 'v1', 'm', 'ok', 200, 10, 1, 10, false, false)::text, true);
select set_config('test.ua2', public.ai_usage_log('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'explain_concept', 'v1', 'm', 'ok', 200, 10, 1, 10, false, false)::text, true);
reset role;
set local role authenticated;
select rls_t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.ai_report(current_setting('test.ua')::uuid, 'wrong', null) is not null;
reset role;

-- ===== Catalog: every public table has RLS =====
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[], 'every public table has row level security enabled');
select ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')) >= 25, 'public tables were enumerated');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update')
       or has_table_privilege('anon', c.oid, 'delete'))),
  '{}'::text[], 'anon cannot write any public table');

-- ===== User-owned tables and A's rows =====
create table rls_t.owned as
with a as (
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid as uid,
    (select array_agg(id) from public.learning_paths where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as paths,
    (select array_agg(id) from public.lesson_runs where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as runs,
    (select array_agg(id) from public.assessment_attempts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as attempts
), cols as (
  select c.oid, c.relname::text as tbl,
    array_agg(a.attname::text order by a.attnum) as cols
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  group by c.oid, c.relname
)
select cols.oid, cols.tbl, cols.cols,
  case
    when 'user_id' = any (cols.cols) then format('user_id = %L', a.uid)
    when cols.tbl = 'profiles' then format('id = %L', a.uid)
    when 'learning_path_id' = any (cols.cols) then format('learning_path_id = any (%L::uuid[])', a.paths)
    when 'path_id' = any (cols.cols) then format('path_id = any (%L::uuid[])', a.paths)
    when 'lesson_run_id' = any (cols.cols) then format('lesson_run_id = any (%L::uuid[])', a.runs)
    when 'attempt_id' = any (cols.cols) then format('attempt_id = any (%L::uuid[])', a.attempts)
  end as pred
from cols, a;
delete from rls_t.owned where pred is null;
alter table rls_t.owned add column a_rows bigint, add column a_row jsonb, add column upd_col text;
do $$
declare r record; v bigint; j jsonb;
begin
  for r in select * from rls_t.owned loop
    execute format('select count(*) from public.%I where %s', r.tbl, r.pred) into v;
    execute format('select to_jsonb(x) from public.%I x where %s limit 1', r.tbl, r.pred) into j;
    update rls_t.owned set a_rows = v, a_row = j,
      -- A column B could update if RLS let it, else the ownership column itself.
      upd_col = coalesce(
        (select c from unnest(r.cols) c where has_column_privilege('authenticated', r.oid, c, 'update') limit 1),
        case when r.tbl = 'profiles' then 'id' else split_part(r.pred, ' ', 1) end)
    where oid = r.oid;
  end loop;
end $$;
grant select on rls_t.owned to authenticated;

select ok(
  (select array_agg(tbl) from rls_t.owned) @> array['profiles', 'user_preferences', 'learning_paths', 'skill_estimates',
    'lesson_runs', 'attempts', 'review_cards', 'review_item_mastery', 'review_logs', 'assessment_attempts',
    'assessment_responses', 'ai_quota', 'ai_usage', 'ai_reports', 'account_export_requests'],
  'enumeration finds every known user-owned table');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where a_rows = 0 and tbl in ('profiles', 'user_preferences', 'learning_paths', 'skill_estimates',
    'lesson_runs', 'attempts', 'review_cards', 'review_item_mastery', 'review_logs', 'assessment_attempts',
    'assessment_responses', 'ai_quota', 'ai_usage', 'ai_reports', 'account_export_requests')),
  '{}'::text[], 'A has rows in every known user-owned table (the checks below are not vacuous)');
select diag('user-owned table without rows for A (only the catalog checks apply): ' || tbl) from rls_t.owned where a_rows = 0;

-- ===== B cannot see, change, delete or insert A's rows (any user-owned table) =====
set local role authenticated;
select rls_t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where rls_t.try_count(format('select count(*) from public.%I where %s', tbl, pred)) > 0),
  '{}'::text[], 'B sees none of A''s rows in any user-owned table');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where rls_t.try_rows(format('update public.%I set %I = %I where %s', tbl, upd_col, upd_col, pred)) > 0),
  '{}'::text[], 'B updates none of A''s rows');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where rls_t.try_rows(format('delete from public.%I where %s', tbl, pred)) > 0),
  '{}'::text[], 'B deletes none of A''s rows');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where a_row is not null
     and rls_t.err(format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L::jsonb)', tbl, tbl, a_row))
       not like '42501 %'),
  '{}'::text[], 'B cannot insert a row owned by A (denied before any constraint check)');
-- A copy of A's row with fresh keys must be rejected too (not just a duplicate key).
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where a_row is not null and a_row ? 'id'
     and rls_t.err(format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L::jsonb)', tbl, tbl,
       a_row || jsonb_build_object('id', gen_random_uuid()))) not like '42501 %'),
  '{}'::text[], 'B cannot insert a new row owned by A');

-- Positive control: A sees all of A's rows wherever learners may read the table.
select rls_t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where has_table_privilege('authenticated', oid, 'select')
     and rls_t.try_count(format('select count(*) from public.%I where %s', tbl, pred)) <> a_rows),
  '{}'::text[], 'A sees every one of A''s rows in learner-readable tables');
reset role;

-- B's update/delete/insert attempts changed nothing.
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where rls_t.try_count(format('select count(*) from public.%I where %s', tbl, pred)) <> a_rows),
  '{}'::text[], 'A''s row counts are unchanged');

-- ===== RPCs taking an id reject A's ids when called by B =====
set local role authenticated;
select rls_t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- Learning paths.
select throws_ok(format('select public.set_current_learning_path(%L)', current_setting('test.pa')),
  'P0001', 'path_not_found', 'set_current_learning_path rejects A''s path');
select throws_ok(format('select public.update_learning_path_plan(%L, ''foundation'', ''a2'', array[60,60,60,60,60,60,60]::smallint[], null)', current_setting('test.pa')),
  'P0001', 'path_not_found', 'update_learning_path_plan rejects A''s path');
select throws_ok(format('select public.set_learning_path_status(%L, ''paused'')', current_setting('test.pa')),
  'P0001', 'path_not_found', 'set_learning_path_status rejects A''s path');

-- Lessons and runs.
-- path_lessons is security invoker: RLS hides A's path, so B gets no rows.
select is(rls_t.try_count(format('select count(*) from public.path_lessons(%L)', current_setting('test.pa'))), 0::bigint,
  'path_lessons returns nothing for A''s path');
select throws_ok(format('select public.get_lesson(%L, %L)', current_setting('test.la'), current_setting('test.pa')),
  'P0001', 'path_not_found', 'get_lesson rejects A''s path');
select throws_ok(format('select public.start_lesson(%L, %L)', current_setting('test.la'), current_setting('test.pa')),
  'P0001', 'path_not_found', 'start_lesson rejects A''s path');
select throws_ok(format('select public.save_lesson_cursor(%L, 1::smallint)', current_setting('test.ra')),
  'P0001', 'run_not_found', 'save_lesson_cursor rejects A''s run');
select throws_ok(format('select public.submit_exercise(%L, %L, 1, %L, ''{"choice": "x"}'', null, 1000, 0::smallint, null)',
    current_setting('test.ra'), current_setting('test.ea'), gen_random_uuid()),
  'P0001', 'run_not_found', 'submit_exercise rejects A''s run');
select throws_ok(format('select public.complete_lesson(%L)', current_setting('test.ra')),
  'P0001', 'run_not_found', 'complete_lesson rejects A''s run');

-- Reviews.
select throws_ok(format('select public.get_review_queue(%L)', current_setting('test.pa')),
  'P0001', 'path_not_found', 'get_review_queue rejects A''s path');
select throws_ok(format('select public.review_summary(%L)', current_setting('test.pa')),
  'P0001', 'path_not_found', 'review_summary rejects A''s path');
select throws_ok(format('select public.postpone_reviews(%L, array[''ca000000-0000-4000-8000-000000000001'']::uuid[], %L)',
    current_setting('test.pa'), gen_random_uuid()),
  'P0001', 'path_not_found', 'postpone_reviews rejects A''s path');
select throws_ok(format('select public.grade_review(''ca000000-0000-4000-8000-000000000001'', 3::smallint, null, 1000, 0::smallint, %L, null)', gen_random_uuid()),
  'P0001', 'card_not_found', 'grade_review rejects A''s card');
-- B's own path with A's card id: A's card is left alone.
select set_config('test.pp', rls_t.err(format('select public.postpone_reviews(%L, array[''ca000000-0000-4000-8000-000000000001'']::uuid[], %L)',
    current_setting('test.pb'), gen_random_uuid())), true);
select is(current_setting('test.pp'), 'P0001 card_not_found', 'postpone_reviews on B''s path rejects A''s card');
reset role;
select is((select postpone_count from public.review_cards where id = 'ca000000-0000-4000-8000-000000000001'), 0::smallint,
  'A''s card was never postponed');
set local role authenticated;
select rls_t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- Diagnostic.
select throws_ok(format('select public.diagnostic_status(%L)', current_setting('test.pa')),
  'P0001', 'path_not_found', 'diagnostic_status rejects A''s path');
select throws_ok(format('select public.start_diagnostic(%L, ''foundation'')', current_setting('test.pa')),
  'P0001', 'path_not_found', 'start_diagnostic rejects A''s path');
select throws_ok(format('select public.answer_diagnostic(%L, %L, null)', current_setting('test.aa'), current_setting('test.ia')),
  'P0001', 'attempt_not_found', 'answer_diagnostic rejects A''s attempt');
select throws_ok(format('select public.skip_diagnostic_skill(%L, ''grammar'', ''no_time'')', current_setting('test.aa')),
  'P0001', 'attempt_not_found', 'skip_diagnostic_skill rejects A''s attempt');
select throws_ok(format('select public.finish_diagnostic(%L)', current_setting('test.aa')),
  'P0001', 'attempt_not_found', 'finish_diagnostic rejects A''s attempt');
select throws_ok(format('select public.accept_diagnostic_placement(%L)', current_setting('test.aa')),
  'P0001', 'attempt_not_found', 'accept_diagnostic_placement rejects A''s attempt');

-- AI usage.
select throws_ok(format('select public.ai_report(%L, ''wrong'', null)', current_setting('test.ua2')),
  'P0001', 'usage_not_found', 'ai_report rejects A''s usage id');

-- Generic sweep: every learner RPC whose only required argument is p_path_id (including ones added by later
-- migrations, e.g. the session planner) must fail for A's path with a P0001 code, or (security invoker
-- functions such as path_lessons) return nothing.
reset role;
create table rls_t.path_rpcs as
select p.oid::regprocedure::text as sig, p.proname::text as name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
  and p.prokind = 'f' and p.pronargs >= 1 and p.pronargs - p.pronargdefaults = 1
  and p.proargnames[1] = 'p_path_id' and p.proargtypes[0] = 'uuid'::regtype;
grant select on rls_t.path_rpcs to authenticated;
select ok((select count(*) from rls_t.path_rpcs) >= 4, 'path-id RPCs were enumerated');
set local role authenticated;
select rls_t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is(
  (select coalesce(array_agg(name order by name), '{}') from rls_t.path_rpcs
   where rls_t.err(format('select public.%I(%L::uuid)', name, current_setting('test.pa'))) not like 'P0001 %'
     and rls_t.try_count(format('select count(*) from public.%I(%L::uuid) x where x is not null', name, current_setting('test.pa'))) <> 0),
  '{}'::text[], 'every p_path_id RPC rejects A''s path for B');
-- The same RPCs accept B's own path (the rejection above is about ownership, not the call shape).
select is(
  (select coalesce(array_agg(name order by name), '{}') from rls_t.path_rpcs
   where rls_t.err(format('select public.%I(%L::uuid)', name, current_setting('test.pb'))) like '42501 %'),
  '{}'::text[], 'p_path_id RPCs are callable by B on B''s own path');
reset role;

-- A's data survived every attempt.
select is((select status from public.learning_paths where id = current_setting('test.pa')::uuid), 'active', 'A''s path still active');
select is((select status from public.assessment_attempts where id = current_setting('test.aa')::uuid), 'in_progress', 'A''s diagnostic still in progress');
select is((select cursor from public.lesson_runs where id = current_setting('test.ra')::uuid), 0::smallint, 'A''s run cursor unchanged');
select is((select current_learning_path_id from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), current_setting('test.pb')::uuid,
  'B''s current path is still B''s');
select is((select count(*)::integer from public.ai_reports where usage_id = current_setting('test.ua2')::uuid), 0, 'no report on A''s usage');

-- ===== Account RPCs act only on the caller =====
set local role authenticated;
select rls_t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('test.xb', public.export_my_data()::text, true);
select is(current_setting('test.xb')::jsonb #>> '{account,id}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B''s export is B''s account');
select ok(position('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' in current_setting('test.xb')) = 0, 'B''s export never mentions A');
select ok(position(current_setting('test.pa') in current_setting('test.xb')) = 0, 'B''s export does not contain A''s path');
select lives_ok('select public.delete_my_account(''XOA TAI KHOAN'')', 'B deletes B''s account');
reset role;
select ok(exists (select 1 from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'A''s account survives B''s deletion');
select ok(not exists (select 1 from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'B''s account is gone');
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from rls_t.owned
   where rls_t.try_count(format('select count(*) from public.%I where %s', tbl, pred)) <> a_rows
     and tbl <> 'account_export_requests'),
  '{}'::text[], 'all of A''s rows are intact after B deletes B''s account');

-- service_role-only and internal RPCs are closed to learners.
select ok(not has_function_privilege('authenticated', 'public.purge_expired_data()', 'execute'), 'learners cannot purge');
select ok(not has_function_privilege('authenticated', 'public.account_optional_tables()', 'execute'), 'account_optional_tables is internal');
select ok(not has_function_privilege('anon', 'public.export_my_data()', 'execute'), 'anon cannot export');
select ok(not has_function_privilege('anon', 'public.delete_my_account(text)', 'execute'), 'anon cannot delete accounts');
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[], 'anon can execute no security definer function in public');

select * from finish();
rollback;
