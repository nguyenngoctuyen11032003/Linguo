begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Backend review B3 (20261016000100_exam_activity.sql): closing an exam attempt adds it to activity_days
-- (answers, capped active time, no XP), once; the streak/dashboard then count exam minutes.

create function public.ea_id(p_key text) returns uuid language sql immutable as $$ select md5(p_key)::uuid; $$;

create function public.ea_q(p_key text, p_seq integer) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', public.ea_id(p_key), 'key', p_key, 'seq', p_seq, 'section', 'reading', 'kind', 'mcq',
    'question_type', 'cefr_read_gist', 'level_code', 'a2', 'points', 2,
    'prompt', jsonb_build_object('instruction_vi', 'Chọn đáp án đúng.', 'stem', 'Stem ' || p_key, 'stem_lang', 'en',
      'audio_asset_id', null, 'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'text', 'A', 'lang', 'en'),
        jsonb_build_object('id', 'b', 'text', 'B', 'lang', 'en'))),
    'answer', '"a"'::jsonb, 'explanation', jsonb_build_object('vi', 'Giải thích'), 'script', null,
    'rubric', null, 'sample_answer', null, 'content_hash', md5(p_key) || md5(p_key || '#'));
$$;

create function public.ea_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function public.ea_save(p_attempt text, p_key text, p_answer text) returns jsonb language sql volatile as $$
  select public.save_exam_answer(p_attempt::uuid, public.ea_id(p_key), p_answer, false, gen_random_uuid());
$$;
-- Owner-side: place a save (and the attempt start) at an offset in seconds from the start of the attempt.
create function public.ea_at(p_attempt text, p_key text, p_sec integer) returns void language sql volatile security definer set search_path = '' as $$
  update public.exam_answers e set updated_at = a.started_at + make_interval(secs => p_sec)
  from public.exam_attempts a
  where a.id = e.attempt_id and e.attempt_id = p_attempt::uuid and e.question_id = public.ea_id(p_key);
$$;
create function public.ea_day(p_user uuid) returns date language sql stable security definer set search_path = '' as $$
  select public.progress_local_day(p_user, now());
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('ea000000-0000-4000-8000-00000000000a', 'eaa@test.dev', '{}'),
  ('ea000000-0000-4000-8000-00000000000b', 'eab@test.dev', '{}'),
  ('ea000000-0000-4000-8000-00000000000c', 'eac@test.dev', '{}'),
  ('ea000000-0000-4000-8000-00000000000d', 'ead@test.dev', '{}');
insert into public.content_sources (id, key, title, author_or_org, license, status, is_demo, content_hash)
values (public.ea_id('src:ea'), 'src:ea', 'EA test source', 'Linguo', 'own', 'published', true, md5('ea') || md5('ea#'));

select is((content_private.import_exam_bundle(jsonb_build_object('bundle_version', 1, 'forms', jsonb_build_array(
  jsonb_build_object(
    'id', public.ea_id('en:exam:ea-c1'), 'key', 'en:exam:ea-c1', 'language_code', 'en', 'family', 'cefr',
    'title_vi', 'Đề EA', 'description_vi', 'Bài luyện', 'level_from', 'a1', 'level_to', 'a2', 'source_key', 'src:ea',
    'time_limits', '{"reading": 15}'::jsonb,
    'scoring', '{"verified": false, "source_note_vi": "Tham khảo", "section_max": {}, "bands": [], "pass_ratio": 0.6}'::jsonb,
    'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', md5('ea-form') || md5('ea-form#'),
    'questions', jsonb_build_array(public.ea_q('en:examq:ea-1', 1), public.ea_q('en:examq:ea-2', 2),
      public.ea_q('en:examq:ea-3', 3), public.ea_q('en:examq:ea-4', 4), public.ea_q('en:examq:ea-5', 5))))))
  ) ->> 'inserted', '6', 'test exam form imported');

