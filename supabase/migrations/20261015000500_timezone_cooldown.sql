-- Every per-day limit (AI quota, review daily_new_limit, XP cap, streaks) is keyed on the learner's local day,
-- read from profiles.timezone. Flipping between far-apart zones (e.g. Pacific/Kiritimati UTC+14 and
-- Etc/GMT+12 UTC-12) moved "today" back and forth and multiplied those limits within one real day.
-- A learner may now change their timezone at most once per 24 hours; the first change is always allowed.
-- Only learners (role authenticated) are limited; service_role, admins and migrations are not.

alter table public.profiles add column timezone_changed_at timestamptz;

comment on column public.profiles.timezone_changed_at is
  'Last time the learner changed timezone; a further change is refused for 24 hours (timezone_change_cooldown).';

create or replace function public.enforce_timezone_cooldown()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.timezone is not distinct from old.timezone then
    -- Not a change (the settings form re-sends the current zone): keep the stamp as it was.
    new.timezone_changed_at := old.timezone_changed_at;
    return new;
  end if;
  if current_user = 'authenticated'
     and old.timezone_changed_at is not null
     and old.timezone_changed_at > now() - interval '24 hours' then
    raise exception 'timezone_change_cooldown'
      using errcode = 'P0001',
            detail = to_char((old.timezone_changed_at + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  new.timezone_changed_at := now();
  return new;
end;
$$;

revoke execute on function public.enforce_timezone_cooldown() from public, anon, authenticated;

create trigger profiles_timezone_cooldown
  before update of timezone on public.profiles
  for each row execute function public.enforce_timezone_cooldown();
