begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

-- ===== Content: one EN core program with one lesson introducing 40 vocab items (positions 1..40) =====
-- Imported as the migration owner; the import archives seeded content absent from this bundle (rolled back).
create function public.b4_id(n integer) returns uuid language sql immutable as $$
  select ('b4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function public.b4_hash(t text) returns text language sql immutable as $$
  select md5(t) || md5(t || '#');
$$;

select isnt(content_private.import_bundle(jsonb_build_object(
  'bundle_version', 1,
  'git_sha', null,
  'sources', jsonb_build_array(jsonb_build_object(
    'id', public.b4_id(901), 'key', 'src:b4-test', 'title', 'B4 test', 'author_or_org', 'Linguo', 'url', null,
    'license', 'own', 'attribution_required', false, 'status', 'published', 'is_demo', true,
    'reviewed_by', null, 'reviewed_at', null, 'content_hash', public.b4_hash('src'))),
  'programs', jsonb_build_array(jsonb_build_object(
    'id', public.b4_id(902), 'key', 'en:program:b4-test', 'source_id', public.b4_id(901), 'language_code', 'en',
    'title', '{"vi": "Chương trình thử"}'::jsonb, 'description', '{"vi": "Kiểm thử"}'::jsonb, 'kind', 'core',
    'goal_types', '[]'::jsonb, 'level_from', 'pre_a1', 'level_to', 'a1', 'order_index', 900,
    'status', 'published', 'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', public.b4_hash('prog'))),
  'units', jsonb_build_array(jsonb_build_object(
    'id', public.b4_id(903), 'key', 'en:unit:b4-test', 'source_id', public.b4_id(901), 'program_id', public.b4_id(902),
    'order_index', 1, 'title', '{"vi": "Đơn vị thử"}'::jsonb,
    'status', 'published', 'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', public.b4_hash('unit'))),
  'lessons', jsonb_build_array(jsonb_build_object(
    'id', public.b4_id(904), 'key', 'en:lesson:b4-test', 'source_id', public.b4_id(901), 'unit_id', public.b4_id(903),
    'language_code', 'en', 'level_code', 'pre_a1', 'order_index', 1, 'title', '{"vi": "Từ vựng"}'::jsonb,
    'objectives', '[{"vi": "Học từ"}]'::jsonb, 'body', '[{"type": "objective", "text": {"vi": "Học từ"}}]'::jsonb,
    'estimated_minutes', 5, 'skills', '["vocabulary"]'::jsonb,
    'status', 'published', 'is_demo', true, 'reviewed_by', null, 'reviewed_at', null, 'content_hash', public.b4_hash('lesson'))),
  'lesson_prerequisites', '[]'::jsonb,
  'learning_items', (select jsonb_agg(jsonb_build_object(
    'id', public.b4_id(n), 'key', 'en:item:b4-test-' || n, 'source_id', public.b4_id(901), 'language_code', 'en',
    'item_type', 'vocab', 'level_code', 'pre_a1', 'difficulty', 1, 'skill_tags', '["vocabulary"]'::jsonb,
    'front', jsonb_build_object('text', 'word' || n), 'back', jsonb_build_object('meaning', jsonb_build_object('vi', 'từ ' || n), 'examples', '[]'::jsonb),
    'audio_path', null, 'status', 'published', 'is_demo', true, 'reviewed_by', null, 'reviewed_at', null,
    'content_hash', public.b4_hash('item' || n)) order by n) from generate_series(1, 40) as n),
  'lesson_items', (select jsonb_agg(jsonb_build_object('lesson_id', public.b4_id(904), 'item_id', public.b4_id(n), 'position', n, 'role', 'introduce') order by n)
    from generate_series(1, 40) as n),
  'exercises', '[]'::jsonb
)), null, 'test bundle imports');

-- Cards are created directly as the owner (complete_lesson enrolment is covered by reviews_grade).
create function public.b4_card(
  p_user uuid, p_path uuid, p_item integer, p_dir text, p_state text, p_due timestamptz,
  p_stability double precision default null, p_last timestamptz default null
) returns uuid language sql volatile as $$
  insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, stability, difficulty,
    due_at, last_review_at, scheduled_days, reps)
  values (p_user, p_path, public.b4_id(p_item), p_dir, p_state,
    case when p_state = 'new' then null else coalesce(p_stability, 5) end,
    case when p_state = 'new' then null else 5 end,
    p_due, case when p_state = 'new' then null else coalesce(p_last, p_due - interval '3 days') end,
    case when p_state = 'review' then 3 else 0 end, case when p_state = 'new' then 0 else 2 end)
  returning id;
