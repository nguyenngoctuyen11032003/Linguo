-- Personal vocabulary (P2): lists, CSV import RPC, caps, rate limit, owner isolation, FSRS grading, export and
-- account deletion. Migration: 20261016000300_personal_vocab.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(99);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.dev', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.dev', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@test.dev', '{}');

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- N distinct rows {term: <prefix>N, meaning: m N}.
create function pg_temp.rows(p_prefix text, p_n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('term', p_prefix || g, 'meaning', 'm' || g) order by g) from generate_series(1, p_n) g;
$$;

-- ===== Schema, RLS, privileges =====
select has_table('public', 'personal_word_lists', 'personal_word_lists exists');
select has_table('public', 'personal_words', 'personal_words exists');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('personal_word_lists', 'personal_words', 'personal_vocab_imports') and c.relrowsecurity),
  3, 'RLS enabled on the three tables');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id'
  where n.nspname = 'public' and c.relname in ('personal_word_lists', 'personal_words', 'personal_vocab_imports')),
  3, 'all three tables carry user_id');
select ok(not has_table_privilege('authenticated', 'public.personal_words', 'insert')
  and not has_table_privilege('authenticated', 'public.personal_words', 'update')
  and not has_table_privilege('authenticated', 'public.personal_words', 'delete')
  and not has_table_privilege('authenticated', 'public.personal_word_lists', 'insert')
  and not has_table_privilege('authenticated', 'public.personal_word_lists', 'update')
  and not has_table_privilege('authenticated', 'public.personal_word_lists', 'delete'),
  'learners have no direct write grants');
select ok(not has_table_privilege('authenticated', 'public.personal_vocab_imports', 'select'), 'import bookkeeping is server-only');
select ok(not has_column_privilege('authenticated', 'public.personal_words', 'last_grade_key', 'select'), 'replay columns are not readable');
select ok(not has_table_privilege('anon', 'public.personal_words', 'select'), 'anon cannot read words');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('list_personal_lists', 'create_personal_list', 'rename_personal_list', 'delete_personal_list',
    'import_personal_words', 'update_personal_word', 'delete_personal_word', 'get_personal_review_queue', 'grade_personal_word')
  and p.prosecdef and p.proconfig @> array['search_path=""']
  and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
  9, 'the 9 RPCs are security definer, search_path-pinned, authenticated only');
select ok(not has_function_privilege('authenticated', 'public.personal_parse_rows(jsonb)', 'execute'), 'helpers are internal');

-- ===== Anonymous =====
set local role anon;
select throws_ok('select public.list_personal_lists()', '42501', null, 'anon cannot list');
reset role;

-- ===== User A: lists =====
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.la', public.create_personal_list('  Từ  vựng   TOPIK ', 'ko') ->> 'id', true);
select is((select name from public.personal_word_lists where id = current_setting('test.la')::uuid), 'Từ vựng TOPIK', 'list name is cleaned');
select throws_ok($$ select public.create_personal_list('từ vựng topik', 'ko') $$, 'P0001', 'name_taken', 'names are unique per user (case-insensitive)');
select throws_ok($$ select public.create_personal_list('   ', 'en') $$, 'P0001', 'invalid_name', 'blank name refused');
select throws_ok($$ select public.create_personal_list(repeat('x', 61), 'en') $$, 'P0001', 'invalid_name', 'long name refused');
select throws_ok($$ select public.create_personal_list('X', 'fr') $$, 'P0001', 'invalid_language', 'only en and ko');
select set_config('test.le', public.create_personal_list('English', 'en') ->> 'id', true);
select is(public.rename_personal_list(current_setting('test.le')::uuid, 'English words') ->> 'name', 'English words', 'rename works');
select throws_ok(format($$ select public.rename_personal_list(%L, 'Từ vựng TOPIK') $$, current_setting('test.le')), 'P0001', 'name_taken', 'rename to an existing name refused');
select is(jsonb_array_length(public.list_personal_lists()), 2, 'A has 2 lists');

-- ===== Import =====
select is(public.import_personal_words(current_setting('test.la')::uuid, jsonb_build_array(
    jsonb_build_object('term', '사과', 'meaning', 'quả táo', 'example', '사과를 먹어요.', 'note', 'danh từ', 'pronunciation', 'sa-gwa'),
    jsonb_build_object('term', '  학교 ', 'meaning', 'trường học'),
    jsonb_build_object('term', '=HYPERLINK("http://evil")', 'meaning', '+cmd|calc'),
    jsonb_build_object('term', '바나나', 'meaning', E'chuối\u202e\u200b\x01 vàng')))
  - 'invalid', '{"added": 4, "updated": 0, "unchanged": 0, "duplicates": 0}'::jsonb, 'first import adds 4 words');
