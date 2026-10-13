begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

-- ===== Content: one EN core program, L1 (vocabulary + grammar: E1 mcq, E2 fill_blank, E3 translate) and
-- L2 (reading: E4 mcq), one learning item for review cards. Imported as the migration owner (rolled back).
select isnt(content_private.import_bundle($bundle$
{
  "bundle_version": 1,
  "git_sha": null,
  "sources": [
    {"id": "c8000000-0000-4000-8000-000000000001", "key": "src:c8-test", "title": "C8 test", "author_or_org": "Linguo", "url": null,
     "license": "own", "attribution_required": false,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "1111111111111111111111111111111111111111111111111111111111111111"}
  ],
  "programs": [
    {"id": "c8000000-0000-4000-8000-000000000002", "key": "en:program:c8-test", "source_id": "c8000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình thử"}, "description": {"vi": "Kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 900,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "2222222222222222222222222222222222222222222222222222222222222222"}
  ],
  "units": [
    {"id": "c8000000-0000-4000-8000-000000000003", "key": "en:unit:c8-test", "source_id": "c8000000-0000-4000-8000-000000000001",
     "program_id": "c8000000-0000-4000-8000-000000000002", "order_index": 1, "title": {"vi": "Đơn vị thử"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "3333333333333333333333333333333333333333333333333333333333333333"}
  ],
  "lessons": [
    {"id": "c8000000-0000-4000-8000-000000000011", "key": "en:lesson:c8-l1", "source_id": "c8000000-0000-4000-8000-000000000001",
     "unit_id": "c8000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Chào hỏi"}, "objectives": [{"vi": "Chào"}], "body": [{"type": "objective", "text": {"vi": "Chào"}}],
     "estimated_minutes": 5, "skills": ["vocabulary", "grammar"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "4444444444444444444444444444444444444444444444444444444444444444"},
    {"id": "c8000000-0000-4000-8000-000000000012", "key": "en:lesson:c8-l2", "source_id": "c8000000-0000-4000-8000-000000000001",
     "unit_id": "c8000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 2,
     "title": {"vi": "Đọc"}, "objectives": [{"vi": "Đọc"}], "body": [{"type": "objective", "text": {"vi": "Đọc"}}],
     "estimated_minutes": 5, "skills": ["reading"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "5555555555555555555555555555555555555555555555555555555555555555"}
  ],
  "lesson_prerequisites": [],
  "learning_items": [
    {"id": "c8000000-0000-4000-8000-000000000021", "key": "en:item:c8-hello", "source_id": "c8000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "hello"}, "back": {"meaning": {"vi": "xin chào"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666666"}
  ],
  "lesson_items": [
    {"lesson_id": "c8000000-0000-4000-8000-000000000011", "item_id": "c8000000-0000-4000-8000-000000000021", "position": 1, "role": "introduce"}
  ],
  "exercises": [
    {"id": "c8000000-0000-4000-8000-000000000031", "key": "en:exercise:c8-e1", "source_id": "c8000000-0000-4000-8000-000000000001",
     "lesson_id": "c8000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 1,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Chọn câu chào", "stem_lang": "vi", "options": [{"id": "o1", "text": "Hello", "lang": "en"}, {"id": "o2", "text": "Bye", "lang": "en"}], "shuffle": true},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "7777777777777777777777777777777777777777777777777777777777777777",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello."}, "display_answer": "Hello"}},
    {"id": "c8000000-0000-4000-8000-000000000032", "key": "en:exercise:c8-e2", "source_id": "c8000000-0000-4000-8000-000000000001",
     "lesson_id": "c8000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 2,
     "exercise_type": "fill_blank", "stage": "application", "answer_lang": "en", "difficulty": 1,
     "prompt": {"template": "Nice to  {{b1}} you.", "blanks": [{"id": "b1"}]},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "8888888888888888888888888888888888888888888888888888888888888888",
     "key_data": {"answer_key": {"blanks": {"b1": ["meet"]}},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "meet"}, "display_answer": "meet"}},
    {"id": "c8000000-0000-4000-8000-000000000033", "key": "en:exercise:c8-e3", "source_id": "c8000000-0000-4000-8000-000000000001",
     "lesson_id": "c8000000-0000-4000-8000-000000000011", "item_id": null, "order_index": 3,
     "exercise_type": "translate", "stage": "recall", "answer_lang": "en", "difficulty": 1,
     "prompt": {"source_text": "Xin chào, tôi là một người học tiếng Anh rất chăm chỉ và tôi muốn luyện tập mỗi ngày để có thể nói chuyện tự nhiên với bạn bè quốc tế trong công việc hằng ngày", "source_lang": "vi", "direction": "vi_to_target"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "9999999999999999999999999999999999999999999999999999999999999999",
     "key_data": {"answer_key": {"accepted": ["Hello"]},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Hello"}, "display_answer": "Hello"}},
    {"id": "c8000000-0000-4000-8000-000000000034", "key": "en:exercise:c8-e4", "source_id": "c8000000-0000-4000-8000-000000000001",
     "lesson_id": "c8000000-0000-4000-8000-000000000012", "item_id": null, "order_index": 1,
     "exercise_type": "mcq", "stage": "recognition", "answer_lang": "en", "difficulty": 1,
     "prompt": {"stem": "Đọc và chọn", "stem_lang": "vi", "options": [{"id": "o1", "text": "Yes", "lang": "en"}, {"id": "o2", "text": "No", "lang": "en"}], "shuffle": true},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
     "key_data": {"answer_key": {"correct_option_id": "o1"},
       "rubric": {"punctuation": "ignore", "diacritics": "strict", "ko_spacing": "lenient", "typo_tolerance": 0, "expand_contractions": true},
       "known_wrong": [], "explanation": {"vi": "Yes"}, "display_answer": "Yes"}}
  ]
}
$bundle$::jsonb), null, 'test bundle imports');

select set_config('test.l1', 'c8000000-0000-4000-8000-000000000011', true);
select set_config('test.l2', 'c8000000-0000-4000-8000-000000000012', true);
select set_config('test.e1', 'c8000000-0000-4000-8000-000000000031', true);
select set_config('test.e2', 'c8000000-0000-4000-8000-000000000032', true);
select set_config('test.e3', 'c8000000-0000-4000-8000-000000000033', true);
select set_config('test.e4', 'c8000000-0000-4000-8000-000000000034', true);

-- Runs and attempts are written directly as the owner (the lesson RPCs are covered by lesson_runs.test.sql).
create function public.c8_run(p_user uuid, p_path uuid, p_lesson uuid) returns uuid language sql volatile as $$
  insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue)
  values (p_user, p_path, p_lesson, 1, '{}') returning id;
$$;
create function public.c8_complete(p_run uuid) returns void language sql volatile as $$
  update public.lesson_runs set status = 'completed', completed_at = now(), summary_json = '{}' where id = p_run;
$$;
create function public.c8_attempt(
  p_user uuid, p_run uuid, p_ex uuid, p_verdict text, p_no integer default 1, p_after_reveal boolean default false,
  p_ms integer default 1000, p_client_at timestamptz default null, p_created_at timestamptz default now()
) returns void language sql volatile as $$
  insert into public.attempts (user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version,
    idempotency_key, payload_hash, response_json, verdict, is_correct, score, attempt_no, revealed, after_reveal, gave_up,
    feedback_json, stage, exercise_type, response_ms, hint_count, client_at, created_at)
  select p_user, r.learning_path_id, r.id, e.lesson_id, e.id, 1, 1, gen_random_uuid(), 'x', '{}'::jsonb,
    p_verdict, p_verdict <> 'incorrect', case p_verdict when 'correct' then 1 when 'almost' then 0.5 else 0 end,
    p_no, p_verdict <> 'incorrect' or p_no >= 2, p_after_reveal, false, '{}'::jsonb, e.stage, e.exercise_type, p_ms, 0,
    p_client_at, p_created_at
  from public.lesson_runs r, public.exercises e
  where r.id = p_run and e.id = p_ex;
$$;
create function public.c8_review(p_user uuid, p_path uuid, p_card uuid, p_kind text, p_rating smallint, p_ms integer)
returns void language sql volatile as $$
  insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, response_ms, local_day,
    idempotency_key, payload_hash)
  values (p_user, p_path, p_card, p_kind, case when p_kind = 'grade' then p_rating end, case when p_kind = 'grade' then p_rating end,
    p_ms, public.learning_user_today(p_user), gen_random_uuid(), 'x');
$$;
-- One activity_days row of user A's path on today + p_offset.
create function public.c8_day(p_user uuid, p_offset integer) returns public.activity_days language sql stable as $$
  select a.* from public.activity_days a
  where a.user_id = p_user and a.learning_path_id = (select p.current_learning_path_id from public.profiles p where p.id = p_user)
    and a.local_day = public.learning_user_today(p_user) + p_offset;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.pa', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[10,20,30,40,50,60,0]::smallint[])).id::text, true);
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select set_config('test.pb', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[10,10,10,10,10,10,10]::smallint[])).id::text, true);
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
select set_config('test.pc', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,0]::smallint[])).id::text, true);
reset role;