$$;

-- A grade log written as the owner (grade_review itself is task B5).
create function public.b4_grade(p_user uuid, p_path uuid, p_card uuid, p_at timestamptz, p_rating smallint, p_tz text)
returns void language sql volatile as $$
  insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day,
    idempotency_key, payload_hash, created_at)
  values (p_user, p_path, p_card, 'grade', p_rating, p_rating, (p_at at time zone p_tz)::date, gen_random_uuid(), 'x', p_at);
$$;

-- Card ids of a queue payload in order.
create function public.b4_ids(p jsonb) returns uuid[] language sql immutable as $$
  select coalesce(array_agg((c ->> 'card_id')::uuid order by o), '{}') from jsonb_array_elements(p -> 'cards') with ordinality as t(c, o);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd@test.dev', '{}');
update public.profiles set timezone = 'Asia/Seoul' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.profiles set timezone = 'America/Los_Angeles' where id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

-- Local days, computed independently of learning_user_today.
select set_config('test.a_today', ((now() at time zone 'Asia/Seoul')::date)::text, true);
select set_config('test.a_start', ((current_setting('test.a_today')::date)::timestamp at time zone 'Asia/Seoul')::text, true);
select set_config('test.a_end', ((current_setting('test.a_today')::date + 1)::timestamp at time zone 'Asia/Seoul')::text, true);
select set_config('test.b_today', ((now() at time zone 'America/Los_Angeles')::date)::text, true);
select set_config('test.b_start', ((current_setting('test.b_today')::date)::timestamp at time zone 'America/Los_Angeles')::text, true);
select set_config('test.b_end', ((current_setting('test.b_today')::date + 1)::timestamp at time zone 'America/Los_Angeles')::text, true);