reset role;
select is((select term from public.personal_words where list_id = current_setting('test.la')::uuid and term like '=%'),
  '=HYPERLINK("http://evil")', 'formula prefixes are kept as plain text');
select is((select meaning from public.personal_words where list_id = current_setting('test.la')::uuid and term = '바나나'),
  'chuối vàng', 'control and bidi characters are stripped');
select is((select array_agg(position order by position) from public.personal_words where list_id = current_setting('test.la')::uuid),
  array[0, 1, 2, 3], 'words keep the import order');
select is((select count(*)::integer from public.personal_words where list_id = current_setting('test.la')::uuid and fsrs_state = 'new' and due_at <= now()),
  4, 'imported words are new and due now');
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Idempotent by (list, normalized term).
select is(public.import_personal_words(current_setting('test.la')::uuid, jsonb_build_array(
    jsonb_build_object('term', '사과', 'meaning', 'quả táo', 'example', '사과를 먹어요.', 'note', 'danh từ', 'pronunciation', 'sa-gwa'),
    jsonb_build_object('term', '학교', 'meaning', 'trường học')))
  - 'invalid', '{"added": 0, "updated": 0, "unchanged": 2, "duplicates": 0}'::jsonb, 're-importing the same rows changes nothing');
select is(public.import_personal_words(current_setting('test.la')::uuid, jsonb_build_array(
    jsonb_build_object('term', '학교', 'meaning', 'trường (đã sửa)')))
  - 'invalid', '{"added": 0, "updated": 1, "unchanged": 0, "duplicates": 0}'::jsonb, 'changed text updates the existing word');
select is((select count(*)::integer from public.personal_words where list_id = current_setting('test.la')::uuid), 4, 'still 4 words');

-- Row-level validation, in-file duplicates (case, whitespace, Hangul NFC/NFD), result indexes.
select is(public.import_personal_words(current_setting('test.le')::uuid, jsonb_build_array(
    jsonb_build_object('term', 'Apple', 'meaning', 'quả táo'),                       -- 0 ok
    jsonb_build_object('term', 'apple  ', 'meaning', 'duplicate'),                   -- 1 dup of 0
    jsonb_build_object('term', 'pear'),                                              -- 2 meaning missing
    jsonb_build_object('meaning', 'no term'),                                        -- 3 term missing
    jsonb_build_object('term', repeat('a', 121), 'meaning', 'x'),                    -- 4 too long
    jsonb_build_object('term', 'ok', 'meaning', repeat('m', 301)),                   -- 5 meaning too long
    jsonb_build_object('term', 'ok2', 'meaning', 'x', 'example', repeat('e', 301)),  -- 6 example too long
    jsonb_build_object('term', 7, 'meaning', 'x'),                                   -- 7 wrong type
    to_jsonb('text'::text),                                                          -- 8 not an object
    jsonb_build_object('term', normalize('한국', NFD), 'meaning', 'Hàn Quốc'),       -- 9 ok
    jsonb_build_object('term', normalize('한국', NFC), 'meaning', 'dup nfc')))       -- 10 dup of 9
  , '{"added": 2, "updated": 0, "unchanged": 0, "duplicates": 2, "invalid": [
      {"index": 2, "reason": "meaning_required"}, {"index": 3, "reason": "term_required"},
      {"index": 4, "reason": "term_too_long"}, {"index": 5, "reason": "meaning_too_long"},
      {"index": 6, "reason": "example_too_long"}, {"index": 7, "reason": "invalid_field"},
      {"index": 8, "reason": "not_an_object"}]}'::jsonb, 'row-level validation, duplicates and NFC/NFD folding');
select throws_ok(format($$ select public.import_personal_words(%L, '[]'::jsonb) $$, current_setting('test.le')), 'P0001', 'invalid_rows', 'empty import refused');
select throws_ok(format($$ select public.import_personal_words(%L, '{"term": "x"}'::jsonb) $$, current_setting('test.le')), 'P0001', 'invalid_rows', 'non-array import refused');
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('t', 1001)) $$, current_setting('test.le')), 'P0001', 'too_many_rows', 'more than 1000 rows refused');
select throws_ok($$ select public.import_personal_words(gen_random_uuid(), pg_temp.rows('t', 1)) $$, 'P0001', 'list_not_found', 'unknown list refused');

