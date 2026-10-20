begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Personal vocabulary in every language (en, ko, ja, de): lists, CSV rows with kana, hangul, umlauts and Eszett, the
-- identity of a word (NFC + lower case, as the CSV parser in packages/shared computes it), formula-looking cells kept
-- verbatim, the review queue's language and the export. Migrations: 20261016000300_personal_vocab.sql,
-- 20261016000800_progress_vocab_hardening.sql (import), 20261018130000_japanese.sql and 20261018210000_german.sql.

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pl-a@test.dev', '{}');

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- ===== One list per language =====
select set_config('test.len', public.create_personal_list('English', 'en') ->> 'id', true);
select set_config('test.lko', public.create_personal_list('한국어', 'ko') ->> 'id', true);
select set_config('test.lja', public.create_personal_list('日本語', 'ja') ->> 'id', true);
select set_config('test.lde', public.create_personal_list('Deutsch', 'de') ->> 'id', true);
select is((select array_agg(l ->> 'language_code' order by l ->> 'language_code') from jsonb_array_elements(public.list_personal_lists()) l),
  array['de', 'en', 'ja', 'ko'], 'a learner can keep a list in each of the four languages');
select throws_ok($$ select public.create_personal_list('Français', 'fr') $$, 'P0001', 'invalid_language', 'other languages are refused');
select throws_ok($$ select public.create_personal_list('Español', 'es') $$, 'P0001', 'invalid_language', 'including es');

-- ===== Japanese: kana, kanji, full-width text =====
select is(public.import_personal_words(current_setting('test.lja')::uuid, jsonb_build_array(
    jsonb_build_object('term', 'ありがとう', 'meaning', 'cảm ơn', 'pronunciation', 'arigatou', 'example', 'ありがとうございます。'),
    jsonb_build_object('term', '日本語', 'meaning', 'tiếng Nhật', 'pronunciation', 'にほんご'),
    jsonb_build_object('term', 'ＡＢＣ　ｔｅｓｔ', 'meaning', 'chữ rộng'),
    jsonb_build_object('term', 'カタカナ', 'meaning', 'katakana'))),
  '{"added": 4, "updated": 0, "unchanged": 0, "duplicates": 0, "invalid": []}'::jsonb, 'four Japanese words are imported');
select is((select array_agg(term order by position) from public.personal_words where list_id = current_setting('test.lja')::uuid),
  array['ありがとう', '日本語', 'ＡＢＣ ｔｅｓｔ', 'カタカナ'], 'kana and kanji are stored as typed; an ideographic space becomes a plain one');
select is((select example from public.personal_words where list_id = current_setting('test.lja')::uuid and term = 'ありがとう'),
  'ありがとうございます。', 'a Japanese sentence keeps its full stop');

-- ===== Korean: jamo and syllable spellings are one word =====
select is(public.import_personal_words(current_setting('test.lko')::uuid, jsonb_build_array(
    jsonb_build_object('term', normalize('한국어', NFD), 'meaning', 'tiếng Hàn'),
    jsonb_build_object('term', '한국어', 'meaning', 'tiếng Hàn (lại)'))) ->> 'added', '1',
  'NFD and NFC Hangul are the same word inside one import');
select is((select term from public.personal_words where list_id = current_setting('test.lko')::uuid), '한국어', 'and the stored spelling is the composed one');

-- ===== German: umlauts, Eszett, case =====
select is(public.import_personal_words(current_setting('test.lde')::uuid, jsonb_build_array(
    jsonb_build_object('term', 'der Apfel, "-"', 'meaning', 'quả táo', 'note', 'Apfel -> Äpfel'),
    jsonb_build_object('term', 'Äpfel', 'meaning', 'những quả táo'),
    jsonb_build_object('term', 'ÄPFEL', 'meaning', 'viết hoa'),
    jsonb_build_object('term', normalize('Ärger', NFD), 'meaning', 'sự bực mình'),
    jsonb_build_object('term', 'Straße', 'meaning', 'đường phố'),
    jsonb_build_object('term', 'STRASSE', 'meaning', 'viết kiểu ss'))) - 'invalid',
  '{"added": 5, "updated": 0, "unchanged": 0, "duplicates": 1}'::jsonb,
  'Äpfel and ÄPFEL are one word; Straße and STRASSE stay two (no ss folding for identity)');
select is((select array_agg(term order by position) from public.personal_words where list_id = current_setting('test.lde')::uuid),
  array['der Apfel, "-"', 'Äpfel', 'Ärger', 'Straße', 'STRASSE'], 'umlauts, quotes and commas survive; a decomposed Ä is composed');