-- Paths: weekly_minutes Mon..Sun = 5,10,..,35 -> cap = clamp(minutes x 3, 15, 150) = 15 x ISO weekday.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.pa', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[5,10,15,20,25,30,35]::smallint[])).id::text, true);
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select set_config('test.pb', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[1,1,1,1,1,1,1]::smallint[])).id::text, true);
select set_config('request.jwt.claims', '{"sub": "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "role": "authenticated"}', true);
select set_config('test.pd', (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a1', array[5,10,15,20,25,30,35]::smallint[])).id::text, true);

-- ===== Auth, ownership, empty queue =====
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(format('select public.get_review_queue(%L)', current_setting('test.pa')), '42501', 'not_authenticated', 'queue needs a user');
select throws_ok(format('select public.postpone_reviews(%L, null, %L)', current_setting('test.pa'), gen_random_uuid()), '42501', 'not_authenticated', 'postpone needs a user');
select throws_ok(format('select public.review_summary(%L)', current_setting('test.pa')), '42501', 'not_authenticated', 'summary needs a user');

select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "role": "authenticated"}', true);
select throws_ok(format('select public.get_review_queue(%L)', current_setting('test.pa')), 'P0001', 'path_not_found', 'queue of another user''s path');
select throws_ok(format('select public.postpone_reviews(%L, null, %L)', current_setting('test.pa'), gen_random_uuid()), 'P0001', 'path_not_found', 'postpone on another user''s path');
select throws_ok(format('select public.review_summary(%L)', current_setting('test.pa')), 'P0001', 'path_not_found', 'summary of another user''s path');
select throws_ok(format('select public.get_review_queue(%L)', gen_random_uuid()), 'P0001', 'path_not_found', 'unknown path');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.q', public.get_review_queue(current_setting('test.pa')::uuid)::text, true);
select is(current_setting('test.q')::jsonb -> 'cards', '[]'::jsonb, 'empty queue');
select is(current_setting('test.q')::jsonb -> 'totals',
  jsonb_build_object('due_total', 0, 'served', 0, 'backlog_remaining', 0, 'new_available', 0,
    'daily_cap', 15 * extract(isodow from current_setting('test.a_today')::date)::integer, 'reviewed_today', 0, 'recovery_mode', false),
  'empty totals; Seoul cap uses the Seoul weekday');

-- ===== Day boundaries: weekday caps per time zone =====
select set_config('request.jwt.claims', '{"sub": "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "role": "authenticated"}', true);
select is((public.get_review_queue(current_setting('test.pd')::uuid) #>> '{totals,daily_cap}')::integer,
  15 * extract(isodow from current_setting('test.b_today')::date)::integer, 'Los Angeles cap uses the Los Angeles weekday');
select is((public.get_review_queue(current_setting('test.pd')::uuid, 20, true) #>> '{totals,daily_cap}')::integer,
  15 * extract(isodow from current_setting('test.b_today')::date)::integer + 10, 'p_extra adds 10 to the cap');
select is(public.review_summary(current_setting('test.pd')::uuid) #>> '{forecast,0,date}', current_setting('test.b_today'), 'LA forecast starts on the LA date');

-- ===== Ordering, one direction per item, previews (user A, Seoul) =====
reset role;
select set_config('test.a1rec', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 1, 'recognize', 'learning', now() - interval '5 minutes')::text, true);
select set_config('test.a1rcl', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 1, 'recall', 'review', now() - interval '1 day', 1, now() - interval '20 days')::text, true);
select set_config('test.a2', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 2, 'recognize', 'relearning', now() - interval '1 minute')::text, true);
select set_config('test.a3', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 3, 'recognize', 'learning', now() + interval '5 minutes')::text, true);
select set_config('test.a4', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 4, 'recognize', 'review', now() - interval '1 day', 2, now() - interval '10 days')::text, true);
select set_config('test.a5', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 5, 'recognize', 'review', current_setting('test.a_end')::timestamptz - interval '1 minute', 100, now() - interval '10 days')::text, true);
select set_config('test.a6', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 6, 'recognize', 'review', current_setting('test.a_end')::timestamptz + interval '1 minute', 1, now() - interval '30 days')::text, true);
select set_config('test.a7rec', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 7, 'recognize', 'new', current_setting('test.a_start')::timestamptz)::text, true);
select set_config('test.a7rcl', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 7, 'recall', 'new', current_setting('test.a_start')::timestamptz)::text, true);
select set_config('test.a8rcl', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 8, 'recall', 'new', current_setting('test.a_start')::timestamptz)::text, true);
select set_config('test.a9', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 9, 'recognize', 'review', now() - interval '2 days', 1, now() - interval '20 days')::text, true);
update public.review_cards set suspended_at = now() where id = current_setting('test.a9')::uuid;
-- A new card enrolled for tomorrow (Seoul) is not served today.
select set_config('test.a10', public.b4_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, 10, 'recognize', 'new', current_setting('test.a_end')::timestamptz)::text, true);
-- Another user's due card on another path never leaks in.
select public.b4_card('dddddddd-dddd-4ddd-8ddd-dddddddddddd', current_setting('test.pd')::uuid, 11, 'recognize', 'review', now() - interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.q', public.get_review_queue(current_setting('test.pa')::uuid, 50)::text, true);
select is(public.b4_ids(current_setting('test.q')::jsonb),
  array[current_setting('test.a1rec'), current_setting('test.a2'), current_setting('test.a4'), current_setting('test.a5'),
        current_setting('test.a7rec'), current_setting('test.a8rcl')]::uuid[],
  'learning/relearning due, then review by retrievability, then new by lesson position; one direction per item');
select is((select count(distinct c ->> 'item_id')::int from jsonb_array_elements(current_setting('test.q')::jsonb -> 'cards') as c),
  jsonb_array_length(current_setting('test.q')::jsonb -> 'cards'), 'no item served twice');
select ok(not (current_setting('test.a3')::uuid = any (public.b4_ids(current_setting('test.q')::jsonb))), 'learning card due later today waits for its minute');
select ok(not (current_setting('test.a6')::uuid = any (public.b4_ids(current_setting('test.q')::jsonb))), 'review due just after Seoul midnight is not served today');
select ok(current_setting('test.a5')::uuid = any (public.b4_ids(current_setting('test.q')::jsonb)), 'review due just before Seoul midnight is served today');
select ok(not (current_setting('test.a9')::uuid = any (public.b4_ids(current_setting('test.q')::jsonb))), 'suspended card is not served');
select ok(not (current_setting('test.a10')::uuid = any (public.b4_ids(current_setting('test.q')::jsonb))), 'new card enrolled for tomorrow is not served');
select is(current_setting('test.q')::jsonb -> 'totals',
  jsonb_build_object('due_total', 4, 'served', 6, 'backlog_remaining', 0, 'new_available', 2,
    'daily_cap', 15 * extract(isodow from current_setting('test.a_today')::date)::integer, 'reviewed_today', 0, 'recovery_mode', false),
  'totals count one card per item, as served (item 1 and item 7 count once)');
select is((public.review_summary(current_setting('test.pa')::uuid) ->> 'remaining_today')::integer,
  jsonb_array_length(current_setting('test.q')::jsonb -> 'cards'), 'summary remaining_today = cards a session serves now');
select is(
  (select count(*)::int from jsonb_array_elements(current_setting('test.q')::jsonb -> 'cards') as c,
     unnest(array['again', 'hard', 'good', 'easy']) as k
   where jsonb_typeof(c #> array['previews', k, 'interval_minutes']) = 'number'
     and jsonb_typeof(c #> array['previews', k, 'due_at']) = 'string'),
  24, 'every card carries four previews');
select is((current_setting('test.q')::jsonb #> '{cards,0}') - 'previews'::text - 'due_at'::text,
  jsonb_build_object('card_id', current_setting('test.a1rec'), 'item_id', public.b4_id(1), 'direction', 'recognize',
    'state', 'learning', 'is_new', false, 'postpone_count', 0,
    'item', jsonb_build_object('language_code', 'en', 'item_type', 'vocab', 'front', jsonb_build_object('text', 'word1'),
      'back', jsonb_build_object('meaning', jsonb_build_object('vi', 'từ 1'), 'examples', '[]'::jsonb), 'audio_path', null)),
  'card JSON shape');
select is(current_setting('test.q')::jsonb #>> '{cards,4,is_new}', 'true', 'new card flagged is_new');
select is(current_setting('test.q')::jsonb #>> '{cards,4,direction}', 'recognize', 'a new item starts with recognize');
select is(public.b4_ids(public.get_review_queue(current_setting('test.pa')::uuid, 2)),
  array[current_setting('test.a1rec'), current_setting('test.a2')]::uuid[], 'p_limit bounds the batch');
select is((public.get_review_queue(current_setting('test.pa')::uuid, 2) #>> '{totals,backlog_remaining}')::integer, 2, 'backlog after a 2-card batch');

-- Path must be active.
select lives_ok(format($$select public.set_learning_path_status(%L, 'paused')$$, current_setting('test.pa')), 'A pauses the path');
select throws_ok(format('select public.get_review_queue(%L)', current_setting('test.pa')), 'P0001', 'path_not_active', 'paused path has no queue');
select throws_ok(format('select public.postpone_reviews(%L, null, %L)', current_setting('test.pa'), gen_random_uuid()), 'P0001', 'path_not_active', 'paused path cannot postpone');
select lives_ok(format('select public.review_summary(%L)', current_setting('test.pa')), 'summary still readable for a paused path');
select lives_ok(format($$select public.set_learning_path_status(%L, 'active')$$, current_setting('test.pa')), 'A resumes the path');

-- ===== Postpone (user A, Seoul) =====
reset role;
-- a2: postponed once yesterday -> may be postponed again (second in a row).
update public.review_cards set postpone_count = 1, last_postponed_on = current_setting('test.a_today')::date - 1 where id = current_setting('test.a2')::uuid;
-- a4: already postponed twice in a row -> third is skipped.
update public.review_cards set postpone_count = 2, last_postponed_on = current_setting('test.a_today')::date - 1 where id = current_setting('test.a4')::uuid;
-- a5: already postponed today -> skipped.
update public.review_cards set postpone_count = 1, last_postponed_on = current_setting('test.a_today')::date where id = current_setting('test.a5')::uuid;
select set_config('test.a2_stab', (select stability::text from public.review_cards where id = current_setting('test.a2')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select throws_ok(format('select public.postpone_reviews(%L, array[%L]::uuid[], %L)', current_setting('test.pa'), gen_random_uuid(), gen_random_uuid()),
  'P0001', 'card_not_found', 'unknown card id');
select throws_ok($$update public.review_cards set postpone_count = 0$$, '42501', null, 'no direct card update');

select set_config('test.pkey', gen_random_uuid()::text, true);
-- Due today (non-new, not suspended): a1rec, a1rcl, a2, a3 (learning later today), a4, a5 -> 4 postponed, a4 and a5 skipped.
select is(public.postpone_reviews(current_setting('test.pa')::uuid, null, current_setting('test.pkey')::uuid),
  '{"postponed": 4, "skipped": 2, "replayed": false}'::jsonb, 'postpone all due: limits skip two cards');
select is((select due_at from public.review_cards where id = current_setting('test.a2')::uuid), current_setting('test.a_end')::timestamptz,
  'postponed to the next Seoul midnight');
select is((select (due_at at time zone 'Asia/Seoul')::time from public.review_cards where id = current_setting('test.a1rcl')::uuid), '00:00'::time,
  'postponed due is local midnight');
select is((select postpone_count::int from public.review_cards where id = current_setting('test.a2')::uuid), 2, 'second consecutive postpone counted');
select is((select last_postponed_on from public.review_cards where id = current_setting('test.a2')::uuid), current_setting('test.a_today')::date, 'last_postponed_on = Seoul today');
select is((select stability::text from public.review_cards where id = current_setting('test.a2')::uuid), current_setting('test.a2_stab'), 'stability unchanged');
select is((select (postpone_count, due_at)::text from public.review_cards where id = current_setting('test.a4')::uuid),
  (2::smallint, now() - interval '1 day')::text, 'third consecutive postpone is skipped');
select is((select due_at from public.review_cards where id = current_setting('test.a5')::uuid),
  current_setting('test.a_end')::timestamptz - interval '1 minute', 'second postpone on the same day is skipped');
select is((select due_at from public.review_cards where id = current_setting('test.a7rec')::uuid),
  current_setting('test.a_start')::timestamptz, 'new cards are not postponed by the default selection');
select is((select count(*)::int from public.review_logs where kind = 'postpone'), 1, 'one postpone log row');
select is((select (card_id is null, local_day, jsonb_array_length(state_before), jsonb_array_length(state_after), result)::text
   from public.review_logs where kind = 'postpone'),
  (true, current_setting('test.a_today')::date, 4, 4, '{"postponed": 4, "skipped": 2, "replayed": false}'::jsonb)::text, 'postpone log content');

-- Idempotency
select is(public.postpone_reviews(current_setting('test.pa')::uuid, null, current_setting('test.pkey')::uuid),
  '{"postponed": 4, "skipped": 2, "replayed": true}'::jsonb, 'replay returns the stored result');
select is((select count(*)::int from public.review_logs where kind = 'postpone'), 1, 'replay writes nothing');
select throws_ok(format('select public.postpone_reviews(%L, array[%L]::uuid[], %L)', current_setting('test.pa'), current_setting('test.a2'), current_setting('test.pkey')),
  'P0001', 'idempotency_conflict', 'same key, other payload');

-- Explicit ids: already postponed today and not due -> skipped; a new card due today can be postponed explicitly.
select is(public.postpone_reviews(current_setting('test.pa')::uuid, array[current_setting('test.a2'), current_setting('test.a7rcl')]::uuid[], gen_random_uuid()),
  '{"postponed": 1, "skipped": 1, "replayed": false}'::jsonb, 'explicit ids: one postponed, one already postponed today');
select is((select due_at from public.review_cards where id = current_setting('test.a7rcl')::uuid), current_setting('test.a_end')::timestamptz, 'explicit new card postponed');
select is(public.postpone_reviews(current_setting('test.pa')::uuid, array[current_setting('test.a6')]::uuid[], gen_random_uuid()),
  '{"postponed": 0, "skipped": 1, "replayed": false}'::jsonb, 'card not due today is skipped');
select is(public.postpone_reviews(current_setting('test.pa')::uuid, array[current_setting('test.a9')]::uuid[], gen_random_uuid()),
  '{"postponed": 0, "skipped": 1, "replayed": false}'::jsonb, 'suspended card is skipped');

-- Queue after postponing: a4 and a5 remain; a7 recall postponed, a7 recognize and a8 still new.
select is(public.b4_ids(public.get_review_queue(current_setting('test.pa')::uuid, 50)),
  array[current_setting('test.a4'), current_setting('test.a5'), current_setting('test.a7rec'), current_setting('test.a8rcl')]::uuid[],
  'postponed cards leave today''s queue');

-- Postpone on user B's (LA) path snaps to LA midnight; A cannot touch B's cards.
reset role;
select set_config('test.b1', public.b4_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, 1, 'recognize', 'review', now() - interval '1 day', 3, now() - interval '5 days')::text, true);
set local role authenticated;
select throws_ok(format('select public.postpone_reviews(%L, array[%L]::uuid[], %L)', current_setting('test.pa'), current_setting('test.b1'), gen_random_uuid()),
  'P0001', 'card_not_found', 'another user''s card');
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
select is(public.postpone_reviews(current_setting('test.pb')::uuid, array[current_setting('test.b1')]::uuid[], current_setting('test.pkey')::uuid),
  '{"postponed": 1, "skipped": 0, "replayed": false}'::jsonb, 'keys are per user');
select is((select due_at from public.review_cards where id = current_setting('test.b1')::uuid), current_setting('test.b_end')::timestamptz,
  'postponed to the next Los Angeles midnight');
select is((select (due_at at time zone 'America/Los_Angeles')::time from public.review_cards where id = current_setting('test.b1')::uuid), '00:00'::time,
  'LA postponed due is LA local midnight');
select is((select last_postponed_on from public.review_cards where id = current_setting('test.b1')::uuid), current_setting('test.b_today')::date,
  'last_postponed_on = LA today');

-- ===== Caps, new limit, recovery mode (user B, LA, cap 15 every day) =====
reset role;
delete from public.review_cards where id = current_setting('test.b1')::uuid;
delete from public.review_logs where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
-- Items 1..32: review cards due yesterday (stability rises with the item number); items 33..40: new cards.
select count(public.b4_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, n, 'recognize', 'review',
  now() - interval '1 day', n::double precision, now() - interval '10 days')) from generate_series(1, 32) as n;
select count(public.b4_card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, n, 'recognize', 'new',
  current_setting('test.b_start')::timestamptz)) from generate_series(33, 40) as n;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select set_config('test.q', public.get_review_queue(current_setting('test.pb')::uuid, 100)::text, true);
select is(current_setting('test.q')::jsonb -> 'totals',
  '{"due_total": 32, "served": 15, "backlog_remaining": 17, "new_available": 0, "daily_cap": 15, "reviewed_today": 0, "recovery_mode": true}'::jsonb,
  'backlog 32 > 2 x 15: recovery mode, cap 15, no new cards');
select is((select array_agg((c ->> 'item_id')::uuid order by o) from jsonb_array_elements(current_setting('test.q')::jsonb -> 'cards') with ordinality as t(c, o)),
  (select array_agg(public.b4_id(n) order by n) from generate_series(1, 15) as n), 'lowest retrievability first');
select is((public.get_review_queue(current_setting('test.pb')::uuid, 100, true) #>> '{totals,served}')::integer, 25, 'p_extra serves 10 more');
select is((public.review_summary(current_setting('test.pb')::uuid) ->> 'recovery_mode')::boolean, true, 'summary reports recovery mode');

reset role;
update public.review_cards set suspended_at = now()
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and learning_item_id in (select public.b4_id(n) from generate_series(11, 32) as n);
set local role authenticated;
select set_config('test.q', public.get_review_queue(current_setting('test.pb')::uuid, 100)::text, true);
select is(current_setting('test.q')::jsonb -> 'totals',
  '{"due_total": 10, "served": 15, "backlog_remaining": 0, "new_available": 8, "daily_cap": 15, "reviewed_today": 0, "recovery_mode": false}'::jsonb,
  'backlog 10: new cards available again');
select is((select array_agg((c ->> 'item_id')::uuid order by o) from jsonb_array_elements(current_setting('test.q')::jsonb -> 'cards') with ordinality as t(c, o)),
  (select array_agg(public.b4_id(n) order by n) from generate_series(1, 10) as n)
    || (select array_agg(public.b4_id(n) order by n) from generate_series(33, 37) as n), 'reviews first, then new by lesson position');
select is((select count(*)::int from jsonb_array_elements(current_setting('test.q')::jsonb -> 'cards') as c where (c ->> 'is_new')::boolean), 5, 'new cards fill the rest of the cap');

-- Grades today: items 1..3 graded for the first time today (3 new started), item 4 graded before and today.
reset role;
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now(), 3::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id in (public.b4_id(1), public.b4_id(2), public.b4_id(3), public.b4_id(4));
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '3 days', 3::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id = public.b4_id(4);
-- A grade on the previous LA day does not count for today.
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, current_setting('test.b_start')::timestamptz - interval '1 minute', 3::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id = public.b4_id(5);
set local role authenticated;
select set_config('test.q', public.get_review_queue(current_setting('test.pb')::uuid, 100)::text, true);
select is(current_setting('test.q')::jsonb -> 'totals',
  '{"due_total": 10, "served": 11, "backlog_remaining": 0, "new_available": 7, "daily_cap": 15, "reviewed_today": 4, "recovery_mode": false}'::jsonb,
  'grades today shrink the cap; first grades today use the new limit');
select set_config('test.q', public.get_review_queue(current_setting('test.pb')::uuid, 100, true)::text, true);
select is((current_setting('test.q')::jsonb #>> '{totals,served}')::integer, 17, 'extra: 10 reviews + 7 new');
select is((select count(*)::int from jsonb_array_elements(current_setting('test.q')::jsonb -> 'cards') as c where (c ->> 'is_new')::boolean), 7,
  'new cards stop at daily_new_limit');

-- ===== Summary (user B) =====
reset role;
-- Item 32 comes back due within LA day +2.
update public.review_cards set suspended_at = null,
  due_at = ((current_setting('test.b_today')::date + 2)::timestamp at time zone 'America/Los_Angeles') + interval '1 hour'
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and learning_item_id = public.b4_id(32);
-- Retention: 19 qualifying first tries (previous grade >= 7 days before) on items 11..29, all Good.
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '12 days', 3::smallint, 'America/Los_Angeles'),
       public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '2 days', 3::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id in (select public.b4_id(n) from generate_series(11, 29) as n);
-- Not qualifying: a 2-day gap (item 30) and a pair older than 30 days (item 31).
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '4 days', 3::smallint, 'America/Los_Angeles'),
       public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '2 days', 3::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id = public.b4_id(30);
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '50 days', 3::smallint, 'America/Los_Angeles'),
       public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '40 days', 3::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id = public.b4_id(31);
insert into public.review_item_mastery (user_id, learning_path_id, learning_item_id, mastered_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, public.b4_id(1), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, public.b4_id(2), now() - interval '20 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, public.b4_id(3), null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.pa')::uuid, public.b4_id(1), now());
set local role authenticated;
select set_config('test.s', public.review_summary(current_setting('test.pb')::uuid)::text, true);
select is(current_setting('test.s')::jsonb - 'forecast',
  '{"reviewed_today": 4, "remaining_today": 11, "retention_30d": null, "retention_sample": 19, "mastered_total": 2, "mastered_this_week": 1, "recovery_mode": false}'::jsonb,
  'summary fields; retention null under 20 samples');
select is(current_setting('test.s')::jsonb -> 'forecast',
  (select jsonb_agg(jsonb_build_object('date', to_char(current_setting('test.b_today')::date + g, 'YYYY-MM-DD'),
     'count', case g when 0 then 10 when 2 then 1 else 0 end) order by g) from generate_series(0, 6) as g),
  'forecast: 7 LA days, overdue counted today');
reset role;
-- Item 31 forgotten 39 days after its last grade: the twentieth qualifying sample.
select public.b4_grade('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.pb')::uuid, c.id, now() - interval '1 day', 1::smallint, 'America/Los_Angeles')
from public.review_cards c where c.user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.learning_item_id = public.b4_id(31);
set local role authenticated;
select set_config('test.s', public.review_summary(current_setting('test.pb')::uuid)::text, true);
select is((current_setting('test.s')::jsonb ->> 'retention_sample')::integer, 20, 'twentieth qualifying sample');
select is((current_setting('test.s')::jsonb ->> 'retention_30d')::numeric, 0.95, 'retention = 19 / 20');

-- Summary for A (Seoul).
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select set_config('test.s', public.review_summary(current_setting('test.pa')::uuid)::text, true);
select is(current_setting('test.s')::jsonb #>> '{forecast,0,date}', current_setting('test.a_today'), 'Seoul forecast starts on the Seoul date');
select is((current_setting('test.s')::jsonb #>> '{forecast,0,count}')::integer, 2, 'Seoul today: a4 and a5 still due');
select is((current_setting('test.s')::jsonb #>> '{forecast,1,count}')::integer, 5, 'Seoul tomorrow: 4 postponed + a6 (new a7 recall excluded)');
select is((current_setting('test.s')::jsonb ->> 'mastered_total')::integer, 1, 'mastery counted per path owner');
select is(current_setting('test.s')::jsonb ->> 'retention_30d', null, 'no samples -> null retention');

-- ===== Privileges =====
select is(
  (select count(*)::int from unnest(array[
     'public.review_path_for_user(uuid, uuid, boolean)',
     'public.review_day_totals(uuid, uuid, smallint[], boolean, timestamptz)'
   ]) as f(sig) where has_function_privilege('authenticated', f.sig, 'execute')),
  0, 'authenticated cannot call the internal helpers');
select is(
  (select count(*)::int from unnest(array[
     'public.get_review_queue(uuid, integer, boolean)', 'public.postpone_reviews(uuid, uuid[], uuid)', 'public.review_summary(uuid)'
   ]) as f(sig) where has_function_privilege('authenticated', f.sig, 'execute')),
  3, 'authenticated can call the review RPCs');
select is(
  (select count(*)::int from unnest(array[
     'public.get_review_queue(uuid, integer, boolean)', 'public.postpone_reviews(uuid, uuid[], uuid)', 'public.review_summary(uuid)'
   ]) as f(sig) where has_function_privilege('anon', f.sig, 'execute')),
  0, 'anon cannot call the review RPCs');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(format('select public.get_review_queue(%L)', current_setting('test.pa')), '42501', null, 'anon is refused');

select * from finish();
rollback;
