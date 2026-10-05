-- =============================================================================
-- DEMO DATA for the grant interview. Needs supabase/seed/seed.sql first.
--
-- Makes YOUR account friends with 3 fictional seed people in Montevideo
-- (Lucía, Valentina and Camila), so "Ver a quién conocés" on the example
-- requests shows clear matches:
--   * "¿Alguien que sepa configurar una impresora…?"  -> Martín and Sofía, "Amigo/a de …"
--   * "Se me quemó un enchufe de la cocina…"          -> Sofía and Joaquín, "Amigo/a de …",
--                                                        Diego, "Más lejos en tu red"
--
-- It only adds friendships between your account and seed accounts. It does not
-- change your profile or anyone else's data. Running it twice is harmless.
-- Undo: run supabase/seed/remove_seed.sql (deleting the seed people removes
-- these friendships too).
-- =============================================================================
do $$
declare
  -- ↓↓↓ Put your user id here (Authentication → Users → copy "UID") ↓↓↓
  demo_user uuid := '00000000-0000-0000-0000-000000000000';
  -- Lucía Fernández, Valentina Silva, Camila Suárez (seed people, Montevideo)
  seed_friends uuid[] := array[
    'c0000000-0000-4000-8000-000001000002',
    'c0000000-0000-4000-8000-000001000004',
    'c0000000-0000-4000-8000-000001000007'
  ]::uuid[];
  f uuid;
begin
  if demo_user = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set demo_user at the top of demo.sql to your user id first.';
  end if;
  if not exists (select 1 from public.profiles where id = demo_user and onboarded) then
    raise exception 'No onboarded profile with id %. Sign up and finish onboarding first.', demo_user;
  end if;
  if exists (select 1 from auth.users where id = demo_user and email like '%@seed.checonoces.test') then
    raise exception 'demo_user must be your real account, not a seed person.';
  end if;
  if (select count(*) from public.profiles p join auth.users u on u.id = p.id
      where p.id = any (seed_friends) and u.email like '%@seed.checonoces.test') <> 3 then
    raise exception 'Seed data not found. Run supabase/seed/seed.sql first.';
  end if;

  foreach f in array seed_friends loop
    insert into public.connections (requester_id, addressee_id, status)
    values (f, demo_user, 'accepted')
    on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
    do update set status = 'accepted';
  end loop;

  if (select city from public.profiles where id = demo_user) is distinct from 'mvd' then
    raise notice 'Your account is not in Montevideo: pick Montevideo with the city button to see the example requests.';
  end if;
  raise notice 'Demo ready: % is now friends with Lucía, Valentina and Camila.', demo_user;
end $$;
