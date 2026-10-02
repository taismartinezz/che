-- =============================================================================
-- Che, ¿conocés? — database schema
-- Tables, Row Level Security, helper functions and RPCs.
-- Run on a Supabase project (São Paulo region: sa-east-1).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.city_code as enum ('mvd', 'bue');
create type public.verification_status as enum ('none', 'pending', 'verified');
create type public.connection_status as enum ('pending', 'accepted', 'declined');
create type public.request_status as enum ('open', 'resolved', 'closed');
create type public.intro_status as enum ('pending', 'accepted', 'declined');
create type public.report_target as enum ('profile', 'request');

-- Category ids used across the app.
create or replace function public.valid_category(c text) returns boolean
language sql immutable as $$
  select c in ('tech', 'clases', 'mudanza', 'hogar', 'objetos', 'mascotas', 'cuidado')
$$;

-- Short, human-friendly invite codes (no ambiguous characters).
create or replace function public.generate_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.invite_code = code);
  end loop;
  return code;
end $$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_url text,
  city public.city_code,
  neighbourhood text check (char_length(neighbourhood) <= 60),
  bio text check (char_length(bio) <= 280),
  skills text[] not null default '{}',
  contact_whatsapp text check (contact_whatsapp ~ '^\+?[0-9 ]{6,20}$'),
  verification_status public.verification_status not null default 'none',
  is_registered_worker boolean not null default false,
  is_admin boolean not null default false,
  invite_code text not null unique,
  terms_accepted_at timestamptz,
  onboarded boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  -- Nobody becomes visible without accepting the Terms and Privacy Policy.
  constraint onboarded_requires_terms check (not onboarded or terms_accepted_at is not null),
  constraint skills_valid check (skills <@ array['tech','clases','mudanza','hogar','objetos','mascotas','cuidado'])
);
create index profiles_city_idx on public.profiles (city);
create index profiles_skills_idx on public.profiles using gin (skills);

-- -----------------------------------------------------------------------------
-- connections (friendship = accepted connection in either direction)
-- -----------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- unique pair regardless of direction
create unique index connections_pair_idx on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id);

-- -----------------------------------------------------------------------------
-- requests
-- -----------------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (public.valid_category(category)),
  text text not null check (char_length(text) between 1 and 280),
  city public.city_code not null,
  neighbourhood text,
  status public.request_status not null default 'open',
  is_example boolean not null default false,
  created_at timestamptz not null default now()
);
create index requests_feed_idx on public.requests (city, status, created_at desc);
create index requests_author_idx on public.requests (author_id);

-- -----------------------------------------------------------------------------
-- offers ("Ta, te ayudo")
-- -----------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, helper_id)
);
create index offers_helper_idx on public.offers (helper_id);

-- -----------------------------------------------------------------------------
-- intro_requests
-- status        = the mutual friend's answer (auto-accepted when via_id is null)
-- target_status = the target's answer. Contact is shared only when both accept.
-- -----------------------------------------------------------------------------
create table public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  via_id uuid references public.profiles (id) on delete set null,
  status public.intro_status not null default 'pending',
  target_status public.intro_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (request_id, requester_id, target_id)
);
create index intro_requests_via_idx on public.intro_requests (via_id);
create index intro_requests_target_idx on public.intro_requests (target_id);

-- -----------------------------------------------------------------------------
-- exchanges (a resolved request + who helped)
-- -----------------------------------------------------------------------------
create table public.exchanges (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  thank_you_note text check (char_length(thank_you_note) <= 280),
  check (requester_id <> helper_id)
);
create index exchanges_helper_idx on public.exchanges (helper_id);
create index exchanges_requester_idx on public.exchanges (requester_id);

-- -----------------------------------------------------------------------------
-- endorsements
-- -----------------------------------------------------------------------------
create table public.endorsements (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (public.valid_category(category)),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (from_id, to_id, category),
  check (from_id <> to_id)
);
create index endorsements_to_idx on public.endorsements (to_id, category);

-- -----------------------------------------------------------------------------
-- groups (screen is "coming soon"; tables exist so the score can use them)
-- -----------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 80),
  city public.city_code not null,
  neighbourhood text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- -----------------------------------------------------------------------------