select set_config('test.a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('test.b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('test.c', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select set_config('test.today', public.learning_user_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::text, true);

-- ===== Privileges =====
select ok(not has_function_privilege('authenticated', 'public.progress_on_attempt()', 'execute'), 'attempt trigger function is not callable by clients');
select ok(not has_function_privilege('authenticated', 'public.progress_on_review()', 'execute'), 'review trigger function is not callable by clients');
select ok(not has_function_privilege('authenticated', 'public.progress_on_lesson_completed()', 'execute'), 'lesson trigger function is not callable by clients');
select ok(not has_function_privilege('authenticated', 'public.progress_streak(uuid, uuid)', 'execute'), 'progress_streak is internal');
select ok(not has_function_privilege('authenticated', 'public.progress_bump(uuid, uuid, date, bigint, integer, integer, integer, integer, integer)', 'execute'), 'progress_bump is internal');
select ok(not has_function_privilege('anon', 'public.get_progress_dashboard(uuid, integer)', 'execute'), 'anon cannot call the dashboard');
select ok(has_function_privilege('authenticated', 'public.get_progress_dashboard(uuid, integer)', 'execute'), 'authenticated can call the dashboard');
select ok(not has_table_privilege('authenticated', 'public.activity_days', 'insert'), 'clients cannot insert activity days');
select ok(not has_table_privilege('authenticated', 'public.user_badges', 'insert'), 'clients cannot insert badges');

-- ===== Attempt trigger: XP, correct_first, active time =====
select set_config('test.r1', public.c8_run(current_setting('test.a')::uuid, current_setting('test.pa')::uuid, current_setting('test.l1')::uuid)::text, true);
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e1')::uuid, 'correct', 1, false, 1500);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 2, 'first correct attempt earns 2 XP');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).correct_first, 1, 'first correct attempt counts in correct_first');
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e2')::uuid, 'almost', 1);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 3, 'first almost attempt earns 1 XP');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).correct_first, 1, 'almost is not counted as correct first');
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e1')::uuid, 'correct', 2);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 3, 'a second attempt earns nothing');
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e3')::uuid, 'incorrect', 1);
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e3')::uuid, 'correct', 1, true);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 3, 'an answer after the reveal earns nothing');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).active_ms, 5500::bigint, 'active time sums response_ms');
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e2')::uuid, 'incorrect', 1, false, 300000);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).active_ms, 125500::bigint, 'response_ms is capped at 120 s per answer');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).answers, 6, 'every attempt counts as an answer');

-- Client time: back-dated at most 7 days, never in the future.
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e4')::uuid, 'incorrect', 2, false, 1000, now() - interval '30 days');
select is((public.c8_day(current_setting('test.a')::uuid, -7)).answers, 1, 'a client_at 30 days back lands on today - 7');
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e4')::uuid, 'incorrect', 2, false, 1000, now() + interval '3 days');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).answers, 7, 'a future client_at lands on today');

-- ===== Lesson trigger =====
select public.c8_complete(current_setting('test.r1')::uuid);
-- R1 first attempts: correct, almost, incorrect, correct (after reveal), incorrect -> accuracy 0.6: no bonus.
select is((public.c8_day(current_setting('test.a')::uuid, 0)).lessons, 1, 'completing a run counts a lesson');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 13, 'a completed lesson earns 10 XP');
update public.lesson_runs set summary_json = '{"again": true}' where id = current_setting('test.r1')::uuid;
update public.lesson_runs set status = 'completed' where id = current_setting('test.r1')::uuid;
select is((public.c8_day(current_setting('test.a')::uuid, 0)).lessons, 1, 'updating a completed run counts nothing');
select set_config('test.r2', public.c8_run(current_setting('test.a')::uuid, current_setting('test.pa')::uuid, current_setting('test.l2')::uuid)::text, true);
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r2')::uuid, current_setting('test.e4')::uuid, 'correct', 1);
select public.c8_complete(current_setting('test.r2')::uuid);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 30, 'an accurate lesson earns 10 + 5 XP (after 2 for the answer)');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).lessons, 2, 'second lesson counted');

