begin;
create extension if not exists pgtap with schema extensions;
select plan(89);

-- ===== Content: one EN core program, one unit, L1 introduces I1..I5 and reuses R; L2 introduces R =====
-- Imported as the migration owner (rolled back with the test). No exercises, so a run completes at once.
select isnt(content_private.import_bundle($bundle$
{
  "bundle_version": 1,
  "git_sha": null,
  "sources": [
    {"id": "b5000000-0000-4000-8000-000000000001", "key": "src:b5-test", "title": "B5 test", "author_or_org": "Linguo", "url": null,
     "license": "own", "attribution_required": false,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "1111111111111111111111111111111111111111111111111111111111111111"}
  ],
  "programs": [
    {"id": "b5000000-0000-4000-8000-000000000002", "key": "en:program:b5-test-core", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "title": {"vi": "Chương trình thử"}, "description": {"vi": "Dùng cho kiểm thử"}, "kind": "core", "goal_types": [],
     "level_from": "pre_a1", "level_to": "a1", "order_index": 900,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "2222222222222222222222222222222222222222222222222222222222222222"}
  ],
  "units": [
    {"id": "b5000000-0000-4000-8000-000000000003", "key": "en:unit:b5-test-unit", "source_id": "b5000000-0000-4000-8000-000000000001",
     "program_id": "b5000000-0000-4000-8000-000000000002", "order_index": 1, "title": {"vi": "Đơn vị thử"},
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "3333333333333333333333333333333333333333333333333333333333333333"}
  ],
  "lessons": [
    {"id": "b5000000-0000-4000-8000-000000000011", "key": "en:lesson:b5-test-l1", "source_id": "b5000000-0000-4000-8000-000000000001",
     "unit_id": "b5000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 1,
     "title": {"vi": "Bài một"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "4444444444444444444444444444444444444444444444444444444444444444"},
    {"id": "b5000000-0000-4000-8000-000000000012", "key": "en:lesson:b5-test-l2", "source_id": "b5000000-0000-4000-8000-000000000001",
     "unit_id": "b5000000-0000-4000-8000-000000000003", "language_code": "en", "level_code": "pre_a1", "order_index": 2,
     "title": {"vi": "Bài hai"}, "objectives": [{"vi": "Kiểm thử"}],
     "body": [{"type": "objective", "text": {"vi": "Kiểm thử"}}],
     "estimated_minutes": 5, "skills": ["vocabulary"],
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "5555555555555555555555555555555555555555555555555555555555555555"}
  ],
  "lesson_prerequisites": [],
  "learning_items": [
    {"id": "b5000000-0000-4000-8000-000000000021", "key": "en:item:b5-i1", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "one"}, "back": {"meaning": {"vi": "một"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666661"},
    {"id": "b5000000-0000-4000-8000-000000000022", "key": "en:item:b5-i2", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "two"}, "back": {"meaning": {"vi": "hai"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666662"},
    {"id": "b5000000-0000-4000-8000-000000000023", "key": "en:item:b5-i3", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "three"}, "back": {"meaning": {"vi": "ba"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666663"},
    {"id": "b5000000-0000-4000-8000-000000000024", "key": "en:item:b5-i4", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "four"}, "back": {"meaning": {"vi": "bốn"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666664"},
    {"id": "b5000000-0000-4000-8000-000000000025", "key": "en:item:b5-i5", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "five"}, "back": {"meaning": {"vi": "năm"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666665"},
    {"id": "b5000000-0000-4000-8000-000000000029", "key": "en:item:b5-reused", "source_id": "b5000000-0000-4000-8000-000000000001",
     "language_code": "en", "item_type": "vocab", "level_code": "pre_a1", "difficulty": 1, "skill_tags": ["vocabulary"],
     "front": {"text": "zero"}, "back": {"meaning": {"vi": "không"}, "examples": []}, "audio_path": null,
     "status": "published", "is_demo": true, "reviewed_by": null, "reviewed_at": null,
     "content_hash": "6666666666666666666666666666666666666666666666666666666666666669"}
  ],
  "lesson_items": [
    {"lesson_id": "b5000000-0000-4000-8000-000000000011", "item_id": "b5000000-0000-4000-8000-000000000021", "position": 1, "role": "introduce"},
    {"lesson_id": "b5000000-0000-4000-8000-000000000011", "item_id": "b5000000-0000-4000-8000-000000000022", "position": 2, "role": "introduce"},
    {"lesson_id": "b5000000-0000-4000-8000-000000000011", "item_id": "b5000000-0000-4000-8000-000000000023", "position": 3, "role": "introduce"},
    {"lesson_id": "b5000000-0000-4000-8000-000000000011", "item_id": "b5000000-0000-4000-8000-000000000024", "position": 4, "role": "introduce"},
    {"lesson_id": "b5000000-0000-4000-8000-000000000011", "item_id": "b5000000-0000-4000-8000-000000000025", "position": 5, "role": "introduce"},
    {"lesson_id": "b5000000-0000-4000-8000-000000000011", "item_id": "b5000000-0000-4000-8000-000000000029", "position": 6, "role": "reuse"},
    {"lesson_id": "b5000000-0000-4000-8000-000000000012", "item_id": "b5000000-0000-4000-8000-000000000029", "position": 1, "role": "introduce"}
  ],
  "exercises": []
}
$bundle$::jsonb), null, 'test bundle imports');

select set_config('test.l1', 'b5000000-0000-4000-8000-000000000011', true);
select set_config('test.i1', 'b5000000-0000-4000-8000-000000000021', true);
select set_config('test.i2', 'b5000000-0000-4000-8000-000000000022', true);
select set_config('test.i3', 'b5000000-0000-4000-8000-000000000023', true);
select set_config('test.i4', 'b5000000-0000-4000-8000-000000000024', true);
select set_config('test.i5', 'b5000000-0000-4000-8000-000000000025', true);
select set_config('test.reused', 'b5000000-0000-4000-8000-000000000029', true);

-- Grades with the given signals and a fresh (or given) idempotency key. Rolled back with the test.
-- The scheduling tests below grade cards regardless of their due time (enrolled cards are due tomorrow, and
-- some cards are graded twice in a row), so this helper first makes the card due now, as the owner. The due
-- guard itself is tested with b5_grade_strict.
create function public.b5_grade(p_card text, p_rating integer, p_confidence integer default null, p_hints integer default 0, p_key text default null)
returns jsonb
language plpgsql
volatile
security definer
as $$
begin
  update public.review_cards set due_at = least(due_at, now()) where id = p_card::uuid;
  return public.grade_review(p_card::uuid, p_rating::smallint, p_confidence::smallint, 1500, p_hints::smallint,
    coalesce(p_key::uuid, gen_random_uuid()), now());
end;
$$;
grant execute on function public.b5_grade(text, integer, integer, integer, text) to authenticated, anon;

-- Grades exactly as a client would (no due-time help).
create function public.b5_grade_strict(p_card text, p_rating integer, p_key text default null)
returns jsonb
language sql
volatile
as $$
  select public.grade_review(p_card::uuid, p_rating::smallint, null, 1500, 0::smallint,
    coalesce(p_key::uuid, gen_random_uuid()), now());
$$;

-- Card id of a user's item/direction (run as the owner, bypassing RLS).
create function public.b5_card(p_user text, p_item text, p_direction text)
returns text
language sql
stable
as $$
  select c.id::text from public.review_cards c
  where c.user_id = p_user::uuid and c.learning_item_id = p_item::uuid and c.direction = p_direction;
$$;

-- A past successful (or failed) grade written straight into the log, to simulate earlier local days.
create function public.b5_past_grade(p_card text, p_rating integer, p_days_ago integer, p_confidence integer default null)
returns void
language sql
volatile
as $$
  insert into public.review_logs (
    user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, confidence, response_ms, hint_count,
    state_before, state_after, local_day, idempotency_key, payload_hash, result, client_at, created_at
  )
  select c.user_id, c.learning_path_id, c.id, 'grade', p_rating, p_rating, p_confidence, 1500, 0,
    '{}'::jsonb, '{}'::jsonb, public.learning_user_today(c.user_id) - p_days_ago, gen_random_uuid(), 'simulated', '{}'::jsonb,
    now() - make_interval(days => p_days_ago), now() - make_interval(days => p_days_ago)
  from public.review_cards c where c.id = p_card::uuid;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}');
update public.profiles set timezone = 'Asia/Seoul' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

-- ===== Enrolment through complete_lesson =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'A creates an EN path');
select set_config('test.a_path', (select id::text from public.learning_paths), true);
select set_config('test.a_run', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.a_path')::uuid) ->> 'id', true);
select is((select count(*)::int from public.review_cards), 0, 'no cards before the lesson is completed');
select set_config('test.a_summary', public.complete_lesson(current_setting('test.a_run')::uuid)::text, true);
select is((select count(*)::int from public.review_cards), 10, 'completing L1 creates 2 cards per introduced item');
select is((select count(*)::int from public.review_cards where direction = 'recognize'), 5, 'five recognize cards');
select is((select count(*)::int from public.review_cards where direction = 'recall'), 5, 'five recall cards');
select is((select count(*)::int from public.review_cards where learning_item_id = current_setting('test.reused')::uuid), 0, 'a reused item gets no card');
select is((select count(*)::int from public.review_cards where fsrs_state = 'new' and reps = 0 and stability is null and difficulty is null), 10, 'cards start new');
select is((select count(distinct due_at)::int from public.review_cards), 1, 'all new cards share one due time');
select is((select min(due_at) from public.review_cards), (current_setting('test.a_summary')::jsonb ->> 'next_review_at')::timestamptz, 'cards are due at next_review_at');
select is((select min(due_at) from public.review_cards),
  (((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp) at time zone 'Asia/Ho_Chi_Minh',
  'due at the start of tomorrow, local time');
select is((select count(*)::int from public.review_cards where learning_path_id = current_setting('test.a_path')::uuid), 10, 'cards belong to the path');
select lives_ok(format('select public.complete_lesson(%L)', current_setting('test.a_run')), 'completing again is idempotent');
select is((select count(*)::int from public.review_cards), 10, 'no duplicate cards');
select throws_ok($$insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, due_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.a_path')::uuid, current_setting('test.reused')::uuid, 'recall', now())$$,
  '42501', null, 'no direct card insert');
select throws_ok(format('select public.srs_enroll_lesson(%L, %L, %L)', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.a_path'), current_setting('test.l1')),
  '42501', null, 'srs_enroll_lesson is not callable by clients');
select throws_ok(format('select public.srs_update_mastery(%L, %L, %L)', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.a_path'), current_setting('test.i1')),
  '42501', null, 'srs_update_mastery is not callable by clients');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select lives_ok($$select public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[])$$, 'B creates an EN path');
select set_config('test.b_path', (select id::text from public.learning_paths), true);
select set_config('test.b_run', public.start_lesson(current_setting('test.l1')::uuid, current_setting('test.b_path')::uuid) ->> 'id', true);
select lives_ok(format('select public.complete_lesson(%L)', current_setting('test.b_run')), 'B completes L1');
select is((select count(*)::int from public.review_cards), 10, 'B sees only its own 10 cards');
select is((select min(due_at) from public.review_cards),
  (((now() at time zone 'Asia/Seoul')::date + 1)::timestamp) at time zone 'Asia/Seoul',
  'B''s cards are due at the start of tomorrow in Asia/Seoul');

reset role;
select set_config('test.b_i1_rec', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i1'), 'recognize'), true);
select set_config('test.b_i1_rcl', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i1'), 'recall'), true);
select set_config('test.b_i2_rec', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i2'), 'recognize'), true);
select set_config('test.b_i3_rec', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i3'), 'recognize'), true);
select set_config('test.b_i3_rcl', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i3'), 'recall'), true);
select set_config('test.b_i4_rec', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i4'), 'recognize'), true);
select set_config('test.b_i4_rcl', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i4'), 'recall'), true);
select set_config('test.b_i5_rec', public.b5_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.i5'), 'recognize'), true);
update public.review_cards set suspended_at = now() where id = current_setting('test.b_i5_rec')::uuid;

-- ===== Grading (user B) =====
set local role authenticated;
select set_config('test.r', public.b5_grade(current_setting('test.b_i1_rec'), 3, null, 0, 'b5000000-0000-4000-8000-0000000000a1')::text, true);
select is(current_setting('test.r')::jsonb ->> 'state', 'learning', 'new + Good -> learning');
select is((current_setting('test.r')::jsonb ->> 'interval_minutes')::int, 10, 'new + Good -> second learning step (10 min)');
select is((current_setting('test.r')::jsonb ->> 'due_at')::timestamptz, now() + interval '10 minutes', 'learning steps are not snapped to a day');
select is((current_setting('test.r')::jsonb ->> 'rating_effective')::int, 3, 'rating kept');
select is(current_setting('test.r')::jsonb ->> 'item_status', 'learning', 'item status follows the card');
select is((current_setting('test.r')::jsonb ->> 'newly_mastered')::boolean, false, 'not mastered');
select is((current_setting('test.r')::jsonb ->> 'replayed')::boolean, false, 'first call is not a replay');
select is(current_setting('test.r')::jsonb ->> 'card_id', current_setting('test.b_i1_rec'), 'result carries the card id');
select is((select fsrs_state || '/' || reps || '/' || (last_review_at = now()) from public.review_cards where id = current_setting('test.b_i1_rec')::uuid),
  'learning/1/true', 'card updated (state, reps, last_review_at)');
select is((select stability is not null and difficulty is not null from public.review_cards where id = current_setting('test.b_i1_rec')::uuid), true, 'card gets stability and difficulty');
select is((select state_before ->> 'state' || '>' || (state_after ->> 'state') from public.review_logs where id = (current_setting('test.r')::jsonb ->> 'log_id')::uuid),
  'new>learning', 'log keeps state before and after');
select is((select local_day from public.review_logs where id = (current_setting('test.r')::jsonb ->> 'log_id')::uuid),
  (now() at time zone 'Asia/Seoul')::date, 'log has the local day');
select is((select kind || '/' || rating_raw || '/' || rating_effective || '/' || response_ms || '/' || hint_count from public.review_logs where id = (current_setting('test.r')::jsonb ->> 'log_id')::uuid),
  'grade/3/3/1500/0', 'log row');

-- replay / conflict
select set_config('test.r2', public.b5_grade(current_setting('test.b_i1_rec'), 3, null, 0, 'b5000000-0000-4000-8000-0000000000a1')::text, true);
select is((current_setting('test.r2')::jsonb ->> 'replayed')::boolean, true, 'same key + payload replays');
select is(current_setting('test.r2')::jsonb ->> 'log_id', current_setting('test.r')::jsonb ->> 'log_id', 'replay returns the stored log id');
select is(current_setting('test.r2')::jsonb - 'replayed', current_setting('test.r')::jsonb - 'replayed', 'replay returns the stored result');
select is((select reps from public.review_cards where id = current_setting('test.b_i1_rec')::uuid), 1, 'replay does not grade again');
select throws_ok(format('select public.b5_grade(%L, 4, null, 0, %L)', current_setting('test.b_i1_rec'), 'b5000000-0000-4000-8000-0000000000a1'),
  'P0001', 'idempotency_conflict', 'same key, other rating');
select throws_ok(format('select public.b5_grade(%L, 3, null, 0, %L)', current_setting('test.b_i2_rec'), 'b5000000-0000-4000-8000-0000000000a1'),
  'P0001', 'idempotency_conflict', 'same key, other card');
select is((select count(*)::int from public.review_logs where idempotency_key = 'b5000000-0000-4000-8000-0000000000a1'), 1, 'one log per key');

-- Again from new, Easy from new
select set_config('test.r', public.b5_grade(current_setting('test.b_i1_rcl'), 1)::text, true);
select is(current_setting('test.r')::jsonb ->> 'state', 'learning', 'new + Again -> learning');
select is((current_setting('test.r')::jsonb ->> 'interval_minutes')::int, 1, 'new + Again -> first learning step (1 min)');
select set_config('test.r', public.b5_grade(current_setting('test.b_i2_rec'), 4)::text, true);
select is(current_setting('test.r')::jsonb ->> 'state', 'review', 'new + Easy -> review');
select ok((current_setting('test.r')::jsonb ->> 'interval_minutes')::int >= 1440, 'Easy schedules at least a day');
select is(((current_setting('test.r')::jsonb ->> 'due_at')::timestamptz at time zone 'Asia/Seoul')::time, '00:00'::time, 'day intervals snap to local midnight');
select ok((current_setting('test.r')::jsonb ->> 'due_at')::timestamptz > now(), 'review due in the future');

-- rating adjustment
select is((public.b5_grade(current_setting('test.b_i3_rec'), 4, null, 1) ->> 'rating_effective')::int, 2, 'a hint caps Easy at Hard');
select is((public.b5_grade(current_setting('test.b_i3_rcl'), 3, 1, 0) ->> 'rating_effective')::int, 2, 'Good with low confidence -> Hard');
select is((public.b5_grade(current_setting('test.b_i4_rec'), 1, 1, 2) ->> 'rating_effective')::int, 1, 'Again stays Again');
select is((public.b5_grade(current_setting('test.b_i4_rcl'), 4, 3, 0) ->> 'rating_effective')::int, 4, 'Easy with high confidence kept');
select is((select rating_raw || '>' || rating_effective || '/' || hint_count from public.review_logs where card_id = current_setting('test.b_i3_rec')::uuid),
  '4>2/1', 'log keeps raw and effective rating');

-- errors
select throws_ok(format('select public.b5_grade(%L, 5)', current_setting('test.b_i3_rec')), 'P0001', 'invalid_rating', 'rating 5 refused');
select throws_ok(format('select public.b5_grade(%L, 0)', current_setting('test.b_i3_rec')), 'P0001', 'invalid_rating', 'rating 0 refused');
select throws_ok(format('select public.b5_grade(%L, 3, 4)', current_setting('test.b_i3_rec')), 'P0001', 'invalid_rating', 'confidence 4 refused');
select throws_ok(format('select public.b5_grade(%L, 3)', current_setting('test.b_i5_rec')), 'P0001', 'card_suspended', 'suspended card');
select throws_ok(format('select public.b5_grade(%L, 3)', gen_random_uuid()), 'P0001', 'card_not_found', 'unknown card');
select throws_ok($$update public.review_cards set due_at = now()$$, '42501', null, 'no direct card update');
select throws_ok($$delete from public.review_logs$$, '42501', null, 'no direct log delete');

-- another user's card
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select throws_ok(format('select public.b5_grade(%L, 3)', current_setting('test.b_i2_rec')), 'P0001', 'card_not_found', 'B''s card is not found for A');
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(format('select public.b5_grade(%L, 3)', current_setting('test.b_i2_rec')), '42501', 'not_authenticated', 'no user');

-- ===== Mastery (user A); earlier local days are simulated with past log rows written as the owner =====
reset role;
select set_config('test.a_i1_rec', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i1'), 'recognize'), true);
select set_config('test.a_i1_rcl', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i1'), 'recall'), true);
select set_config('test.a_i2_rec', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i2'), 'recognize'), true);
select set_config('test.a_i2_rcl', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i2'), 'recall'), true);
select set_config('test.a_i3_rec', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i3'), 'recognize'), true);
select set_config('test.a_i3_rcl', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i3'), 'recall'), true);
select set_config('test.a_i4_rec', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i4'), 'recognize'), true);
select set_config('test.a_i4_rcl', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i4'), 'recall'), true);
select set_config('test.a_i5_rec', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i5'), 'recognize'), true);
select set_config('test.a_i5_rcl', public.b5_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.i5'), 'recall'), true);

-- Every recall card: a mature review card (stability 30 days) last seen two days ago; I4's is weaker (10 days).
update public.review_cards
set fsrs_state = 'review', stability = 30, difficulty = 5, reps = 1, scheduled_days = 30,
    last_review_at = now() - interval '2 days', due_at = now() + interval '28 days'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and direction = 'recall';
update public.review_cards set stability = 10 where id = current_setting('test.a_i4_rcl')::uuid;

-- I1: recall success 2 days ago, recognize success yesterday, recognize Good today -> mastered.
select public.b5_past_grade(current_setting('test.a_i1_rcl'), 3, 2);
select public.b5_past_grade(current_setting('test.a_i1_rec'), 3, 1);
-- I2: three successes but only two distinct days (two of them yesterday).
select public.b5_past_grade(current_setting('test.a_i2_rcl'), 3, 1);
select public.b5_past_grade(current_setting('test.a_i2_rec'), 4, 1);
-- I3: three days, but never a success in the recall direction.
select public.b5_past_grade(current_setting('test.a_i3_rec'), 3, 2);
select public.b5_past_grade(current_setting('test.a_i3_rec'), 3, 1);
-- I4: like I1 but the recall card is not stable enough.
select public.b5_past_grade(current_setting('test.a_i4_rcl'), 3, 2);
select public.b5_past_grade(current_setting('test.a_i4_rec'), 3, 1);
-- I5: like I1 but today's answer is low-confidence (Good -> Hard is not a success).
select public.b5_past_grade(current_setting('test.a_i5_rcl'), 3, 2);
select public.b5_past_grade(current_setting('test.a_i5_rec'), 3, 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.r', public.b5_grade(current_setting('test.a_i1_rec'), 3)::text, true);
select is((current_setting('test.r')::jsonb ->> 'newly_mastered')::boolean, true, '3 successes, 3 days, recall, stability >= 21 -> newly mastered');
select is(current_setting('test.r')::jsonb ->> 'item_status', 'mastered', 'item status mastered');
select isnt((select mastered_at from public.review_item_mastery where learning_item_id = current_setting('test.i1')::uuid), null, 'mastered_at set');
select set_config('test.r', public.b5_grade(current_setting('test.a_i1_rec'), 3)::text, true);
select is((current_setting('test.r')::jsonb ->> 'newly_mastered')::boolean, false, 'already mastered is not newly mastered');
select is(current_setting('test.r')::jsonb ->> 'item_status', 'mastered', 'still mastered');

select is((public.b5_grade(current_setting('test.a_i2_rec'), 3) ->> 'item_status') <> 'mastered', true, 'only two local days -> not mastered');
select is((public.b5_grade(current_setting('test.a_i3_rec'), 3) ->> 'item_status') <> 'mastered', true, 'no recall success -> not mastered');
select is((public.b5_grade(current_setting('test.a_i4_rec'), 3) ->> 'item_status') <> 'mastered', true, 'recall stability < 21 -> not mastered');
select is((public.b5_grade(current_setting('test.a_i5_rec'), 3, 1) ->> 'item_status') <> 'mastered', true, 'low confidence today -> not mastered');
select is((select count(*)::int from public.review_item_mastery where mastered_at is not null), 1, 'only I1 is mastered');

-- An Again in any direction drops mastery; a later success alone does not restore it.
select set_config('test.r', public.b5_grade(current_setting('test.a_i1_rcl'), 1)::text, true);
select is(current_setting('test.r')::jsonb ->> 'item_status', 'relearning', 'Again on a review card -> relearning, not mastered');
select is((select mastered_at from public.review_item_mastery where learning_item_id = current_setting('test.i1')::uuid), null, 'Again clears mastered_at');
select is((select lapses from public.review_cards where id = current_setting('test.a_i1_rcl')::uuid), 1, 'a lapse is counted');
select is((public.b5_grade(current_setting('test.a_i1_rec'), 4) ->> 'item_status') <> 'mastered', true, 'successes before the Again no longer count');

-- ===== Queue rules: only due cards of an active path with a published item (user A) =====
-- Cards are reset as the owner; A's local day is Asia/Ho_Chi_Minh.
reset role;
select set_config('test.a_end', ((public.learning_user_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')::text, true);
update public.review_cards set fsrs_state = 'review', stability = 8, difficulty = 5, reps = 1, scheduled_days = 8,
    last_review_at = now() - interval '8 days', due_at = now() - interval '1 hour'
where id = current_setting('test.a_i3_rcl')::uuid;
update public.review_cards set fsrs_state = 'review', due_at = current_setting('test.a_end')::timestamptz
where id = current_setting('test.a_i2_rcl')::uuid;
update public.review_cards set fsrs_state = 'review', due_at = current_setting('test.a_end')::timestamptz - interval '1 second'
where id = current_setting('test.a_i4_rcl')::uuid;
update public.review_cards set fsrs_state = 'learning', step = 0, due_at = now() + interval '1 minute'
where id = current_setting('test.a_i2_rec')::uuid;
update public.review_cards set fsrs_state = 'learning', step = 0, due_at = now()
where id = current_setting('test.a_i3_rec')::uuid;
-- A freshly enrolled card: new, due at the start of the next local day.
update public.review_cards set fsrs_state = 'new', step = 0, stability = null, difficulty = null, reps = 0, last_review_at = null,
    due_at = current_setting('test.a_end')::timestamptz
where id = current_setting('test.a_i5_rcl')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(format('select public.b5_grade_strict(%L, 4, %L)', current_setting('test.a_i3_rcl'), 'b5000000-0000-4000-8000-0000000000c1'),
  'an overdue review card is graded');
select throws_ok(format('select public.b5_grade_strict(%L, 4)', current_setting('test.a_i3_rcl')), 'P0001', 'card_not_due',
  'grading the same card again before it is due is refused');
select is((select reps from public.review_cards where id = current_setting('test.a_i3_rcl')::uuid), 2, 'the refused grade changed nothing');
select is((public.b5_grade_strict(current_setting('test.a_i3_rcl'), 4, 'b5000000-0000-4000-8000-0000000000c1') ->> 'replayed')::boolean, true,
  'a replay of the applied grade still succeeds after the card moved on');
select throws_ok(format('select public.b5_grade_strict(%L, 3)', current_setting('test.a_i2_rcl')), 'P0001', 'card_not_due',
  'a review card due at the end of the local day is not due today');
select lives_ok(format('select public.b5_grade_strict(%L, 3)', current_setting('test.a_i4_rcl')), 'a review card due later today is graded');
select throws_ok(format('select public.b5_grade_strict(%L, 3)', current_setting('test.a_i2_rec')), 'P0001', 'card_not_due',
  'a learning card waits for its minute');
select lives_ok(format('select public.b5_grade_strict(%L, 3)', current_setting('test.a_i3_rec')), 'a learning card due now is graded');
select throws_ok(format('select public.b5_grade_strict(%L, 3)', current_setting('test.a_i5_rcl')), 'P0001', 'card_not_due',
  'a card enrolled today is due tomorrow');

-- Paused or archived path, unpublished item.
reset role;
update public.review_cards set due_at = now() - interval '1 hour' where id = current_setting('test.a_i5_rcl')::uuid;
update public.learning_paths set status = 'paused' where id = current_setting('test.a_path')::uuid;
set local role authenticated;
select throws_ok(format('select public.b5_grade_strict(%L, 4)', current_setting('test.a_i5_rcl')), 'P0001', 'path_not_active',
  'cards of a paused path cannot be graded');
reset role;
update public.learning_paths set status = 'archived' where id = current_setting('test.a_path')::uuid;
set local role authenticated;
select throws_ok(format('select public.b5_grade_strict(%L, 4)', current_setting('test.a_i5_rcl')), 'P0001', 'path_not_active',
  'cards of an archived path cannot be graded');
reset role;
update public.learning_paths set status = 'active' where id = current_setting('test.a_path')::uuid;
update public.learning_items set status = 'archived' where id = current_setting('test.i5')::uuid;
set local role authenticated;
select throws_ok(format('select public.b5_grade_strict(%L, 4)', current_setting('test.a_i5_rcl')), 'P0001', 'card_not_found',
  'cards of an unpublished item cannot be graded');

-- ===== Rate limit: 60 grades within 60 s (user B) =====
reset role;
select public.b5_past_grade(current_setting('test.b_i2_rec'), 3, 0) from generate_series(1, 60);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select throws_ok(format('select public.b5_grade(%L, 3)', current_setting('test.b_i3_rec')), 'P0001', 'rate_limited', 'more than 60 grades in 60 s');
-- a replay of an earlier grade is still answered
select is((public.b5_grade(current_setting('test.b_i1_rec'), 3, null, 0, 'b5000000-0000-4000-8000-0000000000a1') ->> 'replayed')::boolean, true, 'replays are not rate limited');

select * from finish();
rollback;