-- reports / blocks / notifications
-- -----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- =============================================================================
-- Helper functions (SECURITY DEFINER: they look across rows the caller's RLS
-- would hide, but only ever return ids/booleans, never private data).
-- =============================================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.friend_ids(u uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select case when requester_id = u then addressee_id else requester_id end
  from public.connections
  where status = 'accepted' and (requester_id = u or addressee_id = u)
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  )
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create or replace function public.notify(p_user uuid, p_type text, p_payload jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, payload) values (p_user, p_type, p_payload)
$$;
revoke all on function public.notify(uuid, text, jsonb) from public, anon, authenticated;

-- =============================================================================
-- New auth user → empty profile with an invite code
-- =============================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, invite_code)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 60),
    new.raw_user_meta_data ->> 'avatar_url',
    public.generate_invite_code()
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.connections enable row level security;
alter table public.requests enable row level security;
alter table public.offers enable row level security;
alter table public.intro_requests enable row level security;
alter table public.exchanges enable row level security;
alter table public.endorsements enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;

-- Start from zero: nothing for anonymous visitors, and only the explicit
-- grants below for signed-in users (RLS policies then filter rows).
revoke all on all tables in schema public from anon, authenticated;

-- profiles: column-level privileges keep contact_whatsapp (and admin-only
-- flags) out of reach. Always select explicit columns from the client.
revoke all on public.profiles from authenticated;
grant select (id, display_name, avatar_url, city, neighbourhood, bio, skills,
              verification_status, is_registered_worker, invite_code, onboarded, created_at)
  on public.profiles to authenticated;
grant update (display_name, avatar_url, city, neighbourhood, bio, skills,
              contact_whatsapp, terms_accepted_at, onboarded)
  on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (not public.is_blocked_between(auth.uid(), id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- connections: only participants see them. Writes go through RPCs below,
-- except deleting (unfriend / cancel) which either participant may do.
grant select, delete on public.connections to authenticated;
create policy connections_read on public.connections for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy connections_delete on public.connections for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- requests
grant select, insert, update, delete on public.requests to authenticated;
create policy requests_read on public.requests for select to authenticated
  using (
    author_id = auth.uid()
    or (status = 'open' and not public.is_blocked_between(auth.uid(), author_id))
    or exists (select 1 from public.offers o where o.request_id = requests.id and o.helper_id = auth.uid())
    or exists (select 1 from public.intro_requests i where i.request_id = requests.id and auth.uid() in (i.via_id, i.target_id))
    or exists (select 1 from public.exchanges e where e.request_id = requests.id and e.helper_id = auth.uid())
  );
create policy requests_insert on public.requests for insert to authenticated
  with check (author_id = auth.uid() and is_example = false and status = 'open');
create policy requests_update on public.requests for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and is_example = false);
create policy requests_delete on public.requests for delete to authenticated
  using (author_id = auth.uid());

-- offers: everyone signed in can read (for counts); helpers create/withdraw their own.
grant select, insert, delete on public.offers to authenticated;
create policy offers_read on public.offers for select to authenticated using (true);
create policy offers_insert on public.offers for insert to authenticated
  with check (
    helper_id = auth.uid()
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.status = 'open' and r.author_id <> auth.uid()
        and not public.is_blocked_between(auth.uid(), r.author_id)
    )
  );
create policy offers_delete on public.offers for delete to authenticated using (helper_id = auth.uid());

-- intro_requests: participants read; writes via RPCs.
grant select on public.intro_requests to authenticated;
create policy intros_read on public.intro_requests for select to authenticated
  using (auth.uid() in (requester_id, target_id, via_id));

-- exchanges: public within the network (they build trust); created via RPC.
grant select on public.exchanges to authenticated;
create policy exchanges_read on public.exchanges for select to authenticated using (true);

-- endorsements: public; created via RPC (friends only); the author can delete.
grant select, delete on public.endorsements to authenticated;
create policy endorsements_read on public.endorsements for select to authenticated using (true);
create policy endorsements_delete on public.endorsements for delete to authenticated using (from_id = auth.uid());

-- groups: read-only for now (screen is coming soon).
grant select on public.groups, public.group_members to authenticated;
create policy groups_read on public.groups for select to authenticated using (true);
create policy group_members_read on public.group_members for select to authenticated using (true);

