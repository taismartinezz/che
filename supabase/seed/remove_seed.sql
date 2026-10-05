-- Removes ALL seed data (run before launch). Deleting the auth users cascades
-- to profiles, connections, requests, offers, intros, exchanges, endorsements,
-- group memberships, blocks and notifications.
-- This also undoes supabase/seed/demo.sql: the demo account's friendships are
-- with seed people, so they are deleted with them (explicitly first, for clarity).
begin;
delete from public.connections
  where requester_id in (select id from auth.users where email like '%@seed.checonoces.test')
     or addressee_id in (select id from auth.users where email like '%@seed.checonoces.test');
delete from public.groups where id::text like 'e0000000-0000-4000-8000-%';
delete from auth.users where email like '%@seed.checonoces.test';
-- Any remaining example posts (should be none):
delete from public.requests where is_example;
commit;
