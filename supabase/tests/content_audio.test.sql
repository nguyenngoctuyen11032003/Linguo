-- Listening audio (migration 20261017000200_content_audio.sql, docs/AUDIO.md): public bucket content-audio and the
-- audio_assets registry, readable by everyone and writable by service_role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(exists (select 1 from storage.buckets where id = 'content-audio' and public), 'content-audio bucket exists and is public');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') || coalesce(with_check, '')) like '%content-audio%'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and roles && array['anon', 'authenticated', 'public']::name[]
), 'no client write policy on content-audio objects');

select has_table('public', 'audio_assets', 'audio_assets exists');
select ok((select relrowsecurity from pg_class where oid = 'public.audio_assets'::regclass), 'RLS enabled');

-- service_role writes.
set local role service_role;
select lives_ok($$insert into public.audio_assets (id, lang, voice, model, storage_path, duration_ms, byte_size, text_sha256)
  values ('ko-0123456789abcdef0123456789abcdef', 'ko', '남자=Charon|여자=Kore', 'gemini-3.8-flash-tts',
          'ko/ko-0123456789abcdef0123456789abcdef.wav', 2500, 120044, repeat('a', 64))$$, 'service_role can insert');
select throws_ok($$insert into public.audio_assets (id, lang, voice, model, storage_path, duration_ms, byte_size, text_sha256)
  values ('ko-0123', 'ko', 'Kore', 'm', 'ko/ko-0123.wav', 1, 100, repeat('a', 64))$$, '23514', null, 'id shape is checked');
select throws_ok($$insert into public.audio_assets (id, lang, voice, model, storage_path, duration_ms, byte_size, text_sha256)
  values ('en-0123456789abcdef0123456789abcdef', 'ko', 'Kore', 'm', 'ko/en-0123456789abcdef0123456789abcdef.wav', 1, 100, repeat('a', 64))$$,
  '23514', null, 'id language prefix must match lang');
select throws_ok($$insert into public.audio_assets (id, lang, voice, model, storage_path, duration_ms, byte_size, text_sha256)
  values ('en-0123456789abcdef0123456789abcdef', 'en', 'Kore', 'm', 'en/other.wav', 1, 100, repeat('a', 64))$$,
  '23514', null, 'storage path follows <lang>/<id>.wav');
select throws_ok($$insert into public.audio_assets (id, lang, voice, model, storage_path, duration_ms, byte_size, text_sha256)
  values ('en-0123456789abcdef0123456789abcdef', 'en', 'Kore', 'm', 'en/en-0123456789abcdef0123456789abcdef.wav', 0, 100, repeat('a', 64))$$,
  '23514', null, 'duration must be positive');
reset role;

-- Everyone reads, nobody else writes.
set local role anon;
select is((select count(*)::int from public.audio_assets), 1, 'anon can read');
select throws_ok($$insert into public.audio_assets (id, lang, voice, model, storage_path, duration_ms, byte_size, text_sha256)
  values ('en-0123456789abcdef0123456789abcdef', 'en', 'Kore', 'm', 'en/en-0123456789abcdef0123456789abcdef.wav', 1, 100, repeat('a', 64))$$,
  '42501', null, 'anon cannot insert');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is((select count(*)::int from public.audio_assets), 1, 'authenticated can read');
select throws_ok($$update public.audio_assets set duration_ms = 1$$, '42501', null, 'authenticated cannot update');
select throws_ok($$delete from public.audio_assets$$, '42501', null, 'authenticated cannot delete');
reset role;

select * from finish();
rollback;