-- reports: anyone can file; only admins read.
grant select, insert on public.reports to authenticated;
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_admin_read on public.reports for select to authenticated using (public.is_admin());

-- blocks: own rows only.
grant select, insert, delete on public.blocks to authenticated;
create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- notifications: own rows; can mark read / delete. Created by functions only.
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- =============================================================================
-- Triggers: notifications for offers
-- =============================================================================
create or replace function public.on_offer_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = new.request_id;
  perform public.notify(r.author_id, 'offer', jsonb_build_object(
    'request_id', r.id, 'from_id', new.helper_id,
    'from_name', (select display_name from public.profiles where id = new.helper_id),
    'request_text', left(r.text, 80)));
  return new;
end $$;
create trigger offers_notify after insert on public.offers
  for each row execute function public.on_offer_created();

-- =============================================================================
-- RPCs (all run as the signed-in user via auth.uid())
-- =============================================================================

-- My own private contact (others never read it directly).
create or replace function public.get_my_private() returns table (contact_whatsapp text, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select contact_whatsapp, is_admin from public.profiles where id = auth.uid()
$$;

-- Someone's WhatsApp, only if we are friends or an intro between us was
-- accepted by everyone involved.
create or replace function public.get_contact(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.contact_whatsapp from public.profiles p
  where p.id = p_user
    and auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), p_user)
    and (
      p_user = auth.uid()
      or public.are_friends(auth.uid(), p_user)
      or exists (
        select 1 from public.intro_requests i
        where i.status = 'accepted' and i.target_status = 'accepted'
          and ((i.requester_id = auth.uid() and i.target_id = p_user)
            or (i.target_id = auth.uid() and i.requester_id = p_user))
      )
    )
$$;

-- Keep "weekly active users" metric honest.
create or replace function public.touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now()
  where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '10 minutes')
$$;

-- ---------- Friendships ----------
create or replace function public.send_friend_request(p_to uuid) returns public.connections
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.connections;
begin
  if me is null or p_to = me then raise exception 'invalid_target'; end if;
  if public.is_blocked_between(me, p_to) then raise exception 'blocked'; end if;

  select * into c from public.connections
  where least(requester_id, addressee_id) = least(me, p_to)
    and greatest(requester_id, addressee_id) = greatest(me, p_to);

  if found then
    -- They already asked me → accept. A declined request can be re-sent.
    if c.status = 'pending' and c.addressee_id = me then
      update public.connections set status = 'accepted' where id = c.id returning * into c;
      perform public.notify(p_to, 'friend_accepted', jsonb_build_object('from_id', me,
        'from_name', (select display_name from public.profiles where id = me)));
    elsif c.status = 'declined' then
      update public.connections set status = 'pending', requester_id = me, addressee_id = p_to, created_at = now()
        where id = c.id returning * into c;
      perform public.notify(p_to, 'friend_request', jsonb_build_object('from_id', me,
        'from_name', (select display_name from public.profiles where id = me)));
    end if;
    return c;
  end if;

  insert into public.connections (requester_id, addressee_id) values (me, p_to) returning * into c;
  perform public.notify(p_to, 'friend_request', jsonb_build_object('from_id', me,
    'from_name', (select display_name from public.profiles where id = me)));
  return c;
end $$;