set local role authenticated;
select public.ea_as('ea000000-0000-4000-8000-00000000000a');
select set_config('test.pa', (public.create_learning_path('en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.ea_as('ea000000-0000-4000-8000-00000000000b');
select set_config('test.pb', (public.create_learning_path('en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);
select public.ea_as('ea000000-0000-4000-8000-00000000000c');
select set_config('test.pc', (public.create_learning_path('en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);

select public.ea_as('ea000000-0000-4000-8000-00000000000d');
select set_config('test.pd', (public.create_learning_path('en', 'new', 'cefr', 'a1', 'a2', array[30,30,30,30,30,30,30]::smallint[])).id::text, true);

-- ===== A: a long exam (4 answers + 1 cleared) =====
select public.ea_as('ea000000-0000-4000-8000-00000000000a');
select set_config('test.aa', public.start_exam(current_setting('test.pa')::uuid, public.ea_id('en:exam:ea-c1'), 'full') ->> 'attempt_id', true);
select ok(current_setting('test.aa') <> '', 'A starts an exam attempt');
select public.ea_save(current_setting('test.aa'), 'en:examq:ea-1', 'a');
select public.ea_save(current_setting('test.aa'), 'en:examq:ea-2', 'b');
select public.ea_save(current_setting('test.aa'), 'en:examq:ea-3', 'a');
select public.ea_save(current_setting('test.aa'), 'en:examq:ea-4', 'a');
select public.ea_save(current_setting('test.aa'), 'en:examq:ea-5', null);
-- Saves at +90 s, +290 s (gap 200 s, capped at 120), +350 s (60), +395 s (45); the cleared answer is ignored.
select public.ea_at(current_setting('test.aa'), 'en:examq:ea-1', 90);
select public.ea_at(current_setting('test.aa'), 'en:examq:ea-2', 290);
select public.ea_at(current_setting('test.aa'), 'en:examq:ea-3', 350);
select public.ea_at(current_setting('test.aa'), 'en:examq:ea-4', 395);
select public.ea_at(current_setting('test.aa'), 'en:examq:ea-5', 9999);

select is((select count(*)::integer from public.activity_days where user_id = 'ea000000-0000-4000-8000-00000000000a'), 0,
  'nothing is counted while the attempt is in progress');
select lives_ok(format('select public.submit_exam(%L)', current_setting('test.aa')), 'A submits');

select is((select row(d.answers, d.active_ms, d.xp, d.lessons, d.reviews, d.correct_first)::text
           from public.activity_days d where d.user_id = 'ea000000-0000-4000-8000-00000000000a' and d.learning_path_id = current_setting('test.pa')::uuid
             and d.local_day = public.ea_day('ea000000-0000-4000-8000-00000000000a')),
  '(4,315000,0,0,0,0)', 'the day gets 4 answers, 315 s (gaps capped at 120 s), no XP, no lesson or review');

-- Idempotent: closing twice does not double count (RPC replay and a direct second close).
select lives_ok(format('select public.submit_exam(%L)', current_setting('test.aa')), 'a second submit returns the stored result');
reset role;
select lives_ok(format('select public.exam_close_attempt(%L, ''submitted'')', current_setting('test.aa')), 'a direct second close is a no-op');
select is((select row(d.answers, d.active_ms, d.xp)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000a' and d.learning_path_id = current_setting('test.pa')::uuid),
  '(4,315000,0)', 'the attempt is counted exactly once');
select ok((select activity_counted_at is not null from public.exam_attempts where id = current_setting('test.aa')::uuid), 'the attempt is marked as counted');

-- Streak and dashboard: >= 5 exam minutes make the day active and show in the minutes.
select is((select (public.progress_streak('ea000000-0000-4000-8000-00000000000a', current_setting('test.pa')::uuid)).current), 1,
  'an exam-only day of 5+ minutes is an active streak day');
set local role authenticated;
select public.ea_as('ea000000-0000-4000-8000-00000000000a');
select set_config('test.dash', public.get_progress_dashboard(current_setting('test.pa')::uuid, 7)::text, true);
select is((current_setting('test.dash')::jsonb -> 'days' -> 6 ->> 'minutes')::integer, 5, 'the dashboard shows 5 exam minutes today');
select is((current_setting('test.dash')::jsonb -> 'days' -> 6 ->> 'active')::boolean, true, 'and the day is active');
select is((current_setting('test.dash')::jsonb -> 'days' -> 6 ->> 'xp')::integer, 0, 'with zero XP');

-- ===== B: a short exam under 5 minutes =====
select public.ea_as('ea000000-0000-4000-8000-00000000000b');
select set_config('test.ab', public.start_exam(current_setting('test.pb')::uuid, public.ea_id('en:exam:ea-c1'), 'full') ->> 'attempt_id', true);
select public.ea_save(current_setting('test.ab'), 'en:examq:ea-1', 'a');
select public.ea_save(current_setting('test.ab'), 'en:examq:ea-2', 'b');
select public.ea_at(current_setting('test.ab'), 'en:examq:ea-1', 30);
select public.ea_at(current_setting('test.ab'), 'en:examq:ea-2', 70);
select public.submit_exam(current_setting('test.ab')::uuid);
select is((select row(d.answers, d.active_ms, d.xp)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000b' and d.learning_path_id = current_setting('test.pb')::uuid),
  '(2,70000,0)', 'a short exam adds its answers and 70 s');
select is((public.get_progress_dashboard(current_setting('test.pb')::uuid, 7) -> 'days' -> 6 ->> 'active')::boolean, false,
  'a day with under 5 active minutes (and no lesson/reviews) is not active');

-- ===== Other users unaffected =====
select public.ea_as('ea000000-0000-4000-8000-00000000000c');
select is((select count(*)::integer from public.activity_days), 0, 'user C sees no activity (RLS) and has none');
reset role;
select is((select count(*)::integer from public.activity_days where user_id = 'ea000000-0000-4000-8000-00000000000c'), 0,
  'no activity row was written for an unrelated user');

-- ===== F1.1: activity is credited to the day the answers were SAVED, not the day the attempt is closed =====
-- D answers a section attempt three days ago (+90 s and +200 s) and only closes it now. Three days (not two) keeps that
-- day apart from the "30 hours ago" day below at any time of day.
select public.ea_as('ea000000-0000-4000-8000-00000000000d');
set local role authenticated;
select set_config('test.ad', public.start_exam(current_setting('test.pd')::uuid, public.ea_id('en:exam:ea-c1'), 'section', 'reading') ->> 'attempt_id', true);
select public.ea_save(current_setting('test.ad'), 'en:examq:ea-1', 'a');
select public.ea_save(current_setting('test.ad'), 'en:examq:ea-2', 'b');
reset role;
update public.exam_attempts set started_at = now() - interval '3 days' where id = current_setting('test.ad')::uuid;
select public.ea_at(current_setting('test.ad'), 'en:examq:ea-1', 90);
select public.ea_at(current_setting('test.ad'), 'en:examq:ea-2', 200);
select lives_ok(format('select public.exam_close_attempt(%L, ''submitted'')', current_setting('test.ad')), 'D closes the old attempt now');
select is((select row(d.answers, d.active_ms)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000d' and d.local_day = public.progress_local_day('ea000000-0000-4000-8000-00000000000d', now() - interval '3 days')),
  '(2,200000)', 'the answers are credited to the day they were saved (three days ago)');
select is((select count(*)::integer from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000d' and d.local_day = public.ea_day('ea000000-0000-4000-8000-00000000000d')), 0,
  'and nothing is credited to the day of the close');

-- An attempt whose answers span two local days is split per day (answers 30 h and 1 h ago, closed now).
set local role authenticated;
select public.ea_as('ea000000-0000-4000-8000-00000000000d');
select set_config('test.ae', public.start_exam(current_setting('test.pd')::uuid, public.ea_id('en:exam:ea-c1'), 'section', 'reading') ->> 'attempt_id', true);
select public.ea_save(current_setting('test.ae'), 'en:examq:ea-3', 'a');
select public.ea_save(current_setting('test.ae'), 'en:examq:ea-4', 'a');
reset role;
update public.exam_attempts set started_at = now() - interval '31 hours' where id = current_setting('test.ae')::uuid;
update public.exam_answers set updated_at = now() - interval '30 hours' where attempt_id = current_setting('test.ae')::uuid and question_id = public.ea_id('en:examq:ea-3');
update public.exam_answers set updated_at = now() - interval '1 hour' where attempt_id = current_setting('test.ae')::uuid and question_id = public.ea_id('en:examq:ea-4');
select public.exam_close_attempt(current_setting('test.ae')::uuid, 'submitted');
select is((select row(d.answers, d.active_ms)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000d' and d.local_day = public.progress_local_day('ea000000-0000-4000-8000-00000000000d', now() - interval '30 hours')),
  '(1,120000)', 'the first answer is credited to its own day (gap capped at 120 s)');
select is((select row(d.answers, d.active_ms)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000d' and d.local_day = public.progress_local_day('ea000000-0000-4000-8000-00000000000d', now() - interval '1 hour')),
  '(1,120000)', 'and the second answer to the later day');

-- Backfill: attempts closed before the migration are added once, on the day of their answers.
delete from public.activity_days where user_id = 'ea000000-0000-4000-8000-00000000000d';
update public.exam_attempts set activity_counted_at = null where id = current_setting('test.ad')::uuid;
select is(public.exam_backfill_activity(), 1, 'the backfill handles the uncounted old attempt of D');
select is((select row(d.answers, d.active_ms)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000d' and d.local_day = public.progress_local_day('ea000000-0000-4000-8000-00000000000d', now() - interval '3 days')),
  '(2,200000)', 'and credits it to the day of the answers, not the close');
select is(public.exam_backfill_activity(), 0, 'a second backfill is a no-op');

-- ===== Backfill (original): attempts
-- closed before the migration are added once =====
delete from public.activity_days where user_id = 'ea000000-0000-4000-8000-00000000000a';
update public.exam_attempts set activity_counted_at = null where id = current_setting('test.aa')::uuid;
select is(public.exam_backfill_activity(), 1, 'the backfill handles the one uncounted closed attempt');
select is((select row(d.answers, d.active_ms, d.xp)::text from public.activity_days d
           where d.user_id = 'ea000000-0000-4000-8000-00000000000a' and d.learning_path_id = current_setting('test.pa')::uuid),
  '(4,315000,0)', 'and rebuilds the same day');
select is(public.exam_backfill_activity(), 0, 'a second run finds nothing to do');
select is((select active_ms from public.activity_days where user_id = 'ea000000-0000-4000-8000-00000000000a'), 315000::bigint,
  'so nothing is double counted');

select * from finish();
rollback;