-- ===== Review queue and grading (FSRS reuse) =====
select is(jsonb_array_length(public.get_personal_review_queue(current_setting('test.la')::uuid) -> 'cards'), 4, 'queue serves the 4 new words');
select is(public.get_personal_review_queue(current_setting('test.la')::uuid) -> 'totals', '{"due_total": 4, "served": 4, "new_available": 4}'::jsonb, 'queue totals');
select is(jsonb_array_length(public.get_personal_review_queue(current_setting('test.la')::uuid, 2) -> 'cards'), 2, 'queue honours the limit');
select set_config('test.q', public.get_personal_review_queue(current_setting('test.la')::uuid)::text, true);
select is(current_setting('test.q')::jsonb #>> '{cards,0,item,front,text}', '사과', 'first card is the first imported word');
select is(current_setting('test.q')::jsonb #>> '{cards,0,item,front,romanization}', 'sa-gwa', 'pronunciation is shown as romanization');
select is(current_setting('test.q')::jsonb #>> '{cards,0,item,back,meaning,vi}', 'quả táo', 'meaning is on the back');
select is(current_setting('test.q')::jsonb #>> '{cards,0,item,back,examples,0,target}', '사과를 먹어요.', 'example is on the back');
select is(current_setting('test.q')::jsonb #>> '{cards,0,item,language_code}', 'ko', 'language comes from the list');
select ok(current_setting('test.q')::jsonb #>> '{cards,0,previews,good,due_at}' is not null, 'cards carry the four FSRS previews');
select set_config('test.w1', current_setting('test.q')::jsonb #>> '{cards,0,card_id}', true);

select set_config('test.k1', gen_random_uuid()::text, true);
select set_config('test.g1', public.grade_personal_word(current_setting('test.w1')::uuid, 3::smallint, current_setting('test.k1')::uuid)::text, true);
select is(current_setting('test.g1')::jsonb ->> 'state', 'learning', 'a first Good moves a new word to learning');
reset role;
select set_config('test.expected_due',
  public.srs_next('new', 0::smallint, null, null, null, 3::smallint, now(),
    coalesce((select timezone from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Asia/Ho_Chi_Minh')) ->> 'due_at', true);
select is(
  (select due_at from public.personal_words where id = current_setting('test.w1')::uuid),
  current_setting('test.expected_due')::timestamptz,
  'due_at equals the shared FSRS scheduler (srs_next) result');
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select ok((select due_at from public.personal_words where id = current_setting('test.w1')::uuid) > now(), 'grading advanced due_at');
select is((select reps from public.personal_words where id = current_setting('test.w1')::uuid), 1, 'reps counted');
select is(public.grade_personal_word(current_setting('test.w1')::uuid, 3::smallint, current_setting('test.k1')::uuid),
  current_setting('test.g1')::jsonb || '{"replayed": true}'::jsonb, 'the same key replays the stored result');
select is((select reps from public.personal_words where id = current_setting('test.w1')::uuid), 1, 'a replay does not grade twice');
select throws_ok(format($$ select public.grade_personal_word(%L, 1::smallint, %L) $$, current_setting('test.w1'), current_setting('test.k1')),
  'P0001', 'idempotency_conflict', 'the same key with another rating conflicts');
select throws_ok(format($$ select public.grade_personal_word(%L, 3::smallint, gen_random_uuid()) $$, current_setting('test.w1')),
  'P0001', 'word_not_due', 'a word cannot be graded again before it is due');
select throws_ok(format($$ select public.grade_personal_word(%L, 5::smallint, gen_random_uuid()) $$, current_setting('test.w1')),
  'P0001', 'invalid_rating', 'invalid rating refused');
select is(jsonb_array_length(public.get_personal_review_queue(current_setting('test.la')::uuid) -> 'cards'), 3, 'the graded word left the queue');

-- A word in review state graduates like a curated card: Easy on a new word, then Good once due.
select set_config('test.w2', (public.get_personal_review_queue(current_setting('test.la')::uuid) #>> '{cards,0,card_id}'), true);
select is(public.grade_personal_word(current_setting('test.w2')::uuid, 4::smallint, gen_random_uuid()) ->> 'state', 'review', 'Easy sends a new word to review');
select ok((select scheduled_days from public.personal_words where id = current_setting('test.w2')::uuid) >= 1, 'review interval is in days');
-- Re-importing changed text keeps the schedule.
select public.import_personal_words(current_setting('test.la')::uuid, jsonb_build_array(
  jsonb_build_object('term', (select term from public.personal_words where id = current_setting('test.w2')::uuid), 'meaning', 'nghĩa mới')));
select is((select reps from public.personal_words where id = current_setting('test.w2')::uuid), 1, 're-import keeps the FSRS state');
reset role;
-- Make it due (as the clock would), then grade again.
update public.personal_words set due_at = now() - interval '1 hour', last_review_at = now() - interval '3 days'
  where id = current_setting('test.w2')::uuid;
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is(public.grade_personal_word(current_setting('test.w2')::uuid, 3::smallint, gen_random_uuid()) ->> 'state', 'review', 'Good on a due review word stays in review');
select is((select reps from public.personal_words where id = current_setting('test.w2')::uuid), 2, 'reps = 2');
select ok((select due_at from public.personal_words where id = current_setting('test.w2')::uuid) > now() + interval '1 day', 'review word is scheduled days ahead');

-- ===== Editing =====
select set_config('test.w3', (select id::text from public.personal_words where list_id = current_setting('test.la')::uuid and term = '학교'), true);
select is(public.update_personal_word(current_setting('test.w3')::uuid, '학교 ', 'trường', null, 'ghi chú', null) ->> 'note', 'ghi chú', 'a word can be edited');
select throws_ok(format($$ select public.update_personal_word(%L, '사과', 'x', null, null, null) $$, current_setting('test.w3')),
  'P0001', 'duplicate_term', 'renaming into an existing term is refused');
select throws_ok(format($$ select public.update_personal_word(%L, '', 'x', null, null, null) $$, current_setting('test.w3')),
  'P0001', 'invalid_term', 'empty term refused');
select throws_ok(format($$ select public.update_personal_word(%L, 'x', null, null, null, null) $$, current_setting('test.w3')),
  'P0001', 'invalid_meaning', 'empty meaning refused');
select throws_ok(format($$ select public.update_personal_word(%L, 'x', 'y', repeat('e', 301), null, null) $$, current_setting('test.w3')),
  'P0001', 'field_too_long', 'long example refused');
select is(public.delete_personal_word(current_setting('test.w3')::uuid), '{"deleted": true}'::jsonb, 'a word can be deleted');
select throws_ok(format($$ select public.delete_personal_word(%L) $$, current_setting('test.w3')), 'P0001', 'word_not_found', 'deleting twice reports not found');

-- ===== Owner isolation =====
select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select count(*)::integer from public.personal_word_lists), 0, 'B sees none of A''s lists');
select is((select count(*)::integer from public.personal_words), 0, 'B sees none of A''s words');
select is(public.list_personal_lists(), '[]'::jsonb, 'B lists nothing');
select throws_ok(format($$ select public.rename_personal_list(%L, 'Hacked') $$, current_setting('test.la')), 'P0001', 'list_not_found', 'B cannot rename A''s list');
select throws_ok(format($$ select public.delete_personal_list(%L) $$, current_setting('test.la')), 'P0001', 'list_not_found', 'B cannot delete A''s list');
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('x', 1)) $$, current_setting('test.la')), 'P0001', 'list_not_found', 'B cannot import into A''s list');
select throws_ok(format($$ select public.get_personal_review_queue(%L) $$, current_setting('test.la')), 'P0001', 'list_not_found', 'B cannot read A''s queue');
select throws_ok(format($$ select public.grade_personal_word(%L, 3::smallint, gen_random_uuid()) $$, current_setting('test.w2')), 'P0001', 'word_not_found', 'B cannot grade A''s word');
select throws_ok(format($$ select public.update_personal_word(%L, 'x', 'y', null, null, null) $$, current_setting('test.w2')), 'P0001', 'word_not_found', 'B cannot edit A''s word');
select throws_ok(format($$ select public.delete_personal_word(%L) $$, current_setting('test.w2')), 'P0001', 'word_not_found', 'B cannot delete A''s word');
select throws_ok($$ insert into public.personal_word_lists (user_id, name, language_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'direct', 'en') $$,
  '42501', null, 'no direct insert, even for oneself');
select throws_ok($$ update public.personal_words set meaning = 'x' $$, '42501', null, 'no direct update');
select throws_ok($$ delete from public.personal_words $$, '42501', null, 'no direct delete');

-- ===== Caps =====
select set_config('test.b1', public.create_personal_list('L1', 'en') ->> 'id', true);
select is(public.import_personal_words(current_setting('test.b1')::uuid, pg_temp.rows('w', 1000)) ->> 'added', '1000', 'a list takes 1000 words');
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('extra', 1)) $$, current_setting('test.b1')),
  'P0001', 'list_full', 'the 1001st word is refused');
select is(public.import_personal_words(current_setting('test.b1')::uuid, pg_temp.rows('w', 1000)) ->> 'unchanged', '1000', 'a full list can still be re-imported');
select set_config('test.b2', public.create_personal_list('L2', 'en') ->> 'id', true);
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('w', 1001)) $$, current_setting('test.b2')),
  'P0001', 'too_many_rows', 'more than 1000 rows per call refused');
select is(public.import_personal_words(current_setting('test.b2')::uuid, pg_temp.rows('v', 1000)) ->> 'added', '1000', 'second full list');
select set_config('test.b3', public.create_personal_list('L3', 'en') ->> 'id', true);
select public.import_personal_words(current_setting('test.b3')::uuid, pg_temp.rows('u', 1000));
select set_config('test.b4', public.create_personal_list('L4', 'en') ->> 'id', true);
select public.import_personal_words(current_setting('test.b4')::uuid, pg_temp.rows('t', 1000));
select set_config('test.b5', public.create_personal_list('L5', 'en') ->> 'id', true);
select public.import_personal_words(current_setting('test.b5')::uuid, pg_temp.rows('s', 1000));
select set_config('test.b6', public.create_personal_list('L6', 'en') ->> 'id', true);
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('r', 1)) $$, current_setting('test.b6')),
  'P0001', 'vocab_full', 'the 5001st word of a user is refused');

