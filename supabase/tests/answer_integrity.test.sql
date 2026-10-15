begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- B5/B6 of the backend review (20261015000800_answer_integrity.sql, B5 tightened by 20261016000500): submit_exercise
-- ignores a client_at that predates the run, is older than 12 hours (48 before F1.2) or lies in the future, and grades with an older
-- answer key only for an offline replay.
-- Uses the published seed content: the first lesson of a fresh English path, answered with give_up (valid for
-- every exercise type).

create function public.d5_submit(p_exercise text, p_key text, p_version integer, p_client_at timestamptz)
returns jsonb
language sql
volatile
as $$
  select public.submit_exercise(current_setting('test.run')::uuid, p_exercise::uuid, p_version, p_key::uuid, '{"give_up": true}'::jsonb,
    2::smallint, 1500, 0::smallint, p_client_at);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d5000000-0000-4000-8000-000000000001', 'integrity@test.dev', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d5000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'learner creates an EN path');
select set_config('test.path', (select id::text from public.learning_paths where language_code = 'en'), true);
select set_config('test.lesson', (
  select pl.lesson_id::text from public.path_lessons(current_setting('test.path')::uuid) pl
  where pl.prerequisites_met order by pl.lesson_id limit 1), true);
select set_config('test.run', public.start_lesson(current_setting('test.lesson')::uuid, current_setting('test.path')::uuid) ->> 'id', true);
select set_config('test.e1', (select queue[1]::text from public.lesson_runs where id = current_setting('test.run')::uuid), true);
select set_config('test.e2', (select queue[2]::text from public.lesson_runs where id = current_setting('test.run')::uuid), true);
select set_config('test.e3', (select queue[3]::text from public.lesson_runs where id = current_setting('test.run')::uuid), true);
select set_config('test.e4', (select queue[4]::text from public.lesson_runs where id = current_setting('test.run')::uuid), true);
select ok(current_setting('test.e4') <> '', 'the seeded lesson has at least four exercises');

-- ===== B5: back-dating =====
-- The run started just now, so a client_at of three days ago predates it: ignored.
select lives_ok(format('select public.d5_submit(%L, %L, 1, now() - interval ''3 days'')', current_setting('test.e1'), 'd5000000-0000-4000-8000-000000000001'),
  'an answer claiming to predate its run is accepted');
