-- Linguo foundation: profiles + user_preferences, created by trigger on sign-up, protected by RLS.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  locale text not null default 'vi' check (locale in ('vi')),
  timezone text not null default 'Asia/Ho_Chi_Minh' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user; created by on_auth_user_created.';
comment on table public.user_preferences is 'UI preferences synced across devices.';

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Reject timezone values that are not real IANA zones (the column only has a length check).
create or replace function public.validate_profile_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile_timezone();

-- Create profile + preferences for every new auth user (email or OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text := coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(regexp_replace(raw_name, '^\s+|\s+$', '', 'g'), 60), ''))
  on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: a user may read and update only their own rows.
-- No insert/delete policies: rows are created by the trigger and removed by cascade.
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "preferences: read own" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences: update own" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Privileges: least privilege on top of RLS. Rows are created by the trigger and removed by cascade,
-- so clients get no INSERT/DELETE, and may update only the user-editable columns.
revoke all on public.profiles, public.user_preferences from anon, authenticated;
grant select on public.profiles, public.user_preferences to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant update (theme, reduce_motion) on public.user_preferences to authenticated;
