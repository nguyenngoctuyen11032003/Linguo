-- Linguo spec P2: personal vocabulary lists imported from CSV, studied with the existing FSRS scheduler.
-- Design: docs/superpowers/specs/2026-10-14-linguo-personal-vocab-design.md.
--
-- Personal words live in their own tables and never touch the curated content tables (learning_items ...),
-- review_cards/review_logs, mastery, streaks or analytics. Clients read their own rows through RLS and write
-- only through the SECURITY DEFINER RPCs below. Scheduling reuses public.srs_next / srs_previews
-- (20261014000310_reviews_fsrs.sql), the same functions grade_review uses, and the "is due" rules of
-- get_review_queue / grade_review (20261015000600_review_grade_guard.sql).
--
-- Limits (mirrored in packages/shared/src/personal-vocab/limits.ts): 20 lists per user, 1000 words per list,
-- 5000 words per user, 1000 rows per import call, 10 imports per hour, field lengths below.

-- ---------------------------------------------------------------------------
-- Text helpers
-- ---------------------------------------------------------------------------

-- Cleans user text: NFC, control and bidi/zero-width characters removed (turned into spaces / dropped),
-- whitespace runs collapsed, trimmed. Null when nothing is left. Formula prefixes (= + - @) are kept as text.
create or replace function public.personal_clean(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(normalize(p_text, NFC), '[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]', '', 'g'),
    '[\s\x01-\x1f\x7f]+', ' ', 'g')), '');
$$;