select is((select client_at from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000001'), null,
  'a client_at before the run started is ignored');
select is((select synced_late from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000001'), false,
  'and the answer is not marked as synced late');

-- The run started five days ago (opened on day D, still in progress).
reset role;
update public.lesson_runs set started_at = now() - interval '5 days' where id = current_setting('test.run')::uuid;
-- Its first answer (stored above) belongs to the same old session.
update public.attempts set created_at = now() - interval '5 days' + interval '1 minute' where lesson_run_id = current_setting('test.run')::uuid;
set local role authenticated;
-- A genuine offline replay answered 10 hours ago (after the run started, within 12 hours) keeps its client_at.
select lives_ok(format('select public.d5_submit(%L, %L, 1, now() - interval ''10 hours'')', current_setting('test.e2'), 'd5000000-0000-4000-8000-000000000002'),
  'an offline replay answered 10 hours ago is accepted');
select ok((select client_at from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000002')
    between now() - interval '11 hours' and now() - interval '9 hours',
  'its client_at is kept');
select is((select synced_late from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000002'), true, 'and it is marked as synced late');
-- B5 follow-up: a client_at 60 hours old is after the run started but older than 12 hours: the answer counts on the
-- server day, so an old run cannot be used to backfill a missed day.
select lives_ok(format('select public.d5_submit(%L, %L, 1, now() - interval ''60 hours'')', current_setting('test.e1'), 'd5000000-0000-4000-8000-000000000007'),
  'an answer claiming to be 60 hours old on a run opened 5 days ago is accepted');
select is((select client_at from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000007'), null,
  'a client_at older than 12 hours is ignored');
select is((select synced_late from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000007'), false,
  'and the answer is not marked as synced late');

-- A client_at in the future is clamped to now.
select lives_ok(format('select public.d5_submit(%L, %L, 1, now() + interval ''1 day'')', current_setting('test.e3'), 'd5000000-0000-4000-8000-000000000003'),
  'an answer from the future is accepted');
select ok((select client_at from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000003') <= clock_timestamp(),
  'its client_at is clamped to the server time');

-- ===== F1.2: forged response_ms, repair scenario, honest offline replay (second learner) =====
reset role;
create function public.d5_submit_ms(p_run text, p_exercise text, p_key text, p_ms integer, p_client_at timestamptz)
returns jsonb
language sql
volatile
as $$
  select public.submit_exercise(p_run::uuid, p_exercise::uuid, 1, p_key::uuid, '{"give_up": true}'::jsonb,
    2::smallint, p_ms, 0::smallint, p_client_at);
$$;
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('d5000000-0000-4000-8000-000000000002', 'integrity2@test.dev', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d5000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[]);
select set_config('test.path2', (select id::text from public.learning_paths where user_id = 'd5000000-0000-4000-8000-000000000002'), true);
select set_config('test.run2', public.start_lesson(current_setting('test.lesson')::uuid, current_setting('test.path2')::uuid) ->> 'id', true);

-- Repair scenario: a run opened 20 hours ago (on the missed day) is answered now with a client_at on that day.
reset role;
update public.lesson_runs set started_at = now() - interval '20 hours' where id = current_setting('test.run2')::uuid;
set local role authenticated;
select lives_ok(format('select public.d5_submit_ms(%L, %L, %L, 600000, now() - interval ''19 hours'')', current_setting('test.run2'), current_setting('test.e1'), 'd5000000-0000-4000-8000-000000000011'),
  'an answer back-dated into a run opened 20 hours ago is accepted');
select is((select client_at from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000011'), null,
  'the repair back-dating (more than 12 hours) is ignored: the server time is used');
-- Another answer claiming a time before the run''s latest stored attempt is ignored too.
select lives_ok(format('select public.d5_submit_ms(%L, %L, %L, 600000, now() - interval ''6 hours'')', current_setting('test.run2'), current_setting('test.e2'), 'd5000000-0000-4000-8000-000000000012'),
  'an answer claiming a time before the run''s latest attempt is accepted');
select is((select client_at from public.attempts where idempotency_key = 'd5000000-0000-4000-8000-000000000012'), null,
  'its client_at is ignored (earlier than the latest attempt minus 5 minutes)');
select lives_ok(format('select public.d5_submit_ms(%L, %L, %L, 600000, null)', current_setting('test.run2'), current_setting('test.e3'), 'd5000000-0000-4000-8000-000000000013'),
  'a third answer with a forged response_ms is accepted');
select ok((select active_ms from public.activity_days where user_id = 'd5000000-0000-4000-8000-000000000002') <= 124000,
  'three answers with response_ms = 600 s credit at most 120 s + 2 s + 2 s (not 360 s)');
select is((select count(*)::integer from public.attempts where user_id = 'd5000000-0000-4000-8000-000000000002' and response_ms = 600000), 3,
  'the stored response_ms itself is unchanged');

-- Honest offline replay: a run opened 11 hours ago, answered offline 10 hours ago and replayed now, in order.
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('d5000000-0000-4000-8000-000000000003', 'integrity3@test.dev', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d5000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[]);
select set_config('test.path3', (select id::text from public.learning_paths where user_id = 'd5000000-0000-4000-8000-000000000003'), true);
select set_config('test.run3', public.start_lesson(current_setting('test.lesson')::uuid, current_setting('test.path3')::uuid) ->> 'id', true);
reset role;
update public.lesson_runs set started_at = now() - interval '11 hours' where id = current_setting('test.run3')::uuid;
set local role authenticated;
select public.d5_submit_ms(current_setting('test.run3'), current_setting('test.e1'), 'd5000000-0000-4000-8000-000000000021', 30000, now() - interval '10 hours');
select public.d5_submit_ms(current_setting('test.run3'), current_setting('test.e2'), 'd5000000-0000-4000-8000-000000000022', 30000, now() - interval '10 hours' + interval '1 minute');
select ok((select count(*) from public.attempts where user_id = 'd5000000-0000-4000-8000-000000000003' and client_at is not null) = 2,
  'an honest offline replay keeps both client_at values (the second is later than the first)');
select ok((select active_ms from public.activity_days where user_id = 'd5000000-0000-4000-8000-000000000003') between 30000 and 60000 + 1,
  'and credits the capped client gaps (30 s + 30 s of the 60 s spread) to the offline day');

select set_config('request.jwt.claims', '{"sub": "d5000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

-- ===== B6: answer-key versions =====
-- A content fix replaced the key of E4: version 2 exists since just now, version 1 is the old key.
reset role;
-- A re-reviewed fix: the version bump comes with a new reviewed_at (content_status_transition).
update public.exercises set version = 2, reviewed_at = now() + interval '1 second' where id = current_setting('test.e4')::uuid;
insert into content_private.exercise_keys (exercise_id, version, answer_key, rubric, known_wrong, explanation, display_answer, created_at)
  select k.exercise_id, 2, k.answer_key, k.rubric, k.known_wrong, k.explanation, k.display_answer, now()
  from content_private.exercise_keys k where k.exercise_id = current_setting('test.e4')::uuid and k.version = 1;
set local role authenticated;
select throws_ok(format('select public.d5_submit(%L, %L, 1, null)', current_setting('test.e4'), 'd5000000-0000-4000-8000-000000000004'),
  'P0001', 'exercise_version_mismatch', 'the old key does not grade a live answer');
select throws_ok(format('select public.d5_submit(%L, %L, 1, now())', current_setting('test.e4'), 'd5000000-0000-4000-8000-000000000005'),
  'P0001', 'exercise_version_mismatch', 'nor an answer claiming to be given after the new key was published');
select lives_ok(format('select public.d5_submit(%L, %L, 1, now() - interval ''1 hour'')', current_setting('test.e4'), 'd5000000-0000-4000-8000-000000000006'),
  'but an offline replay answered before the new key existed is still graded by the old one');

select * from finish();
rollback;
