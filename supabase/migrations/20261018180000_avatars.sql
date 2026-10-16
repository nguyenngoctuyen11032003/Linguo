-- Profile avatars: a public "avatars" bucket (one folder per user) and profiles.avatar_path pointing at the file.
-- Public read (the image is shown in the app bar and to teachers); only the owner may write inside their own folder.

alter table public.profiles add column avatar_path text
  check (avatar_path is null or (char_length(avatar_path) <= 200 and avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'));

comment on column public.profiles.avatar_path is 'Object path inside the avatars bucket: <user id>/<file>. Null = initial-letter avatar.';

grant update (avatar_path) on public.profiles to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets not found: skipping avatars bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 2097152 where id = 'avatars'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'avatars'$q$;
  end if;

  execute $p$create policy "avatars: insert own folder" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy "avatars: select own folder" on storage.objects
    for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy "avatars: update own folder" on storage.objects
    for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy "avatars: delete own folder" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
end;
$$;
