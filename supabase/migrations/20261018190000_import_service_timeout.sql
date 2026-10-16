-- Content import timeout.
-- scripts/content-import.mjs --apply posts the whole bundle to public.import_content_bundle in one PostgREST
-- request, and the import is one transaction that also archives every row absent from the bundle, so it cannot be
-- split into smaller calls. With the N2/N1 programs and the new exams the first import after a large content
-- change no longer fits the default request timeout (HTTP 500, 57014 "canceling statement due to statement
-- timeout" in Publish content run 38917273831). PostgREST applies per-role settings to each request, so raise it for
-- service_role only: learners (anon/authenticated) keep the default limit. Unchanged rows are skipped by content
-- hash, so later imports are fast again.
alter role service_role set statement_timeout = '120s';