select is(public.import_personal_words(current_setting('test.lde')::uuid, jsonb_build_array(
    jsonb_build_object('term', 'äpfel', 'meaning', 'quả táo (sửa)'))) - 'invalid',
  '{"added": 0, "updated": 1, "unchanged": 0, "duplicates": 0}'::jsonb, 'importing äpfel again updates the existing word');
select is((select term || '|' || meaning from public.personal_words where list_id = current_setting('test.lde')::uuid and term_key = 'äpfel'),
  'äpfel|quả táo (sửa)', 'the update takes the new spelling');

-- ===== Formula-looking cells are plain text =====
select is(public.import_personal_words(current_setting('test.len')::uuid, jsonb_build_array(
    jsonb_build_object('term', '-ing', 'meaning', '=1+1'),
    jsonb_build_object('term', '@home', 'meaning', '+84 là mã vùng'),
    jsonb_build_object('term', '=SUM(A1)', 'meaning', 'công thức'))) ->> 'added', '3', 'cells starting with = + - @ are imported');
select is((select array_agg(term || '|' || meaning order by position) from public.personal_words where list_id = current_setting('test.len')::uuid),
  array['-ing|=1+1', '@home|+84 là mã vùng', '=SUM(A1)|công thức'], 'and stored verbatim, never evaluated or altered');

-- ===== Review queue carries the list language =====
select is((public.get_personal_review_queue(current_setting('test.lja')::uuid) -> 'cards' -> 0 -> 'item' ->> 'language_code'), 'ja',
  'a Japanese list serves ja cards');
select is((public.get_personal_review_queue(current_setting('test.lde')::uuid) -> 'cards' -> 0 -> 'item' ->> 'language_code'), 'de',
  'a German list serves de cards');
select is((public.get_personal_review_queue(current_setting('test.lko')::uuid) -> 'cards' -> 0 -> 'item' ->> 'language_code'), 'ko',
  'a Korean list serves ko cards');
select is((public.get_personal_review_queue(current_setting('test.lja')::uuid) -> 'cards' -> 0 -> 'item' -> 'front' ->> 'romanization'), 'arigatou',
  'the pronunciation column is the card''s romanization');
select is((public.get_personal_review_queue(current_setting('test.lde')::uuid) -> 'cards' -> 0 -> 'item' -> 'back' -> 'meaning' ->> 'vi'), 'quả táo',
  'the meaning is served as Vietnamese text');

-- ===== Grading and editing work in every language =====
select set_config('test.wde', (select id::text from public.personal_words where list_id = current_setting('test.lde')::uuid and term_key = 'ärger'), true);
select is((public.grade_personal_word(current_setting('test.wde')::uuid, 3::smallint, gen_random_uuid()) ->> 'state'), 'learning',
  'a German word is graded with the shared FSRS scheduler');
select is((public.update_personal_word(current_setting('test.wde')::uuid, 'Ärger (m.)', 'sự bực mình', null, null, null) ->> 'term'), 'Ärger (m.)',
  'a German word can be edited');
select set_config('test.wja', (select id::text from public.personal_words where list_id = current_setting('test.lja')::uuid and term = '日本語'), true);
select is((public.update_personal_word(current_setting('test.wja')::uuid, '日本語', 'tiếng Nhật', 'ví dụ', null, 'にほんご') ->> 'example'), 'ví dụ',
  'a Japanese word can be edited');
select throws_ok(format('select public.update_personal_word(%L, ''ÄPFEL'', ''x'', null, null, null)', current_setting('test.wde')), 'P0001', 'duplicate_term',
  'editing into a spelling that already exists in the list is refused (upper case counts)');
select is(public.delete_personal_word(current_setting('test.wja')::uuid), '{"deleted": true}'::jsonb, 'a Japanese word can be deleted');

-- ===== Export covers every language =====
select is((select array_agg(l ->> 'language_code' order by l ->> 'language_code')
    from jsonb_array_elements(public.export_my_data() -> 'personal_word_lists') l), array['de', 'en', 'ja', 'ko'],
  'the data export has the lists of all four languages');
select is((select count(*)::integer from jsonb_array_elements(public.export_my_data() -> 'personal_words') w where w ->> 'term' in ('Straße', 'カタカナ', 'ありがとう')),
  3, 'and their words');

-- ===== Another learner reads none of it =====
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pl-b@test.dev', '{}');
set local role authenticated;
select pg_temp.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select count(*)::integer from public.personal_words), 0, 'another learner reads no words');
select throws_ok(format('select public.import_personal_words(%L, ''[{"term":"a","meaning":"b"}]'')', current_setting('test.lde')), 'P0001', 'list_not_found',
  'and cannot import into someone else''s German list');

select * from finish();
rollback;
