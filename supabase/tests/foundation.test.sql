begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.dev', '{"display_name": "  An  "}'),
  ('22222222-2222-4222-8222-222222222222', 'b@test.dev', '{"full_name": "Bình (Google)"}'),
  ('33333333-3333-4333-8333-333333333333', 'c@test.dev', '{}');

-- Trigger creates profile + preferences
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'An', 'display_name copied and trimmed');
select is((select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'Bình (Google)', 'falls back to OAuth full_name');
select is((select display_name from public.profiles where id = '33333333-3333-4333-8333-333333333333'), null, 'no name -> null');
select is((select theme from public.user_preferences where user_id = '33333333-3333-4333-8333-333333333333'), 'system', 'default theme is system');
select is((select timezone from public.profiles where id = '33333333-3333-4333-8333-333333333333'), 'Asia/Ho_Chi_Minh', 'default timezone');

-- As user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select is((select count(*) from public.profiles)::int, 1, 'A sees only own profile');
select is((select count(*) from public.user_preferences)::int, 1, 'A sees only own preferences');
update public.profiles set display_name = 'hacked' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set display_name = 'An Nguyễn' where id = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$insert into public.profiles (id) values ('44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'A cannot insert profiles'
);
select throws_ok(
  $$update public.user_preferences set theme = 'neon' where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'theme check constraint'
);

-- As anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*) from public.profiles)::int, 0, 'anon sees no profiles');

-- Verify as owner
reset role;
select is((select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'Bình (Google)', 'B untouched by A');
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'An Nguyễn', 'A updated own profile');

select * from finish();
rollback;