-- ===== Review trigger =====
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, due_at)
values (current_setting('test.a')::uuid, current_setting('test.pa')::uuid, 'c8000000-0000-4000-8000-000000000021', 'recognize', 'new', now());
select set_config('test.card', (select c.id::text from public.review_cards c where c.user_id = current_setting('test.a')::uuid), true);
select public.c8_review(current_setting('test.a')::uuid, current_setting('test.pa')::uuid, current_setting('test.card')::uuid, 'grade', 3::smallint, 2000);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 31, 'a recalled review earns 1 XP');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).reviews, 1, 'a graded review is counted');
select public.c8_review(current_setting('test.a')::uuid, current_setting('test.pa')::uuid, current_setting('test.card')::uuid, 'grade', 1::smallint, 500000);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).xp, 31, 'a forgotten review earns no XP');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).reviews, 2, 'a forgotten review is still counted');
select is((public.c8_day(current_setting('test.a')::uuid, 0)).active_ms, 249500::bigint, 'review time is capped at 120 s as well');
select public.c8_review(current_setting('test.a')::uuid, current_setting('test.pa')::uuid, null, 'postpone', null, null);
select is((public.c8_day(current_setting('test.a')::uuid, 0)).reviews, 2, 'a postpone log is not a review');

-- ===== Daily XP cap =====
insert into public.activity_days (user_id, learning_path_id, local_day, xp)
values (current_setting('test.a')::uuid, current_setting('test.pa')::uuid, current_setting('test.today')::date - 3, 299);
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e1')::uuid, 'correct', 1, false, 1000,
  ((current_setting('test.today')::date - 3)::timestamp + interval '12 hours') at time zone 'Asia/Ho_Chi_Minh');
