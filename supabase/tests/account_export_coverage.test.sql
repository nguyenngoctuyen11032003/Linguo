begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Every public table owned through a user_id column must reach export_my_data (spec 7 §1), either through the
-- fixed sections of export_my_data (20261014000910_account_data.sql) or through account_optional_tables(),
-- unless it is listed below as intentionally excluded. A new user table fails this test until it is exported
-- or excluded on purpose.
create temporary table export_fixed (name text primary key) on commit drop;
insert into export_fixed values
  ('user_preferences'), ('learning_paths'), ('lesson_runs'),
  ('attempts'),               -- nested under lesson_runs
  ('review_cards'), ('review_item_mastery'), ('review_logs'),
  ('assessment_attempts'),    -- assessment_responses (no user_id) nested under it
  ('ai_usage'), ('ai_reports'), ('ai_quota');

create temporary table export_excluded (name text primary key, reason text not null) on commit drop;
insert into export_excluded values
  -- Bookkeeping for export_my_data's own 5/hour rate limit, purged after a day: no learner content.
  ('account_export_requests', 'export rate-limit bookkeeping, kept 1 day'),
  -- Web Push endpoint and keys of a device: credentials with no learner value, deleted with the account.
  ('push_subscriptions', 'device push credentials'),
  -- Bookkeeping for save_push_subscription's 20/hour rate limit, purged after a day: no learner content.
  ('push_subscription_saves', 'push save rate-limit bookkeeping, kept 1 day'),
  -- Bookkeeping for offline_lesson_packs' 60/hour rate limit, purged per user after a day: no learner content.
  ('offline_pack_requests', 'offline pack rate-limit bookkeeping, kept 1 day'),
  -- Access-control row the user already reads through staff_role(): not learning data.
  ('staff_roles', 'staff access control');

select ok(public.account_optional_tables() @> array['exam_attempts', 'exam_answers', 'content_reports',
    'notification_prefs', 'notifications'],
  'exam attempts, content reports and reminders are exported');
select ok(public.account_optional_tables() @> array['study_sessions', 'activity_days', 'user_badges', 'analytics_events'],
  'earlier optional tables are still exported');

select ok(public.account_optional_tables() @> array['personal_word_lists', 'personal_words', 'personal_vocab_imports'],
  'personal vocabulary lists, words and import log are exported');

select is_empty($$
  select c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname not in (select name from export_fixed)
    and c.relname <> all (public.account_optional_tables())
    and c.relname not in (select name from export_excluded)
  order by 1
$$, 'every public table with a user_id column is exported or explicitly excluded');

select is_empty($$
  select name from export_excluded where name = any (public.account_optional_tables())
  union all
  select name from export_fixed where name = any (public.account_optional_tables())
$$, 'no table is both exported and excluded, or exported twice');

-- The export of a user carries the exam sections (empty when the user has no attempt).
insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001', 'export-cov@test.dev', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "e1000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is((select jsonb_build_array(x -> 'exam_attempts', x -> 'exam_answers') from (select public.export_my_data() as x) as e),
  '[[], []]'::jsonb, 'export_my_data includes exam_attempts and exam_answers');

select * from finish();
rollback;
