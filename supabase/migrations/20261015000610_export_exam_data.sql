-- Linguo spec 7 §1: export_my_data also exports exam practice (exam_attempts, exam_answers of
-- 20261015000200_exams.sql), together with content reports (20261015000400) and reminders (notification_prefs,
-- notifications of 20261015000300); this list supersedes the one in 20261015000400_content_reports.sql and
-- deliberately leaves out push_subscriptions (device endpoints and keys are credentials). These tables are owned through a user_id column, so they join the optional tables
-- that export_my_data (20261014000910_account_data.sql) reads through the catalog; export_my_data itself is
-- unchanged. supabase/tests/account_export_coverage.test.sql fails when a new user table is neither exported
-- nor explicitly excluded.

-- Names of public tables that may or may not exist yet and are owned through a user_id column.
create or replace function public.account_optional_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['study_sessions', 'activity_days', 'user_badges', 'analytics_events', 'exam_attempts', 'exam_answers',
    'content_reports', 'notification_prefs', 'notifications'];
$$;

revoke all on function public.account_optional_tables() from public, anon, authenticated;
