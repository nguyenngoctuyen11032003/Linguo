-- Linguo spec 2: bring hosted databases in line with the current 20261014000100/000200 migrations.
--
-- Production applied 20261014000100_content.sql and 20261014000200_lesson_runs.sql as they were at
-- commit 065fbf8 (Deploy run 38391439852, `Supabase db push` succeeded). Afterwards 000100 was edited in
-- place (commit 1f49cc8) to add the PostgREST wrapper public.import_content_bundle(jsonb) used by
-- `pnpm content:push` / the Publish content workflow; Supabase never re-applies a migration, so hosted
-- databases lack it. 000200 has not changed since 065fbf8, and 000300..000430 were applied from their
-- current versions, so this wrapper (with its comment and grants) is the whole drift.
--
-- On a database built from the current migrations this is an idempotent re-definition of identical
-- objects. The body, comment and grants are copied verbatim from 20261014000100_content.sql.
-- Never edit a deployed migration: add a new one (docs/DEPLOY.md).

create or replace function public.import_content_bundle(p_bundle jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select content_private.import_bundle(p_bundle);
$$;

comment on function public.import_content_bundle(jsonb) is 'PostgREST wrapper around content_private.import_bundle for the content importer. service_role only.';

revoke all on function public.import_content_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.import_content_bundle(jsonb) to service_role;