select is((public.c8_day(current_setting('test.a')::uuid, -3)).xp, 300, 'XP stops at 300 per day');
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e1')::uuid, 'correct', 1, false, 1000,
  ((current_setting('test.today')::date - 3)::timestamp + interval '12 hours') at time zone 'Asia/Ho_Chi_Minh');
select is((public.c8_day(current_setting('test.a')::uuid, -3)).xp, 300, 'XP stays at 300');
select is((public.c8_day(current_setting('test.a')::uuid, -3)).answers, 2, 'answers still count past the cap');

-- ===== Dashboard: errors =====
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(format('select public.get_progress_dashboard(%L, 7)', current_setting('test.pa')), '42501', 'not_authenticated', 'dashboard needs a user');
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select throws_ok(format('select public.get_progress_dashboard(%L, 10)', current_setting('test.pa')), 'P0001', 'invalid_range', 'range 10 is rejected');
select throws_ok(format('select public.get_progress_dashboard(%L, null)', current_setting('test.pa')), 'P0001', 'invalid_range', 'null range is rejected');
select throws_ok(format('select public.get_progress_dashboard(%L, 7)', current_setting('test.pb')), 'P0001', 'path_not_found', 'another user''s path');
select throws_ok(format('select public.get_progress_dashboard(%L, 7)', gen_random_uuid()), 'P0001', 'path_not_found', 'unknown path');

-- More first attempts: 10 correct mcq + 1 correct application today, 2 mcq 10 days ago (previous 7-day window).
reset role;
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e1')::uuid, 'correct', 1)
from generate_series(1, 10);
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e2')::uuid, 'correct', 1);
select public.c8_attempt(current_setting('test.a')::uuid, current_setting('test.r1')::uuid, current_setting('test.e1')::uuid, 'correct', 1, false, 1000, null, now() - interval '10 days')
from generate_series(1, 2);
insert into public.skill_estimates (learning_path_id, skill, level_code, confidence, sample_size, source)
values (current_setting('test.pa')::uuid, 'vocabulary', 'a1', 'medium', 12, 'diagnostic');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.d', public.get_progress_dashboard(current_setting('test.pa')::uuid, 7)::text, true);