-- Lists: 20 per user (B has 6).
select is((select count(*)::integer from (select public.create_personal_list('X' || g, 'en') from generate_series(1, 14) g) s), 14, 'B reaches 20 lists');
select throws_ok($$ select public.create_personal_list('one too many', 'en') $$, 'P0001', 'list_limit', 'the 21st list is refused');

-- ===== Rate limit: 10 imports per hour (user C) =====
select pg_temp.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select set_config('test.c1', public.create_personal_list('Rate', 'en') ->> 'id', true);
select is((select count(*)::integer from (select public.import_personal_words(current_setting('test.c1')::uuid, pg_temp.rows('c' || g || '-', 1)) from generate_series(1, 10) g) s),
  10, 'ten imports pass');
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('late', 1)) $$, current_setting('test.c1')), 'P0001', 'rate_limited', 'the 11th import within the hour is refused');
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('c1-', 1)) $$, current_setting('test.c1')), 'P0001', 'rate_limited', 'a harmless re-import counts too');
-- Deleting the list does not reset the allowance.
select public.delete_personal_list(current_setting('test.c1')::uuid);
select set_config('test.c2', public.create_personal_list('Rate 2', 'en') ->> 'id', true);
select throws_ok(format($$ select public.import_personal_words(%L, pg_temp.rows('again', 1)) $$, current_setting('test.c2')), 'P0001', 'rate_limited', 'deleting the list does not reset the allowance');
reset role;
select is((select count(*)::integer from public.personal_words where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0, 'list deletion cascaded to words');
-- An hour later the allowance is back.
update public.personal_vocab_imports set created_at = now() - interval '2 hours' where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set local role authenticated;
select pg_temp.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select is(public.import_personal_words(current_setting('test.c2')::uuid, pg_temp.rows('back', 1)) ->> 'added', '1', 'imports are allowed again an hour later');

-- ===== Export and deletion =====
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('test.xa', public.export_my_data()::text, true);
select is(jsonb_array_length(current_setting('test.xa')::jsonb -> 'personal_word_lists'), 2, 'export has A''s lists');
select is(jsonb_array_length(current_setting('test.xa')::jsonb -> 'personal_words'), 5, 'export has A''s words (and no one else''s)');
select ok(jsonb_array_length(current_setting('test.xa')::jsonb -> 'personal_vocab_imports') >= 4, 'export has A''s import log');
select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select ok(position('quả táo' in public.export_my_data()::text) = 0, 'B''s export never contains A''s words');
select pg_temp.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select lives_ok($$ select public.delete_my_account('XOA TAI KHOAN') $$, 'C deletes the account');
reset role;
select is((select count(*)::integer from public.personal_word_lists where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  + (select count(*)::integer from public.personal_words where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  + (select count(*)::integer from public.personal_vocab_imports where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0, 'account deletion removed every personal vocabulary row');
select is((select count(*)::integer from public.personal_words where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 5, 'A''s words survive C''s deletion');
select is_empty($$
  select c.conname from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in ('public.personal_word_lists'::regclass, 'public.personal_words'::regclass, 'public.personal_vocab_imports'::regclass)
    and c.confrelid not in ('auth.users'::regclass, 'public.personal_word_lists'::regclass)
$$, 'personal tables reference only auth.users and their own list table, never curated content');

select * from finish();
rollback;
