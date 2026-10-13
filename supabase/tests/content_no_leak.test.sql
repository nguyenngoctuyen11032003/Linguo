begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ===== privileges (as the migration owner) =====
select ok(not has_schema_privilege('anon', 'content_private', 'usage'), 'anon has no usage on content_private');
select ok(not has_schema_privilege('authenticated', 'content_private', 'usage'), 'authenticated has no usage on content_private');
select is(
  (select count(*)::int
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) as r (role_name)
   where n.nspname = 'content_private' and c.relkind in ('r', 'v', 'm', 'p')
     and has_table_privilege(r.role_name::name, c.oid, 'select, insert, update, delete')),
  0, 'no client role has any privilege on content_private tables');
select ok(not has_function_privilege('authenticated', 'content_private.import_bundle(jsonb)', 'execute'), 'authenticated cannot execute import_bundle');
select ok(not has_function_privilege('anon', 'content_private.import_bundle(jsonb)', 'execute'), 'anon cannot execute import_bundle');
select ok(has_function_privilege('service_role', 'content_private.import_bundle(jsonb)', 'execute'), 'service_role can execute import_bundle');
-- public.import_content_bundle is the PostgREST wrapper the importer calls with the service_role key.
select ok(not has_function_privilege('anon', 'public.import_content_bundle(jsonb)', 'execute'), 'anon cannot execute import_content_bundle');
select ok(not has_function_privilege('authenticated', 'public.import_content_bundle(jsonb)', 'execute'), 'authenticated cannot execute import_content_bundle');
select ok(has_function_privilege('service_role', 'public.import_content_bundle(jsonb)', 'execute'), 'service_role can execute import_content_bundle');
-- Public functions authenticated can execute must not read content_private (signature or body), except
-- the lesson RPCs, which reveal answers only under their own rules (tested in lesson_runs.test.sql).
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and (pg_catalog.pg_get_function_result(p.oid) ilike '%content_private%'
       or pg_catalog.pg_get_function_arguments(p.oid) ilike '%content_private%'
       or p.prosrc ilike '%content_private%'
       or p.prosrc ilike '%exercise_keys%')
     and p.proname not in ('get_lesson', 'submit_exercise', 'complete_lesson')),
  '{}'::text[], 'only the lesson RPCs among client-callable public functions reference content_private');
select is(
  (select count(*)::int
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('get_lesson', 'submit_exercise', 'complete_lesson')
     and p.prosrc ilike '%content_private%'
     and not (p.prosecdef and exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c (setting) where c.setting like 'search_path=%'))),
  0, 'lesson RPCs that read content_private are security definer with a fixed search_path');
select is(
  (select count(*)::int
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   cross join (values ('public'), ('anon'), ('authenticated')) as r (role_name)
   where n.nspname = 'content_private'
     and (case when r.role_name = 'public'
               then exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                            where a.grantee = 0 and a.privilege_type = 'EXECUTE')
               else has_function_privilege(r.role_name::name, p.oid, 'execute') end)),
  0, 'no content_private function is executable by public, anon or authenticated');

-- ===== authenticated =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "role": "authenticated"}', true);
select throws_ok($$select count(*) from content_private.exercise_keys$$, '42501', null, 'authenticated cannot read exercise_keys');
select throws_ok($$select count(*) from content_private.revisions$$, '42501', null, 'authenticated cannot read revisions');

-- ===== anon =====
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select count(*) from content_private.exercise_keys$$, '42501', null, 'anon cannot read exercise_keys');

select * from finish();
rollback;
