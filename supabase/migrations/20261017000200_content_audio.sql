-- Linguo: recorded audio for listening content (docs/AUDIO.md).
--
-- Audio is generated OFFLINE by `pnpm audio:generate` (scripts/generate-audio.mjs, Gemini TTS), never at request time.
-- Each file lives in the public Storage bucket `content-audio` at `<lang>/<audio_asset_id>.wav`, where
-- audio_asset_id = `<lang>-<first 32 hex of sha256(lang \n voice \n NFC text)>` (AUDIO_ASSET_ID_RE in
-- packages/shared/src/content/audio.ts). The id is written into the content YAML (`audio_asset_id`) and flows through
-- the existing lesson/exam RPCs unchanged. Public URL contract:
--   ${SUPABASE_URL}/storage/v1/object/public/content-audio/<lang>/<audio_asset_id>.wav
--
-- * Bucket: public read (no auth needed for /object/public), no insert/update/delete policies for anon or
--   authenticated, so only service_role (which bypasses RLS) can write. No select policy on storage.objects either:
--   files are fetched by exact URL, the bucket cannot be listed by clients.
-- * public.audio_assets: server-side registry of what has been uploaded (one row per file). Readable by everyone
--   (it holds no user data and nothing secret: the text itself is not stored, only its sha256), writable by
--   service_role only.

-- ---------------------------------------------------------------------------
-- Storage bucket. Written defensively: the storage schema is owned by the Storage service and some columns
-- (file_size_limit, allowed_mime_types) are added by its own migrations.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets not found: skipping content-audio bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('content-audio', 'content-audio', true)
  on conflict (id) do update set public = true;

  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 10485760 where id = 'content-audio'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set allowed_mime_types = array['audio/wav'] where id = 'content-audio'$q$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registry
-- ---------------------------------------------------------------------------
create table public.audio_assets (
  id text primary key check (id ~ '^[a-z]{2}-[0-9a-f]{32}$'),
  lang text not null check (lang ~ '^[a-z]{2}$'),
  -- Voice key used for the id: a prebuilt voice name, or "Speaker=Voice|Speaker=Voice" for a two-speaker dialogue.
  voice text not null check (char_length(voice) between 1 and 200),
  model text not null check (char_length(model) between 1 and 100),
  storage_path text not null unique,
  mime_type text not null default 'audio/wav' check (mime_type = 'audio/wav'),
  duration_ms integer not null check (duration_ms > 0 and duration_ms <= 600000),
  byte_size integer not null check (byte_size > 44 and byte_size <= 10485760),
  -- sha256 hex of the NFC-normalised spoken text (the text itself stays in content/).
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint audio_assets_lang_prefix check (left(id, 3) = lang || '-'),
  constraint audio_assets_path check (storage_path = lang || '/' || id || '.wav')
);

comment on table public.audio_assets is
  'Offline-generated listening audio in Storage bucket content-audio (docs/AUDIO.md). Written by scripts/generate-audio.mjs with the service role.';

alter table public.audio_assets enable row level security;

create policy "audio assets: readable by everyone" on public.audio_assets
  for select to anon, authenticated using (true);

revoke all on public.audio_assets from anon, authenticated;
grant select on public.audio_assets to anon, authenticated;
grant all on public.audio_assets to service_role;
