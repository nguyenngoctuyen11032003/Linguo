-- profiles.timezone may change at most once per 24 hours for a learner (20261015000500_timezone_cooldown.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.dev'),
  ('22222222-2222-4222-8222-222222222222', 'b@test.dev');

select is((select timezone_changed_at from public.profiles where id = '11111111-1111-4111-8111-111111111111'), null, 'new profile has no timezone change yet');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

select throws_ok(
  $$update public.profiles set timezone_changed_at = null where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'learner cannot write timezone_changed_at directly'
);
select lives_ok(
  $$update public.profiles set timezone = 'Pacific/Kiritimati' where id = '11111111-1111-4111-8111-111111111111'$$,
  'first timezone change is allowed'
);
select lives_ok(
  $$update public.profiles set display_name = 'An', timezone = 'Pacific/Kiritimati' where id = '11111111-1111-4111-8111-111111111111'$$,
  're-sending the same timezone with the profile form is not a change'
);
select throws_ok(
  $$update public.profiles set timezone = 'Etc/GMT+12' where id = '11111111-1111-4111-8111-111111111111'$$,
  'P0001', 'timezone_change_cooldown', 'a second change within 24 hours is refused'
);

reset role;
select is((select timezone from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'Pacific/Kiritimati', 'timezone kept after the refused change');
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'An', 'the same-zone save went through');

-- A day later the learner may change again.
update public.profiles set timezone_changed_at = now() - interval '25 hours' where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select lives_ok(
  $$update public.profiles set timezone = 'Asia/Ho_Chi_Minh' where id = '11111111-1111-4111-8111-111111111111'$$,
  'change allowed again after 24 hours'
);

-- service_role (and the table owner) are not limited.
reset role;
update public.profiles set timezone = 'Asia/Tokyo' where id = '22222222-2222-4222-8222-222222222222';
set local role service_role;
select lives_ok(
  $$update public.profiles set timezone = 'Asia/Seoul' where id = '22222222-2222-4222-8222-222222222222'$$,
  'service_role may change timezone again at once'
);

select * from finish();
rollback;