-- ===== Dashboard: activity and totals =====
select is(current_setting('test.d')::jsonb ->> 'today', current_setting('test.today'), 'today is the learner-local date');
select is(jsonb_array_length(current_setting('test.d')::jsonb -> 'days'), 7, '7 days for range 7');
select is(current_setting('test.d')::jsonb #>> '{days,6,date}', current_setting('test.today'), 'days end today');
select is(current_setting('test.d')::jsonb #>> '{days,0,date}', (current_setting('test.today')::date - 6)::text, 'days start 6 days ago');
select is((current_setting('test.d')::jsonb #>> '{days,6,minutes}')::integer, 4, 'minutes are whole active minutes');
select is((current_setting('test.d')::jsonb #>> '{days,6,goal_minutes}')::integer,
  (array[10,20,30,40,50,60,0])[extract(isodow from current_setting('test.today')::date)::integer], 'goal minutes come from weekly_minutes');
select is((current_setting('test.d')::jsonb #>> '{days,6,active}')::boolean, true, 'a day with a lesson is active');
select is((current_setting('test.d')::jsonb #>> '{days,3,active}')::boolean, false, 'the capped day (answers only) is not active');
select is((current_setting('test.d')::jsonb #>> '{days,3,xp}')::integer, 300, 'day XP is reported');
select is(current_setting('test.d')::jsonb #> '{totals,lessons_completed}', '2'::jsonb, 'lessons in range');
select is(current_setting('test.d')::jsonb #> '{totals,reviews_done}', '2'::jsonb, 'reviews in range');
select is(current_setting('test.d')::jsonb #> '{totals,application_done}', '1'::jsonb, 'correct first application answers');
select is(current_setting('test.d')::jsonb #> '{totals,week_goal_minutes}', '210'::jsonb, 'weekly goal is the sum of weekly_minutes');

-- ===== Dashboard: accuracy =====
select is(jsonb_array_length(current_setting('test.d')::jsonb -> 'skills'), 6, 'all six skills');
select is((select array_agg(s ->> 'skill') from jsonb_array_elements(current_setting('test.d')::jsonb -> 'skills') as s),
  array['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'], 'skills in contract order');
-- L1 first attempts in window: 1 + 0.5 + 0 + 1 + 0 (R1) + 2 capped-day + 10 + 1 = 15.5 over 18.
select is(current_setting('test.d')::jsonb #> '{skills,0,attempts}', '18'::jsonb, 'vocabulary attempts');
select is(current_setting('test.d')::jsonb #> '{skills,0,accuracy}', '0.8611'::jsonb, 'vocabulary accuracy = mean first-attempt score');
select is(current_setting('test.d')::jsonb #> '{skills,1,accuracy}', '0.8611'::jsonb, 'a lesson counts for each of its skills');
select is(current_setting('test.d')::jsonb #> '{skills,0,prev_attempts}', '2'::jsonb, 'previous window attempts');
select is(current_setting('test.d')::jsonb #> '{skills,0,prev_accuracy}', 'null'::jsonb, 'previous accuracy null below 10 attempts');
select is(current_setting('test.d')::jsonb #> '{skills,2,attempts}', '1'::jsonb, 'reading attempts');
select is(current_setting('test.d')::jsonb #> '{skills,2,accuracy}', 'null'::jsonb, 'accuracy null below 10 attempts');
select is(current_setting('test.d')::jsonb #> '{skills,3}', '{"skill": "listening", "attempts": 0, "accuracy": null, "prev_attempts": 0, "prev_accuracy": null}'::jsonb, 'skill without data');
select is((select array_agg(s ->> 'exercise_type') from jsonb_array_elements(current_setting('test.d')::jsonb -> 'exercise_types') as s),
  array['mcq', 'fill_blank', 'word_bank', 'translate', 'listen'], 'all five exercise types');
select is(current_setting('test.d')::jsonb #> '{exercise_types,0,attempts}', '14'::jsonb, 'mcq first attempts');

-- ===== Dashboard: estimates and mistakes =====
select is(jsonb_array_length(current_setting('test.d')::jsonb -> 'estimates'), 6, 'one estimate per skill');
select is(current_setting('test.d')::jsonb #>> '{estimates,0,source}', 'diagnostic', 'diagnostic outranks self report');
select is(current_setting('test.d')::jsonb #>> '{estimates,0,level_code}', 'a1', 'diagnostic level');
select is(jsonb_array_length(current_setting('test.d')::jsonb -> 'mistakes'), 3, 'three exercises answered wrong');
select is(current_setting('test.d')::jsonb #>> '{mistakes,0,prompt}', 'Đọc và chọn', 'most frequent mistake first (mcq stem)');
select is(current_setting('test.d')::jsonb #> '{mistakes,0,wrong_count}', '2'::jsonb, 'wrong count');
select is(current_setting('test.d')::jsonb #>> '{mistakes,0,lesson_title}', 'Đọc', 'lesson title');
select ok(exists (select 1 from jsonb_array_elements(current_setting('test.d')::jsonb -> 'mistakes') as m where m ->> 'prompt' = 'Nice to ___ you.'),
  'fill_blank template with blanks shown and whitespace collapsed');
select ok(exists (select 1 from jsonb_array_elements(current_setting('test.d')::jsonb -> 'mistakes') as m
  where char_length(m ->> 'prompt') = 120 and right(m ->> 'prompt', 1) = '…'), 'long prompt truncated to 120 characters');

-- ===== Motivation and badges =====
select is(current_setting('test.d')::jsonb #> '{motivation,new_badges}', '["first_lesson"]'::jsonb, 'first call awards first_lesson');
select is((current_setting('test.d')::jsonb #>> '{motivation,xp_total}')::integer,
  (select sum(a.xp)::integer from public.activity_days a where a.learning_path_id = current_setting('test.pa')::uuid), 'xp_total sums every day');
select set_config('test.d2', public.get_progress_dashboard(current_setting('test.pa')::uuid, 28)::text, true);
select is(current_setting('test.d2')::jsonb #> '{motivation,new_badges}', '[]'::jsonb, 'second call awards nothing new');
select is(jsonb_array_length(current_setting('test.d2')::jsonb #> '{motivation,badges}'), 1, 'badge listed once');
select is(jsonb_array_length(current_setting('test.d2')::jsonb -> 'days'), 28, '28 days for range 28');
select is(current_setting('test.d2')::jsonb #> '{skills,0,attempts}', '20'::jsonb, 'range 28 includes older attempts');

update public.user_preferences set show_motivation = false, analytics_opt_out = true where user_id = current_setting('test.a')::uuid;
select is(public.get_progress_dashboard(current_setting('test.pa')::uuid, 7) -> 'motivation', 'null'::jsonb, 'motivation is null when hidden');
select is((select show_motivation::text || analytics_opt_out::text from public.user_preferences), 'falsetrue', 'learner updates both preferences');

-- ===== Streak (user C): Sunday is a rest day; path created on Monday two weeks before this ISO week =====
reset role;
select set_config('test.ctoday', public.learning_user_today(current_setting('test.c')::uuid)::text, true);
select set_config('test.w', (current_setting('test.ctoday')::date - (extract(isodow from current_setting('test.ctoday')::date)::integer - 1))::text, true);
select set_config('test.dow', extract(isodow from current_setting('test.ctoday')::date)::text, true);
update public.learning_paths set created_at = (current_setting('test.w')::date - 14)::timestamp at time zone 'Asia/Ho_Chi_Minh'
where id = current_setting('test.pc')::uuid;
-- Two weeks ago: Mon-Sat active except Wednesday (grace). Last week: Mon-Sat active except Tuesday (grace).
-- This week: every day before today active; today not yet.
insert into public.activity_days (user_id, learning_path_id, local_day, lessons)
select current_setting('test.c')::uuid, current_setting('test.pc')::uuid, d, 1
from generate_series(current_setting('test.w')::date - 14, current_setting('test.ctoday')::date - 1, interval '1 day') as g(d)
where extract(isodow from d) <> 7
  and d::date not in (current_setting('test.w')::date - 12, current_setting('test.w')::date - 6);
select is((select row(s.current, s.best, s.grace_left)::text from public.progress_streak(current_setting('test.c')::uuid, current_setting('test.pc')::uuid) as s),
  row(10 + current_setting('test.dow')::integer - 1, 10 + current_setting('test.dow')::integer - 1, 1)::text,
  'rest days are skipped, one miss per week is forgiven, today not yet active keeps the streak');

insert into public.activity_days (user_id, learning_path_id, local_day, reviews)
values (current_setting('test.c')::uuid, current_setting('test.pc')::uuid, current_setting('test.ctoday')::date, 10);
select is((select s.current from public.progress_streak(current_setting('test.c')::uuid, current_setting('test.pc')::uuid) as s),
  10 + current_setting('test.dow')::integer, '10 reviews today make today active');

-- A second miss last week (Thursday) restarts the run after the first miss (Tuesday): Wed + Fri + Sat + this week.
delete from public.activity_days where user_id = current_setting('test.c')::uuid and local_day = current_setting('test.w')::date - 4;
select is((select row(s.current, s.best)::text from public.progress_streak(current_setting('test.c')::uuid, current_setting('test.pc')::uuid) as s),
  row(3 + current_setting('test.dow')::integer, greatest(7, 3 + current_setting('test.dow')::integer))::text,
  'a second miss in one ISO week breaks the streak; best keeps the longer run');

-- A miss this week uses this week's grace (only possible when today is not Monday).
delete from public.activity_days
where user_id = current_setting('test.c')::uuid and local_day = current_setting('test.w')::date and current_setting('test.dow')::integer >= 2;
select case when current_setting('test.dow')::integer >= 2 then (
  select is(row(s.current, s.grace_left)::text, row(2 + current_setting('test.dow')::integer, 0)::text, 'a miss this week uses its grace')
  from public.progress_streak(current_setting('test.c')::uuid, current_setting('test.pc')::uuid) as s)
  else pass('a miss this week uses its grace (not testable on a Monday)') end;

-- Weekly challenge and the streak badge through the dashboard.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
select set_config('test.dc', public.get_progress_dashboard(current_setting('test.pc')::uuid, 7)::text, true);
select is(current_setting('test.dc')::jsonb #> '{motivation,weekly_challenge,target_days}', '6'::jsonb, 'six scheduled days this week');
select is((current_setting('test.dc')::jsonb #>> '{motivation,weekly_challenge,done_days}')::integer,
  greatest(0, current_setting('test.dow')::integer - 2) + case when current_setting('test.dow')::integer < 7 then 1 else 0 end,
  'done days = active scheduled days this week');
select is(current_setting('test.dc')::jsonb #> '{motivation,weekly_challenge,completed_weeks}', '0'::jsonb, 'no past week fully done');
select ok(current_setting('test.dc')::jsonb #> '{motivation,new_badges}' ? 'streak_7', 'best streak >= 7 awards streak_7');

-- ===== RLS: A cannot read B's activity days or badges =====
reset role;
select set_config('test.rb', public.c8_run(current_setting('test.b')::uuid, current_setting('test.pb')::uuid, current_setting('test.l1')::uuid)::text, true);
select public.c8_complete(current_setting('test.rb')::uuid);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is(public.get_progress_dashboard(current_setting('test.pb')::uuid, 7) #> '{motivation,new_badges}', '["first_lesson"]'::jsonb, 'B earns first_lesson');
select is((select count(*)::integer from public.activity_days), 1, 'B reads own activity day');
select is((select count(*)::integer from public.user_badges), 1, 'B reads own badge');
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is((select count(*)::integer from public.activity_days where user_id = current_setting('test.b')::uuid), 0, 'A cannot read B''s activity days');
select is((select count(*)::integer from public.user_badges where user_id = current_setting('test.b')::uuid), 0, 'A cannot read B''s badges');
select throws_ok($$insert into public.user_badges (user_id, learning_path_id, badge_key) values (auth.uid(), current_setting('test.pa')::uuid, 'lessons_50')$$,
  '42501', null, 'clients cannot award themselves badges');

select * from finish();
rollback;
