begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- ===== Structure =====
select has_table('public', 'srs_config', 'srs_config exists');
select has_table('public', 'review_cards', 'review_cards exists');
select has_table('public', 'review_item_mastery', 'review_item_mastery exists');
select has_table('public', 'review_logs', 'review_logs exists');

select ok((select relrowsecurity from pg_class where oid = 'public.srs_config'::regclass), 'RLS on srs_config');
select ok((select relrowsecurity from pg_class where oid = 'public.review_cards'::regclass), 'RLS on review_cards');
select ok((select relrowsecurity from pg_class where oid = 'public.review_item_mastery'::regclass), 'RLS on review_item_mastery');
select ok((select relrowsecurity from pg_class where oid = 'public.review_logs'::regclass), 'RLS on review_logs');

select col_is_unique('public', 'review_cards', array['user_id', 'learning_path_id', 'learning_item_id', 'direction'], 'one card per item and direction');
select col_is_pk('public', 'review_item_mastery', array['user_id', 'learning_path_id', 'learning_item_id'], 'mastery keyed by item');
select col_is_unique('public', 'review_logs', array['user_id', 'idempotency_key'], 'idempotency key unique per user');
select has_index('public', 'review_cards', 'review_cards_due_idx', array['user_id', 'learning_path_id', 'due_at'], 'due index');
select is((select pg_get_expr(indpred, indrelid) from pg_index where indexrelid = 'public.review_cards_due_idx'::regclass),
  '(suspended_at IS NULL)', 'due index skips suspended cards');
select has_index('public', 'review_logs', 'review_logs_user_path_created_idx', 'log history index');

-- No client privileges beyond SELECT on the learner tables; nothing at all on srs_config.
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('srs_config', 'review_cards', 'review_item_mastery', 'review_logs')
     and grantee in ('anon', 'authenticated') and not (grantee = 'authenticated' and privilege_type = 'SELECT' and table_name <> 'srs_config')),
  0, 'no client write grants, no srs_config grants');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('review_cards', 'review_item_mastery', 'review_logs')
     and grantee = 'authenticated' and privilege_type = 'SELECT'),
  3, 'authenticated may select the three learner tables');
select is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name in ('srs_config', 'review_cards', 'review_item_mastery', 'review_logs')
     and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'),
  0, 'no column-level write grants');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('srs_config', 'review_cards', 'review_item_mastery', 'review_logs')),
  3, 'exactly one policy per learner table, none on srs_config');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('review_cards', 'review_item_mastery', 'review_logs') and cmd <> 'SELECT'),
  0, 'only select policies');

-- ===== srs_config seed =====
select is((select count(*)::int from public.srs_config), 1, 'one config row');
select is((select weights from public.srs_config), array[
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
]::double precision[], 'weights = ts-fsrs 5.x FSRS-6 default_w');
select is((select desired_retention from public.srs_config), 0.9::double precision, 'desired retention 0.9');
select is((select maximum_interval from public.srs_config), 365, 'maximum interval 365');
select is((select learning_steps_minutes from public.srs_config), array[1, 10], 'learning steps 1m, 10m');
select is((select relearning_steps_minutes from public.srs_config), array[10], 'relearning step 10m');
select is(
  (select array[daily_new_limit, cap_min, cap_max, cap_per_minute] from public.srs_config), array[10, 15, 150, 3], 'queue limits');
select is((select recovery_factor from public.srs_config), 2::double precision, 'recovery factor 2');
select is(
  (select array[mastery_min_successes::double precision, mastery_min_days, mastery_min_recall_stability] from public.srs_config),
  array[3, 3, 21]::double precision[], 'mastery thresholds');

select throws_ok($$insert into public.srs_config (weights) select weights from public.srs_config$$, '23505', null, 'config is a single row');
select throws_ok($$insert into public.srs_config (id, weights) select false, weights from public.srs_config$$, '23514', null, 'config id must be true');
select throws_ok($$update public.srs_config set weights = weights[1:20]$$, '23514', null, 'weights must have 21 entries');
select throws_ok($$update public.srs_config set desired_retention = 1$$, '23514', null, 'retention below 1');

-- ===== Fixtures: two learners, one path each, one learning item =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('b2000000-0000-4000-8000-00000000000a', 'b2a@test.dev', '{}'),
  ('b2000000-0000-4000-8000-00000000000b', 'b2b@test.dev', '{}');