-- Identity of a word inside a list: the cleaned term, lower-cased.
create or replace function public.personal_term_key(p_term text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(public.personal_clean(p_term));
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.personal_word_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  language_code text not null check (language_code in ('en', 'ko')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index personal_word_lists_user_name_key on public.personal_word_lists (user_id, lower(name));

create trigger personal_word_lists_set_updated_at
  before update on public.personal_word_lists
  for each row execute function public.set_updated_at();

create table public.personal_words (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.personal_word_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Import order: new words are studied in this order.
  position integer not null default 0,
  term text not null check (char_length(term) between 1 and 120),
  term_key text not null,
  meaning text not null check (char_length(meaning) between 1 and 300),
  example text check (char_length(example) between 1 and 300),
  note text check (char_length(note) between 1 and 300),
  pronunciation text check (char_length(pronunciation) between 1 and 100),
  -- FSRS state: same columns and meaning as public.review_cards.
  fsrs_state text not null default 'new' check (fsrs_state in ('new', 'learning', 'review', 'relearning')),
  step smallint not null default 0 check (step >= 0),
  stability double precision check (stability >= 0),
  difficulty double precision check (difficulty >= 0 and difficulty <= 10),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  due_at timestamptz not null default now(),
  last_review_at timestamptz,
  -- The latest grade, kept so that a retry with the same idempotency key replays instead of grading twice.
  last_grade_key uuid,
  last_grade_rating smallint check (last_grade_rating between 1 and 4),
  last_grade_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_words_term_key_matches check (term_key = public.personal_term_key(term)),
  unique (list_id, term_key)
);

create index personal_words_list_position_idx on public.personal_words (list_id, position, id);
create index personal_words_user_idx on public.personal_words (user_id);
create index personal_words_user_reviewed_idx on public.personal_words (user_id, last_review_at desc) where last_review_at is not null;

create trigger personal_words_set_updated_at
  before update on public.personal_words
  for each row execute function public.set_updated_at();

-- Import rate-limit bookkeeping (kept at most one day by import_personal_words). list_id is set null when the
-- list is deleted, so deleting a list does not reset the learner's hourly allowance.
create table public.personal_vocab_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid references public.personal_word_lists (id) on delete set null,
  added integer not null default 0 check (added >= 0),
  created_at timestamptz not null default now()
);

create index personal_vocab_imports_user_created_idx on public.personal_vocab_imports (user_id, created_at desc);
create index personal_vocab_imports_list_id_idx on public.personal_vocab_imports (list_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges: owner reads, no direct writes
-- ---------------------------------------------------------------------------

alter table public.personal_word_lists enable row level security;
alter table public.personal_words enable row level security;
alter table public.personal_vocab_imports enable row level security;

create policy "personal word lists: read own" on public.personal_word_lists
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "personal words: read own" on public.personal_words
  for select to authenticated using ((select auth.uid()) = user_id);
-- personal_vocab_imports: no policy, no grant (server-only).

revoke all on public.personal_word_lists, public.personal_words, public.personal_vocab_imports from anon, authenticated;
grant select on public.personal_word_lists to authenticated;
-- The replay columns (last_grade_*) are internal.
grant select (id, list_id, user_id, position, term, term_key, meaning, example, note, pronunciation, fsrs_state, step,
  stability, difficulty, reps, lapses, scheduled_days, due_at, last_review_at, created_at, updated_at)
  on public.personal_words to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Validates and normalises p_rows (jsonb array of {term, meaning, example?, note?, pronunciation?}).
-- reason is null for a usable row; dup marks later rows repeating an earlier valid term_key.
create or replace function public.personal_parse_rows(p_rows jsonb)
returns table (
  idx integer, term text, term_key text, meaning text, example text, note text, pronunciation text,
  reason text, dup boolean
)
language sql
stable
set search_path = ''
as $$
  with e as (
    select (o.ord - 1)::integer as idx, o.val
    from jsonb_array_elements(p_rows) with ordinality as o (val, ord)
  ),
  c as (
    select e.idx,
      jsonb_typeof(e.val) = 'object' as is_obj,
      exists (
        select 1 from unnest(array['term', 'meaning', 'example', 'note', 'pronunciation']) as k
        where jsonb_typeof(e.val -> k) not in ('string', 'null')
      ) as bad_type,
      public.personal_clean(case when jsonb_typeof(e.val -> 'term') = 'string' then e.val ->> 'term' end) as term,
      public.personal_clean(case when jsonb_typeof(e.val -> 'meaning') = 'string' then e.val ->> 'meaning' end) as meaning,
      public.personal_clean(case when jsonb_typeof(e.val -> 'example') = 'string' then e.val ->> 'example' end) as example,
      public.personal_clean(case when jsonb_typeof(e.val -> 'note') = 'string' then e.val ->> 'note' end) as note,
      public.personal_clean(case when jsonb_typeof(e.val -> 'pronunciation') = 'string' then e.val ->> 'pronunciation' end) as pronunciation
    from e
  ),
  r as (
    select c.*,
      case
        when not c.is_obj then 'not_an_object'
        when c.bad_type then 'invalid_field'
        when c.term is null then 'term_required'
        when char_length(c.term) > 120 then 'term_too_long'
        when c.meaning is null then 'meaning_required'
        when char_length(c.meaning) > 300 then 'meaning_too_long'
        when char_length(c.example) > 300 then 'example_too_long'
        when char_length(c.note) > 300 then 'note_too_long'
        when char_length(c.pronunciation) > 100 then 'pronunciation_too_long'
      end as reason,
      lower(c.term) as term_key
    from c
  )
  select r.idx, r.term, r.term_key, r.meaning, r.example, r.note, r.pronunciation, r.reason,
    r.reason is null and row_number() over (partition by r.reason is null, r.term_key order by r.idx) > 1 as dup
  from r
  order by r.idx;
$$;

-- Is a word due now under the review queue's day model: learning/relearning at due_at <= now, review/new before
-- the end of the learner's local day (p_day_end).
create or replace function public.personal_word_due(p_state text, p_due_at timestamptz, p_now timestamptz, p_day_end timestamptz)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_state in ('learning', 'relearning') then p_due_at <= p_now
    else p_due_at < p_day_end
  end;
$$;

-- End of the learner's local day.
create or replace function public.personal_day_end(p_user uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((public.learning_user_today(p_user) + 1)::timestamp)
    at time zone coalesce((select p.timezone from public.profiles p where p.id = p_user), 'Asia/Ho_Chi_Minh');
$$;

create or replace function public.personal_vocab_lock(p_user uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('personal_vocab:' || p_user::text, 0));
$$;

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

create or replace function public.list_personal_lists()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_day_end timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_day_end := public.personal_day_end(v_uid);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.name, 'language_code', l.language_code,
      'word_count', s.n, 'due_count', s.due, 'created_at', l.created_at) order by l.created_at, l.id)
    from public.personal_word_lists l
    cross join lateral (
      select count(*)::integer as n,
        (count(*) filter (where public.personal_word_due(w.fsrs_state, w.due_at, v_now, v_day_end)))::integer as due
      from public.personal_words w
      where w.list_id = l.id
    ) s
    where l.user_id = v_uid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_personal_list(p_name text, p_language text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.personal_clean(p_name);
  v_list public.personal_word_lists;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if p_language is null or p_language not in ('en', 'ko') then
    raise exception using errcode = 'P0001', message = 'invalid_language';
  end if;
  perform public.personal_vocab_lock(v_uid);
  if (select count(*) from public.personal_word_lists l where l.user_id = v_uid) >= 20 then
    raise exception using errcode = 'P0001', message = 'list_limit';
  end if;
  begin
    insert into public.personal_word_lists (user_id, name, language_code)
    values (v_uid, v_name, p_language)
    returning * into v_list;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'name_taken';
  end;
  return jsonb_build_object('id', v_list.id, 'name', v_list.name, 'language_code', v_list.language_code,
    'word_count', 0, 'due_count', 0, 'created_at', v_list.created_at);
end;
$$;

create or replace function public.rename_personal_list(p_list_id uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.personal_clean(p_name);
  v_list public.personal_word_lists;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  begin
    update public.personal_word_lists l set name = v_name
    where l.id = p_list_id and l.user_id = v_uid
    returning * into v_list;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'name_taken';
  end;
  if not found then
    raise exception using errcode = 'P0001', message = 'list_not_found';
  end if;
  return jsonb_build_object('id', v_list.id, 'name', v_list.name, 'language_code', v_list.language_code);
end;
$$;

create or replace function public.delete_personal_list(p_list_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  delete from public.personal_word_lists l where l.id = p_list_id and l.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'list_not_found';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------

-- Adds p_rows to a list. Words already in the list (same term_key) keep their schedule and only get their text
-- refreshed, so importing the same file again changes nothing. A list or user cap breach rejects the whole call.
-- Returns {added, updated, unchanged, duplicates, invalid: [{index, reason}]}.
create or replace function public.import_personal_words(p_list_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_list public.personal_word_lists;
  v_invalid jsonb;
  v_dups integer;
  v_valid integer;
  v_new integer;
  v_list_count integer;
  v_user_count integer;
  v_base integer;
  v_added integer;
  v_updated integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_rows';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception using errcode = 'P0001', message = 'too_many_rows';
  end if;

  perform public.personal_vocab_lock(v_uid);
  select l.* into v_list from public.personal_word_lists l where l.id = p_list_id and l.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'list_not_found';
  end if;

  delete from public.personal_vocab_imports i where i.user_id = v_uid and i.created_at < v_now - interval '1 day';
  if (select count(*) from public.personal_vocab_imports i
      where i.user_id = v_uid and i.created_at > v_now - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  select (count(*) filter (where x.dup))::integer,
         (count(*) filter (where x.reason is null and not x.dup))::integer,
         (count(*) filter (where x.reason is null and not x.dup and not exists (
            select 1 from public.personal_words w where w.list_id = v_list.id and w.term_key = x.term_key)))::integer,
         coalesce(jsonb_agg(jsonb_build_object('index', x.idx, 'reason', x.reason) order by x.idx)
           filter (where x.reason is not null), '[]'::jsonb)
    into v_dups, v_valid, v_new, v_invalid
  from public.personal_parse_rows(p_rows) x;

  select count(*)::integer, coalesce(max(w.position), -1) + 1
    into v_list_count, v_base
  from public.personal_words w where w.list_id = v_list.id;
  select count(*)::integer into v_user_count from public.personal_words w where w.user_id = v_uid;
  if v_list_count + v_new > 1000 then
    raise exception using errcode = 'P0001', message = 'list_full';
  end if;
  if v_user_count + v_new > 5000 then
    raise exception using errcode = 'P0001', message = 'vocab_full';
  end if;

  insert into public.personal_words (list_id, user_id, position, term, term_key, meaning, example, note, pronunciation, due_at)
  select v_list.id, v_uid, v_base + (row_number() over (order by x.idx))::integer - 1,
         x.term, x.term_key, x.meaning, x.example, x.note, x.pronunciation, v_now
  from public.personal_parse_rows(p_rows) x
  where x.reason is null and not x.dup
    and not exists (select 1 from public.personal_words w where w.list_id = v_list.id and w.term_key = x.term_key)
  order by x.idx
  on conflict (list_id, term_key) do nothing;
  get diagnostics v_added = row_count;

  update public.personal_words w
  set term = x.term, meaning = x.meaning, example = x.example, note = x.note, pronunciation = x.pronunciation
  from public.personal_parse_rows(p_rows) x
  where w.list_id = v_list.id and w.term_key = x.term_key and x.reason is null and not x.dup
    and (w.term, w.meaning, w.example, w.note, w.pronunciation)
      is distinct from (x.term, x.meaning, x.example, x.note, x.pronunciation);
  get diagnostics v_updated = row_count;

  insert into public.personal_vocab_imports (user_id, list_id, added, created_at) values (v_uid, v_list.id, v_added, v_now);

  return jsonb_build_object(
    'added', v_added,
    'updated', v_updated,
    'unchanged', greatest(0, v_valid - v_added - v_updated),
    'duplicates', v_dups,
    'invalid', v_invalid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Single-word edits
-- ---------------------------------------------------------------------------

create or replace function public.update_personal_word(
  p_word_id uuid, p_term text, p_meaning text, p_example text, p_note text, p_pronunciation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_term text := public.personal_clean(p_term);
  v_meaning text := public.personal_clean(p_meaning);
  v_example text := public.personal_clean(p_example);
  v_note text := public.personal_clean(p_note);
  v_pron text := public.personal_clean(p_pronunciation);
  v_word public.personal_words;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if v_term is null or char_length(v_term) > 120 then
    raise exception using errcode = 'P0001', message = 'invalid_term';
  end if;
  if v_meaning is null or char_length(v_meaning) > 300 then
    raise exception using errcode = 'P0001', message = 'invalid_meaning';
  end if;
  if char_length(v_example) > 300 or char_length(v_note) > 300 or char_length(v_pron) > 100 then
    raise exception using errcode = 'P0001', message = 'field_too_long';
  end if;
  begin
    update public.personal_words w
    set term = v_term, term_key = lower(v_term), meaning = v_meaning, example = v_example, note = v_note,
        pronunciation = v_pron
    where w.id = p_word_id and w.user_id = v_uid
    returning * into v_word;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'duplicate_term';
  end;
  if not found then
    raise exception using errcode = 'P0001', message = 'word_not_found';
  end if;
  return jsonb_build_object('id', v_word.id, 'term', v_word.term, 'meaning', v_word.meaning,
    'example', v_word.example, 'note', v_word.note, 'pronunciation', v_word.pronunciation);
end;
$$;

create or replace function public.delete_personal_word(p_word_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  delete from public.personal_words w where w.id = p_word_id and w.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'word_not_found';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

-- Due words of one list, shaped like get_review_queue cards (reviewCardSchema) so the flashcard components
-- are reused. card_id = item_id = the word id; one card per word (look at the word, recall the meaning).
-- Order: learning/relearning by due time, then review (lowest retrievability first), then new in import order.
create or replace function public.get_personal_review_queue(p_list_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_list public.personal_word_lists;
  v_tz text;
  v_day_end timestamptz;
  v_take integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_cards jsonb;
  v_served integer;
  v_due_total integer;
  v_new_total integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select l.* into v_list from public.personal_word_lists l where l.id = p_list_id and l.user_id = v_uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'list_not_found';
  end if;
  select coalesce(p.timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.profiles p where p.id = v_uid;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');
  v_day_end := public.personal_day_end(v_uid);

  select count(*)::integer, (count(*) filter (where w.fsrs_state = 'new'))::integer
    into v_due_total, v_new_total
  from public.personal_words w
  where w.list_id = v_list.id and public.personal_word_due(w.fsrs_state, w.due_at, v_now, v_day_end);

  with picked as (
    select s.*
    from (
      select w.*,
        case when w.fsrs_state in ('learning', 'relearning') then 1 when w.fsrs_state = 'review' then 2 else 3 end as grp,
        case when w.fsrs_state = 'review' then
          public.srs_retrievability(w.stability, greatest(0, extract(epoch from (v_now - coalesce(w.last_review_at, v_now))) / 86400.0))
        end as retr
      from public.personal_words w
      where w.list_id = v_list.id and public.personal_word_due(w.fsrs_state, w.due_at, v_now, v_day_end)
    ) s
    order by s.grp, case when s.grp = 1 then s.due_at end, s.retr, s.position, s.id
    limit v_take
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'card_id', pk.id,
           'item_id', pk.id,
           'direction', 'recognize',
           'state', pk.fsrs_state,
           'is_new', pk.fsrs_state = 'new',
           'due_at', pk.due_at,
           'postpone_count', 0,
           'item', jsonb_build_object(
             'language_code', v_list.language_code,
             'item_type', 'vocab',
             'front', jsonb_strip_nulls(jsonb_build_object('text', pk.term, 'romanization', pk.pronunciation)),
             'back', jsonb_strip_nulls(jsonb_build_object(
               'meaning', jsonb_build_object('vi', pk.meaning),
               'examples', case when pk.example is null then '[]'::jsonb
                 else jsonb_build_array(jsonb_build_object('target', pk.example)) end,
               'note', pk.note)),
             'audio_path', null),
           'previews', public.srs_previews(pk.fsrs_state, pk.step, pk.stability, pk.difficulty, pk.last_review_at, v_now, v_tz)
         ) order by pk.grp, case when pk.grp = 1 then pk.due_at end, pk.retr, pk.position, pk.id), '[]'::jsonb),
         count(*)::integer
    into v_cards, v_served
  from picked pk;

  return jsonb_build_object(
    'cards', v_cards,
    'totals', jsonb_build_object('due_total', v_due_total, 'served', v_served, 'new_available', v_new_total)
  );
end;
$$;

-- Grades one word at the server's now(). Returns {word_id, state, due_at, interval_minutes, replayed}.
create or replace function public.grade_personal_word(p_word_id uuid, p_rating smallint, p_idempotency_key uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_word public.personal_words;
  v_tz text;
  v_next jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_rating is null or p_rating not between 1 and 4 or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_rating';
  end if;

  select w.* into v_word from public.personal_words w where w.id = p_word_id and w.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'word_not_found';
  end if;
  -- A retry of the latest grade replays its result; the same key with another rating is a conflict.
  if v_word.last_grade_key = p_idempotency_key then
    if v_word.last_grade_rating = p_rating then
      return v_word.last_grade_result || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  -- Counted after the word lock, so concurrent grades are counted in turn.
  if (select count(*) from public.personal_words w
      where w.user_id = v_uid and w.last_review_at > v_now - interval '60 seconds') >= 60 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  if not public.personal_word_due(v_word.fsrs_state, v_word.due_at, v_now, public.personal_day_end(v_uid)) then
    raise exception using errcode = 'P0001', message = 'word_not_due';
  end if;

  select coalesce(p.timezone, 'Asia/Ho_Chi_Minh') into v_tz from public.profiles p where p.id = v_uid;
  v_next := public.srs_next(v_word.fsrs_state, v_word.step, v_word.stability, v_word.difficulty,
    v_word.last_review_at, p_rating, v_now, coalesce(v_tz, 'Asia/Ho_Chi_Minh'));

  v_result := jsonb_build_object(
    'word_id', v_word.id,
    'state', v_next ->> 'state',
    'due_at', (v_next ->> 'due_at')::timestamptz,
    'interval_minutes', (v_next ->> 'interval_minutes')::integer,
    'replayed', false
  );

  update public.personal_words
  set fsrs_state = v_next ->> 'state',
      step = (v_next ->> 'step')::smallint,
      stability = (v_next ->> 'stability')::double precision,
      difficulty = (v_next ->> 'difficulty')::double precision,
      scheduled_days = (v_next ->> 'scheduled_days')::integer,
      due_at = (v_next ->> 'due_at')::timestamptz,
      last_review_at = v_now,
      reps = reps + 1,
      lapses = lapses + case when coalesce((v_next ->> 'lapse')::boolean, false) then 1 else 0 end,
      last_grade_key = p_idempotency_key,
      last_grade_rating = p_rating,
      last_grade_result = v_result
  where id = v_word.id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account export and deletion (spec 7 §1): the three tables are keyed by user_id with ON DELETE CASCADE from
-- auth.users, so deleting the account removes them; export_my_data reads them through this list.
-- Copied from 20261015000610_export_exam_data.sql plus the personal vocabulary tables.
-- ---------------------------------------------------------------------------
create or replace function public.account_optional_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['study_sessions', 'activity_days', 'user_badges', 'analytics_events', 'exam_attempts', 'exam_answers',
    'content_reports', 'notification_prefs', 'notifications',
    'personal_word_lists', 'personal_words', 'personal_vocab_imports'];
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.personal_clean(text) from public, anon, authenticated;
revoke all on function public.personal_term_key(text) from public, anon, authenticated;
revoke all on function public.personal_parse_rows(jsonb) from public, anon, authenticated;
revoke all on function public.personal_word_due(text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.personal_day_end(uuid) from public, anon, authenticated;
revoke all on function public.personal_vocab_lock(uuid) from public, anon, authenticated;
revoke all on function public.account_optional_tables() from public, anon, authenticated;

revoke all on function public.list_personal_lists() from public, anon;
revoke all on function public.create_personal_list(text, text) from public, anon;
revoke all on function public.rename_personal_list(uuid, text) from public, anon;
revoke all on function public.delete_personal_list(uuid) from public, anon;
revoke all on function public.import_personal_words(uuid, jsonb) from public, anon;
revoke all on function public.update_personal_word(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.delete_personal_word(uuid) from public, anon;
revoke all on function public.get_personal_review_queue(uuid, integer) from public, anon;
revoke all on function public.grade_personal_word(uuid, smallint, uuid) from public, anon;
grant execute on function public.list_personal_lists() to authenticated;
grant execute on function public.create_personal_list(text, text) to authenticated;
grant execute on function public.rename_personal_list(uuid, text) to authenticated;
grant execute on function public.delete_personal_list(uuid) to authenticated;
grant execute on function public.import_personal_words(uuid, jsonb) to authenticated;
grant execute on function public.update_personal_word(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.delete_personal_word(uuid) to authenticated;
grant execute on function public.get_personal_review_queue(uuid, integer) to authenticated;
grant execute on function public.grade_personal_word(uuid, smallint, uuid) to authenticated;
