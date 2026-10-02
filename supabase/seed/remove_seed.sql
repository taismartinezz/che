-- Removes ALL seed data (run before launch). Deleting the auth users cascades
-- to profiles, connections, requests, offers, intros, exchanges, endorsements,
-- group memberships, blocks and notifications.
begin;
delete from public.groups where id::text like 'e0000000-0000-4000-8000-%';
delete from auth.users where email like '%@seed.checonoces.test';
-- Any remaining example posts (should be none):
delete from public.requests where is_example;
commit;