insert into public.learning_paths (id, user_id, language_code, start_point, goal_type, current_level, target_level, weekly_minutes, estimate) values
  ('b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-00000000000a', 'en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[], '{}'),
  ('b2000000-0000-4000-8000-0000000000b1', 'b2000000-0000-4000-8000-00000000000b', 'en', 'new', 'foundation', 'pre_a1', 'a1', array[30,30,30,30,30,30,30]::smallint[], '{}');

insert into public.content_sources (id, key, title, author_or_org, license, status, is_demo, content_hash) values
  ('b2000000-0000-4000-8000-000000000001', 'src:b2-test', 'B2 test', 'Linguo', 'own', 'published', true, repeat('1', 64));
insert into public.learning_items (id, key, source_id, language_code, item_type, level_code, difficulty, front, back, status, is_demo, content_hash) values
  ('b2000000-0000-4000-8000-000000000021', 'en:item:b2-test-hello', 'b2000000-0000-4000-8000-000000000001', 'en', 'vocab', 'pre_a1', 1,
   '{"text": "hello"}', '{"meaning": {"vi": "xin chào"}, "examples": []}', 'published', true, repeat('2', 64));

insert into public.review_cards (id, user_id, learning_path_id, learning_item_id, direction, due_at) values
  ('b2000000-0000-4000-8000-0000000000c1', 'b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-000000000021', 'recognize', now()),
  ('b2000000-0000-4000-8000-0000000000c2', 'b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-000000000021', 'recall', now()),
  ('b2000000-0000-4000-8000-0000000000c3', 'b2000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-0000000000b1', 'b2000000-0000-4000-8000-000000000021', 'recognize', now());
insert into public.review_item_mastery (user_id, learning_path_id, learning_item_id) values
  ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-000000000021'),
  ('b2000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-0000000000b1', 'b2000000-0000-4000-8000-000000000021');
insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash) values
  ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-0000000000c1', 'grade', 3, 3, current_date, 'b2000000-0000-4000-8000-0000000000d1', 'h'),
  ('b2000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-0000000000b1', 'b2000000-0000-4000-8000-0000000000c3', 'grade', 1, 1, current_date, 'b2000000-0000-4000-8000-0000000000d1', 'h');

-- ===== Defaults and constraints (as owner) =====
select is(
  (select row(fsrs_state, step, stability, difficulty, reps, lapses, scheduled_days, postpone_count)::text
   from public.review_cards where id = 'b2000000-0000-4000-8000-0000000000c1'),
  '(new,0,,,0,0,0,0)', 'new card defaults');
select throws_ok($$insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, due_at)
  values ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-000000000021', 'recall', now())$$,
  '23505', null, 'duplicate card refused');
select throws_ok($$update public.review_cards set direction = 'use_in_sentence' where id = 'b2000000-0000-4000-8000-0000000000c1'$$, '23514', null, 'direction check');
select throws_ok($$update public.review_cards set fsrs_state = 'mastered' where id = 'b2000000-0000-4000-8000-0000000000c1'$$, '23514', null, 'fsrs_state check');
select throws_ok($$insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash)
  values ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-0000000000c2', 'grade', 2, 2, current_date, 'b2000000-0000-4000-8000-0000000000d1', 'h2')$$,
  '23505', null, 'idempotency key reused by the same user refused');
select throws_ok($$insert into public.review_logs (user_id, learning_path_id, card_id, kind, rating_raw, rating_effective, local_day, idempotency_key, payload_hash)
  values ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-0000000000c2', 'grade', 5, 4, current_date, gen_random_uuid(), 'h')$$,
  '23514', null, 'rating range check');
select throws_ok($$insert into public.review_logs (user_id, learning_path_id, kind, local_day, idempotency_key, payload_hash)
  values ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'grade', current_date, gen_random_uuid(), 'h')$$,
  '23514', null, 'grade log needs a card and ratings');
select lives_ok($$insert into public.review_logs (user_id, learning_path_id, kind, local_day, idempotency_key, payload_hash, result)
  values ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'postpone', current_date, 'b2000000-0000-4000-8000-0000000000d2', 'h', '{"postponed": 0, "skipped": 0}')$$,
  'postpone log without a card');

-- ===== As learner A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "b2000000-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from public.review_cards), 2, 'A sees only own cards');
select is((select count(*)::int from public.review_item_mastery), 1, 'A sees only own mastery');
select is((select count(*)::int from public.review_logs), 2, 'A sees only own logs');
select throws_ok($$select * from public.srs_config$$, '42501', null, 'A cannot read srs_config');
select throws_ok($$update public.review_cards set due_at = now() + interval '1 year'$$, '42501', null, 'A cannot update cards');
select throws_ok($$insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, due_at)
  values ('b2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-0000000000a1', 'b2000000-0000-4000-8000-000000000021', 'recall', now())$$,
  '42501', null, 'A cannot insert cards');
select throws_ok($$delete from public.review_logs$$, '42501', null, 'A cannot delete logs');
select throws_ok($$update public.review_item_mastery set mastered_at = now()$$, '42501', null, 'A cannot mark mastery');

-- ===== As learner B =====
select set_config('request.jwt.claims', '{"sub": "b2000000-0000-4000-8000-00000000000b", "role": "authenticated"}', true);
select is((select array_agg(id::text) from public.review_cards), array['b2000000-0000-4000-8000-0000000000c3'], 'B sees only own card');

-- ===== As anon =====
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select * from public.review_cards$$, '42501', null, 'anon cannot read cards');
select throws_ok($$select * from public.review_logs$$, '42501', null, 'anon cannot read logs');

-- ===== Cascade (as owner) =====
reset role;
delete from public.learning_paths where id = 'b2000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int from public.review_cards where user_id = 'b2000000-0000-4000-8000-00000000000a')
  + (select count(*)::int from public.review_item_mastery where user_id = 'b2000000-0000-4000-8000-00000000000a')
  + (select count(*)::int from public.review_logs where user_id = 'b2000000-0000-4000-8000-00000000000a'),
  0, 'deleting a path removes its cards, mastery and logs');

select * from finish();
rollback;