create or replace function public.respond_friend_request(p_connection uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.connections;
begin
  select * into c from public.connections where id = p_connection and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  update public.connections set status = case when p_accept then 'accepted' else 'declined' end::public.connection_status
    where id = c.id;
  if p_accept then
    perform public.notify(c.requester_id, 'friend_accepted', jsonb_build_object('from_id', auth.uid(),
      'from_name', (select display_name from public.profiles where id = auth.uid())));
  end if;
end $$;

-- Invite link: connect inviter and the new user right away.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inviter uuid;
begin
  select id into inviter from public.profiles where invite_code = upper(trim(p_code));
  if inviter is null or inviter = me or me is null then return null; end if;
  if public.is_blocked_between(me, inviter) then return null; end if;

  insert into public.connections (requester_id, addressee_id, status)
  values (inviter, me, 'accepted')
  on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  do update set status = 'accepted';

  perform public.notify(inviter, 'invite_joined', jsonb_build_object('from_id', me,
    'from_name', (select display_name from public.profiles where id = me)));
  return inviter;
end $$;

-- ---------- Network views ----------
-- Friends of friends with mutual-friend counts ("Personas que quizás conozcas").
create or replace function public.get_people_you_may_know(p_limit int default 10)
returns table (id uuid, display_name text, avatar_url text, neighbourhood text, city public.city_code, mutual_count int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  f1 as (select public.friend_ids((select id from me)) as id),
  pending as (
    select case when requester_id = (select id from me) then addressee_id else requester_id end as id
    from public.connections
    where status = 'pending' and (select id from me) in (requester_id, addressee_id)
  ),
  f2 as (
    select x.fid as id, count(*)::int as mutual_count
    from f1, lateral (select public.friend_ids(f1.id) as fid) x
    where x.fid <> (select id from me)
      and x.fid not in (select id from f1)
      and x.fid not in (select id from pending)
    group by x.fid
  )
  select p.id, p.display_name, p.avatar_url, p.neighbourhood, p.city, f2.mutual_count
  from f2 join public.profiles p on p.id = f2.id
  where not public.is_blocked_between((select id from me), p.id) and p.onboarded
  order by f2.mutual_count desc, p.display_name
  limit p_limit
$$;

-- Graph for "Mi red": ring 1 = friends, ring 2 = friends of friends (with one link each).
create or replace function public.get_my_network()
returns table (id uuid, display_name text, avatar_url text, ring int, via_id uuid, mutual_count int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  f1 as (select public.friend_ids((select id from me)) as id),
  f2 as (
    select x.fid as id, min(f1.id::text)::uuid as via_id, count(*)::int as mutual_count
    from f1, lateral (select public.friend_ids(f1.id) as fid) x
    where x.fid <> (select id from me) and x.fid not in (select id from f1)
    group by x.fid
  )
  select p.id, p.display_name, p.avatar_url, 1, null::uuid, 0
    from f1 join public.profiles p on p.id = f1.id
    where not public.is_blocked_between((select id from me), p.id)
  union all
  select p.id, p.display_name, p.avatar_url, 2, f2.via_id, f2.mutual_count
    from f2 join public.profiles p on p.id = f2.id
    where not public.is_blocked_between((select id from me), p.id)
$$;

-- =============================================================================
-- Trust recommendations (core feature)
-- Score 0–99:
--   network distance: friend +40, friend of a friend +25, three steps +10
--   +6 per mutual friend
--   +5 per past exchange with me or my friends
--   +8 if we share a group
--   +2 per endorsement in the category (max +12)
--   +12 same neighbourhood as the request
-- =============================================================================
create or replace function public.get_recommendations(p_request_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  neighbourhood text,
  score int,
  distance int,
  mutual_count int,
  via_id uuid,
  via_name text,
  exchange_count int,
  endorsement_count int,
  shares_group boolean,
  same_neighbourhood boolean,
  is_verified boolean,
  reasons text[]
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  r public.requests;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select * into r from public.requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if public.is_blocked_between(me, r.author_id) then raise exception 'not_found'; end if;

  return query
  with
  f1 as (select distinct public.friend_ids(me) as id),
  f2 as (
    select distinct x.fid as id
    from f1, lateral (select public.friend_ids(f1.id) as fid) x
    where x.fid <> me and x.fid not in (select id from f1)
  ),
  f3 as (
    select distinct x.fid as id
    from f2, lateral (select public.friend_ids(f2.id) as fid) x
    where x.fid <> me and x.fid not in (select id from f1) and x.fid not in (select id from f2)
  ),
  candidates as (
    select p.*
    from public.profiles p
    where p.city = r.city
      and p.onboarded
      and r.category = any (p.skills)
      and p.id <> r.author_id
      and p.id <> me
      and not public.is_blocked_between(me, p.id)
      and not public.is_blocked_between(r.author_id, p.id)
      and (r.category <> 'cuidado' or p.verification_status = 'verified')
  ),
  scored as (
    select
      c.id, c.display_name, c.avatar_url, c.neighbourhood, c.verification_status,
      case when c.id in (select id from f1) then 1
           when c.id in (select id from f2) then 2
           when c.id in (select id from f3) then 3
           else null end as dist,
      m.mutual_count, m.via_id,
      (select count(*)::int from public.exchanges e
        where (e.helper_id = c.id and (e.requester_id = me or e.requester_id in (select id from f1)))
           or (e.requester_id = c.id and (e.helper_id = me or e.helper_id in (select id from f1)))) as exch,
      (select count(*)::int from public.endorsements en where en.to_id = c.id and en.category = r.category) as endo,
      exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
              where a.user_id = me and b.user_id = c.id) as grp,
      (r.neighbourhood is not null and r.neighbourhood <> 'Otro' and c.neighbourhood = r.neighbourhood) as same_nb
    from candidates c
    left join lateral (
      select count(*)::int as mutual_count,
             (array_agg(fp.id order by fp.display_name))[1] as via_id
      from f1 join public.friend_ids(c.id) cf(id) on cf.id = f1.id
      join public.profiles fp on fp.id = f1.id
      where not public.is_blocked_between(me, fp.id)
    ) m on true
  )
  select
    s.id, s.display_name, s.avatar_url, s.neighbourhood,
    least(99,
      case s.dist when 1 then 40 when 2 then 25 when 3 then 10 else 0 end
      + 6 * coalesce(s.mutual_count, 0)
      + 5 * s.exch
      + case when s.grp then 8 else 0 end
      + least(12, 2 * s.endo)
      + case when s.same_nb then 12 else 0 end
    )::int as score,
    s.dist,
    coalesce(s.mutual_count, 0),
    case when s.dist = 1 then null else s.via_id end,
    case when s.dist = 1 then null else (select vp.display_name from public.profiles vp where vp.id = s.via_id) end,
    s.exch, s.endo, s.grp, s.same_nb,
    s.verification_status = 'verified',
    array_remove(array[
      case when s.dist = 1 then 'friend' end,
      case when s.dist = 2 and s.via_id is not null then 'friend_of:' || (select vp.display_name from public.profiles vp where vp.id = s.via_id) end,
      case when s.dist = 3 then 'three_steps' end,
      case when coalesce(s.mutual_count, 0) > 1 or (s.dist = 1 and coalesce(s.mutual_count, 0) > 0)
           then 'mutual:' || s.mutual_count end,
      case when s.exch > 0 then 'exchanges:' || s.exch end,
      case when s.grp then 'group' end,
      case when s.endo > 0 then 'endorsements:' || s.endo end,
      case when s.same_nb then 'same_neighbourhood' end
    ], null) as reasons
  from scored s
  order by score desc, s.display_name
  limit 30;
end $$;

-- Lightweight "N recomendados" counter for the feed (no scoring).
create or replace function public.count_candidates(p_request_ids uuid[])
returns table (request_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select r.id, (
    select count(*)::int from public.profiles p
    where p.city = r.city and p.onboarded and r.category = any (p.skills)
      and p.id <> r.author_id and p.id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), p.id)
      and not public.is_blocked_between(r.author_id, p.id)
      and (r.category <> 'cuidado' or p.verification_status = 'verified')
  )
  from public.requests r
  where r.id = any (p_request_ids) and auth.uid() is not null
$$;

-- ---------- Intros ----------
create or replace function public.request_intro(p_request uuid, p_target uuid, p_via uuid)
returns public.intro_requests
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.requests; i public.intro_requests; my_name text;
begin
  select * into r from public.requests where id = p_request;
  if not found or r.author_id <> me then raise exception 'only_author'; end if;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;
  if p_target = me or public.is_blocked_between(me, p_target) then raise exception 'invalid_target'; end if;
  if p_via is not null then
    if not (public.are_friends(me, p_via) and public.are_friends(p_via, p_target)) then
      raise exception 'not_mutual_friend';
    end if;
    if public.is_blocked_between(me, p_via) then raise exception 'invalid_target'; end if;
  end if;
  if r.category = 'cuidado' and not exists (
    select 1 from public.profiles where id = p_target and verification_status = 'verified') then
    raise exception 'needs_verification';
  end if;

  select display_name into my_name from public.profiles where id = me;

  insert into public.intro_requests (request_id, requester_id, target_id, via_id, status)
  values (p_request, me, p_target, p_via, case when p_via is null then 'accepted' else 'pending' end::public.intro_status)
  on conflict (request_id, requester_id, target_id) do nothing
  returning * into i;

  if i.id is null then
    select * into i from public.intro_requests where request_id = p_request and requester_id = me and target_id = p_target;
    return i;
  end if;

  if p_via is not null then
    perform public.notify(p_via, 'intro_via', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'from_id', me, 'from_name', my_name, 'target_id', p_target,
      'target_name', (select display_name from public.profiles where id = p_target),
      'request_text', left(r.text, 80)));
  else
    perform public.notify(p_target, 'intro_target', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'from_id', me, 'from_name', my_name, 'request_text', left(r.text, 80)));
  end if;
  return i;
