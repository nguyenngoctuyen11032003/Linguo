begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
select is(
  (select count(*)::int
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and (p.proname ilike '%answer_key%'
       or pg_catalog.pg_get_function_result(p.oid) ilike any (array['%answer_key%', '%exercise_keys%'])
       or exists (select 1 from unnest(coalesce(p.proargnames, '{}'::text[])) as a (arg) where a.arg ilike '%answer_key%'))),
  0, 'no public function callable by authenticated exposes answer keys');
-- supabase/config.toml keeps api.schemas = ["public", "graphql_public"]; config is not visible from SQL.
select pass('content_private not exposed via config.toml');

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