end $$;

-- The mutual friend answers.
create or replace function public.respond_intro_via(p_intro uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare i public.intro_requests; r public.requests; via_name text;
begin
  select * into i from public.intro_requests where id = p_intro and via_id = auth.uid() and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  select * into r from public.requests where id = i.request_id;
  select display_name into via_name from public.profiles where id = auth.uid();

  update public.intro_requests set status = case when p_accept then 'accepted' else 'declined' end::public.intro_status
    where id = i.id;

  if p_accept then
    -- Ask the target whether they want to share contact.
    perform public.notify(i.target_id, 'intro_target', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'from_id', i.requester_id, 'from_name', (select display_name from public.profiles where id = i.requester_id),
      'via_id', auth.uid(), 'via_name', via_name, 'request_text', left(r.text, 80)));
    perform public.notify(i.requester_id, 'intro_via_accepted', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'via_id', auth.uid(), 'via_name', via_name,
      'target_id', i.target_id, 'target_name', (select display_name from public.profiles where id = i.target_id)));
  else
    perform public.notify(i.requester_id, 'intro_declined', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'target_name', (select display_name from public.profiles where id = i.target_id)));
  end if;
end $$;

-- The person being introduced answers. Only now can both see each other's contact.
create or replace function public.respond_intro_target(p_intro uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare i public.intro_requests; me_name text;
begin
  select * into i from public.intro_requests
  where id = p_intro and target_id = auth.uid() and status = 'accepted' and target_status = 'pending';
  if not found then raise exception 'not_found'; end if;
  select display_name into me_name from public.profiles where id = auth.uid();

  update public.intro_requests set target_status = case when p_accept then 'accepted' else 'declined' end::public.intro_status
    where id = i.id;

  if p_accept then
    perform public.notify(i.requester_id, 'intro_accepted', jsonb_build_object('intro_id', i.id, 'request_id', i.request_id,
      'other_id', auth.uid(), 'other_name', me_name));
    perform public.notify(auth.uid(), 'intro_accepted', jsonb_build_object('intro_id', i.id, 'request_id', i.request_id,
      'other_id', i.requester_id, 'other_name', (select display_name from public.profiles where id = i.requester_id)));
  else
    perform public.notify(i.requester_id, 'intro_declined', jsonb_build_object('intro_id', i.id, 'request_id', i.request_id,
      'target_name', me_name));
  end if;
end $$;

-- ---------- Closing the loop ----------
create or replace function public.resolve_request(p_request uuid, p_helper uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.requests;
begin
  select * into r from public.requests where id = p_request and author_id = me;
  if not found then raise exception 'only_author'; end if;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;

  update public.requests set status = 'resolved' where id = r.id;

  if p_helper is not null then
    if p_helper = me then raise exception 'invalid_target'; end if;
    insert into public.exchanges (request_id, requester_id, helper_id, thank_you_note)
    values (r.id, me, p_helper, nullif(left(trim(coalesce(p_note, '')), 280), ''));
    perform public.notify(p_helper, 'exchange', jsonb_build_object('request_id', r.id, 'from_id', me,
      'from_name', (select display_name from public.profiles where id = me),
      'note', nullif(left(trim(coalesce(p_note, '')), 280), '')));
  end if;
end $$;

create or replace function public.endorse(p_to uuid, p_category text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.valid_category(p_category) then raise exception 'invalid_category'; end if;
  if not public.are_friends(me, p_to) then raise exception 'only_friends'; end if;
  insert into public.endorsements (from_id, to_id, category, note)
  values (me, p_to, p_category, nullif(left(trim(coalesce(p_note, '')), 200), ''))
  on conflict (from_id, to_id, category) do update set note = excluded.note;
  perform public.notify(p_to, 'endorsement', jsonb_build_object('from_id', me,
    'from_name', (select display_name from public.profiles where id = me), 'category', p_category));
end $$;

-- ---------- Safety ----------
create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user = me then raise exception 'invalid_target'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  -- Blocking also ends the friendship and any pending intros between us.
  delete from public.connections
    where least(requester_id, addressee_id) = least(me, p_user)
      and greatest(requester_id, addressee_id) = greatest(me, p_user);
  update public.intro_requests set status = 'declined', target_status = 'declined'
    where (requester_id = me and target_id = p_user) or (requester_id = p_user and target_id = me);
end $$;

-- Deletes the auth user; every row about them cascades away.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  delete from public.reports where reporter_id = me or (target_type = 'profile' and target_id = me);
  delete from auth.users where id = me;
end $$;

-- ---------- Admin ----------
create or replace function public.admin_list_reports()
returns table (id uuid, reporter_id uuid, reporter_name text, target_type public.report_target,
               target_id uuid, target_label text, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select rp.id, rp.reporter_id, p.display_name, rp.target_type, rp.target_id,
    case rp.target_type
      when 'profile' then (select tp.display_name from public.profiles tp where tp.id = rp.target_id)
      else (select left(rq.text, 120) from public.requests rq where rq.id = rp.target_id) end,
    rp.reason, rp.created_at
  from public.reports rp left join public.profiles p on p.id = rp.reporter_id
  order by rp.created_at desc;
end $$;

create or replace function public.admin_dismiss_report(p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.reports where id = p_report;
end $$;

create or replace function public.admin_close_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.requests set status = 'closed' where id = p_request;
end $$;

-- Pilot metrics.
create or replace function public.admin_metrics()
returns table (requests_posted int, requests_with_offer_pct numeric, intros_requested int,
               intros_accepted int, exchanges_completed int, weekly_active_users int, total_users int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select
    (select count(*)::int from public.requests where not is_example),
    (select case when count(*) = 0 then 0
            else round(100.0 * count(*) filter (where exists (select 1 from public.offers o where o.request_id = r.id)) / count(*), 1) end
       from public.requests r where not r.is_example),
    (select count(*)::int from public.intro_requests),
    (select count(*)::int from public.intro_requests where status = 'accepted' and target_status = 'accepted'),
    (select count(*)::int from public.exchanges e join public.requests r on r.id = e.request_id where not r.is_example),
    (select count(*)::int from public.profiles where last_seen_at > now() - interval '7 days'),
    (select count(*)::int from public.profiles where onboarded);
end $$;

-- Function privileges: callable by signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.valid_category(text),
  public.is_admin(),
  public.friend_ids(uuid),
  public.are_friends(uuid, uuid),
  public.is_blocked_between(uuid, uuid),
  public.get_my_private(),
  public.get_contact(uuid),
  public.touch_last_seen(),
  public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean),
  public.accept_invite(text),
  public.get_people_you_may_know(int),
  public.get_my_network(),
  public.get_recommendations(uuid),
  public.count_candidates(uuid[]),
  public.request_intro(uuid, uuid, uuid),
  public.respond_intro_via(uuid, boolean),
  public.respond_intro_target(uuid, boolean),
  public.resolve_request(uuid, uuid, text),
  public.endorse(uuid, text, text),
  public.block_user(uuid),
  public.delete_my_account(),
  public.admin_list_reports(),
  public.admin_dismiss_report(uuid),
  public.admin_close_request(uuid),
  public.admin_metrics()
to authenticated;

-- =============================================================================
-- Realtime: live feed, offer counts and notifications
-- =============================================================================
alter publication supabase_realtime add table public.requests, public.offers, public.notifications;

-- =============================================================================
-- Storage: public avatars, each user writes only into their own folder
-- =============================================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
