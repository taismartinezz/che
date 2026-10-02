-- =============================================================================
-- Che, ¿conocés? — launch (MVP) features
--   1. In-app chat
--   2. Neighbourhood groups
--   3. Email and push notification delivery (preferences + push subscriptions)
--   4. ID verification and background checks (manual review by admins)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profile additions
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists background_checked boolean not null default false,
  add column if not exists email_notifications boolean not null default true,
  add column if not exists push_notifications boolean not null default true,
  add column if not exists locale text not null default 'es' check (locale in ('es', 'en'));

-- background_checked is public (it shows as a badge); the preferences are private.
grant select (background_checked) on public.profiles to authenticated;
grant update (email_notifications, push_notifications, locale) on public.profiles to authenticated;

drop function if exists public.get_my_private();
create function public.get_my_private()
returns table (contact_whatsapp text, is_admin boolean, email_notifications boolean, push_notifications boolean)
language sql stable security definer set search_path = public as $$
  select contact_whatsapp, is_admin, email_notifications, push_notifications from public.profiles where id = auth.uid()
$$;
revoke execute on function public.get_my_private() from public, anon;
grant execute on function public.get_my_private() to authenticated;

-- =============================================================================
-- 1. Chat
-- Two people can message each other when they are friends, or when an intro
-- between them was accepted by everyone involved (same rule as sharing WhatsApp).
-- =============================================================================
create or replace function public.can_contact(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b
    and not public.is_blocked_between(a, b)
    and (
      public.are_friends(a, b)
      or exists (
        select 1 from public.intro_requests i
        where i.status = 'accepted' and i.target_status = 'accepted'
          and ((i.requester_id = a and i.target_id = b) or (i.requester_id = b and i.target_id = a))
      )
    )
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index messages_pair_idx on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
create index messages_unread_idx on public.messages (recipient_id) where read_at is null;

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy messages_read on public.messages for select to authenticated
  using (auth.uid() in (sender_id, recipient_id));
create policy messages_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and read_at is null and public.can_contact(sender_id, recipient_id));
create policy messages_mark_read on public.messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- One "new message" notification per sender until it is read, so a chat
-- doesn't flood the bell, email or phone.
create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.notifications
    where user_id = new.recipient_id and type = 'message' and read_at is null
      and payload ->> 'from_id' = new.sender_id::text
  ) then
    perform public.notify(new.recipient_id, 'message', jsonb_build_object(
      'from_id', new.sender_id,
      'from_name', (select display_name from public.profiles where id = new.sender_id),
      'preview', left(new.body, 80)));
  end if;
  return new;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.on_message_created();

-- Inbox: one row per conversation partner.
create or replace function public.get_conversations()
returns table (other_id uuid, display_name text, avatar_url text, last_body text,
               last_at timestamptz, last_from_me boolean, unread int, can_reply boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select m.*, case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other
    from public.messages m
    where auth.uid() in (m.sender_id, m.recipient_id)
  ),
  last as (
    select distinct on (other) other, body, created_at, sender_id = auth.uid() as from_me
    from mine order by other, created_at desc
  )
  select l.other, p.display_name, p.avatar_url, l.body, l.created_at, l.from_me,
    (select count(*)::int from mine u where u.other = l.other and u.recipient_id = auth.uid() and u.read_at is null),
    public.can_contact(auth.uid(), l.other)
  from last l join public.profiles p on p.id = l.other
  where not public.is_blocked_between(auth.uid(), l.other)
  order by l.created_at desc
$$;

-- Marks a conversation (and its "new message" notifications) as read.
create or replace function public.mark_conversation_read(p_other uuid) returns void
language sql security definer set search_path = public as $$
  update public.messages set read_at = now()
    where recipient_id = auth.uid() and sender_id = p_other and read_at is null;
  update public.notifications set read_at = now()
    where user_id = auth.uid() and type = 'message' and read_at is null and payload ->> 'from_id' = p_other::text;
$$;

-- =============================================================================
-- 2. Neighbourhood groups
-- =============================================================================
alter table public.groups
  add column if not exists description text check (char_length(description) <= 280);

alter table public.requests
  add column if not exists group_id uuid references public.groups (id) on delete set null;
create index if not exists requests_group_idx on public.requests (group_id, created_at desc);

create or replace function public.is_group_member(p_group uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = p_user)
$$;

grant insert, delete on public.group_members to authenticated;
grant update (name, description) on public.groups to authenticated;
grant delete on public.groups to authenticated;

create policy group_members_join on public.group_members for insert to authenticated
  with check (user_id = auth.uid());
create policy group_members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid());
create policy groups_update_creator on public.groups for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy groups_delete_creator on public.groups for delete to authenticated
  using (created_by = auth.uid());

-- Posting into a group requires membership.
drop policy requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
  with check (
    author_id = auth.uid() and is_example = false and status = 'open'
    and (group_id is null or public.is_group_member(group_id, auth.uid()))
  );
drop policy requests_update on public.requests;
create policy requests_update on public.requests for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid() and is_example = false
    and (group_id is null or public.is_group_member(group_id, auth.uid()))
  );

create or replace function public.create_group(p_name text, p_neighbourhood text, p_description text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_city public.city_code; gid uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'invalid'; end if;
  select city into my_city from public.profiles where id = me;
  insert into public.groups (name, city, neighbourhood, description, created_by)
  values (left(trim(p_name), 80), my_city, nullif(p_neighbourhood, ''), nullif(left(trim(coalesce(p_description, '')), 280), ''), me)
  returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, me);
  return gid;
end $$;

create or replace function public.get_groups(p_city public.city_code)
returns table (id uuid, name text, neighbourhood text, description text, created_by uuid,
               member_count int, is_member boolean, friends_in_group int)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.neighbourhood, g.description, g.created_by,
    (select count(*)::int from public.group_members m where m.group_id = g.id),
    public.is_group_member(g.id, auth.uid()),
    (select count(*)::int from public.group_members m
      where m.group_id = g.id and m.user_id in (select public.friend_ids(auth.uid())))
  from public.groups g
  where g.city = p_city and auth.uid() is not null
  order by public.is_group_member(g.id, auth.uid()) desc,
           (select count(*) from public.group_members m where m.group_id = g.id) desc, g.name
$$;

-- =============================================================================
-- 3. Notification delivery: push subscriptions
-- Email + push are sent by the `notify` Edge Function, called by a Database
-- Webhook on INSERT into public.notifications (see README).
-- =============================================================================
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- 4. ID verification and background checks
-- Users upload an ID photo, a selfie and (for cuidado) a criminal-record
-- certificate to a PRIVATE bucket. An admin reviews them; the files are deleted
-- after the decision. Nothing is verified automatically.
-- =============================================================================
create type public.verification_review as enum ('pending', 'approved', 'rejected');

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  id_document_path text not null,
  selfie_path text not null,
  background_path text,
  status public.verification_review not null default 'pending',
  reviewer_note text check (char_length(reviewer_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);
create unique index verification_one_pending_idx on public.verification_requests (user_id) where status = 'pending';

alter table public.verification_requests enable row level security;
revoke all on public.verification_requests from anon, authenticated;
grant select on public.verification_requests to authenticated;
create policy verification_own_or_admin on public.verification_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.submit_verification(p_id_document text, p_selfie text, p_background text)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prefix text := auth.uid()::text || '/';
begin
  if me is null then raise exception 'not_authenticated'; end if;
  -- Files must be in the caller's own folder of the private bucket.
  if left(p_id_document, length(prefix)) <> prefix or left(p_selfie, length(prefix)) <> prefix
     or (p_background is not null and left(p_background, length(prefix)) <> prefix) then
    raise exception 'invalid';
  end if;
  if exists (select 1 from public.verification_requests where user_id = me and status = 'pending') then
    raise exception 'duplicate';
  end if;
  insert into public.verification_requests (user_id, id_document_path, selfie_path, background_path)
  values (me, p_id_document, p_selfie, p_background);
  update public.profiles set verification_status = 'pending' where id = me and verification_status <> 'verified';
end $$;

create or replace function public.admin_list_verifications()
returns table (id uuid, user_id uuid, display_name text, city public.city_code, neighbourhood text,
               skills text[], id_document_path text, selfie_path text, background_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select v.id, v.user_id, p.display_name, p.city, p.neighbourhood, p.skills,
         v.id_document_path, v.selfie_path, v.background_path, v.created_at
  from public.verification_requests v join public.profiles p on p.id = v.user_id
  where v.status = 'pending'
  order by v.created_at;
end $$;

create or replace function public.admin_review_verification(
  p_request uuid, p_approve boolean, p_background_ok boolean, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.verification_requests;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v from public.verification_requests where id = p_request and status = 'pending';
  if not found then raise exception 'not_found'; end if;

  update public.verification_requests
    set status = case when p_approve then 'approved' else 'rejected' end::public.verification_review,
        reviewer_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
        reviewed_at = now(), reviewed_by = auth.uid(),
        -- the files are deleted by the admin client right after this call
        id_document_path = '', selfie_path = '', background_path = null
    where id = v.id;

  update public.profiles
    set verification_status = case when p_approve then 'verified' else 'none' end::public.verification_status,
        background_checked = p_approve and coalesce(p_background_ok, false) and v.background_path is not null
    where id = v.user_id;

  perform public.notify(v.user_id, case when p_approve then 'verification_approved' else 'verification_rejected' end,
    jsonb_build_object('note', nullif(left(trim(coalesce(p_note, '')), 500), '')));
end $$;

-- Private bucket for verification documents.
insert into storage.buckets (id, name, public) values ('verification', 'verification', false)
on conflict (id) do nothing;

create policy "verification_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verification_own_or_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "verification_own_or_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Care (cuidado) now requires verified identity AND a reviewed background check.
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
      and (r.category <> 'cuidado' or (p.verification_status = 'verified' and p.background_checked))
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

create or replace function public.count_candidates(p_request_ids uuid[])
returns table (request_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select r.id, (
    select count(*)::int from public.profiles p
    where p.city = r.city and p.onboarded and r.category = any (p.skills)
      and p.id <> r.author_id and p.id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), p.id)
      and not public.is_blocked_between(r.author_id, p.id)
      and (r.category <> 'cuidado' or (p.verification_status = 'verified' and p.background_checked))
  )
  from public.requests r
  where r.id = any (p_request_ids) and auth.uid() is not null
$$;

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
    select 1 from public.profiles where id = p_target and verification_status = 'verified' and background_checked) then
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

-- Metrics: add verification + chat counts for the pilot dashboard.
create or replace function public.admin_launch_metrics()
returns table (messages_sent int, active_chats int, groups_count int, verified_users int, pending_verifications int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select
    (select count(*)::int from public.messages),
    (select count(distinct (least(sender_id, recipient_id), greatest(sender_id, recipient_id)))::int
       from public.messages where created_at > now() - interval '7 days'),
    (select count(*)::int from public.groups),
    (select count(*)::int from public.profiles where verification_status = 'verified'),
    (select count(*)::int from public.verification_requests where status = 'pending');
end $$;

-- Function privileges.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.can_contact(uuid, uuid),
  public.get_conversations(),
  public.mark_conversation_read(uuid),
  public.is_group_member(uuid, uuid),
  public.create_group(text, text, text),
  public.get_groups(public.city_code),
  public.submit_verification(text, text, text),
  public.admin_list_verifications(),
  public.admin_review_verification(uuid, boolean, boolean, text),
  public.admin_launch_metrics(),
  public.get_recommendations(uuid),
  public.count_candidates(uuid[]),
  public.request_intro(uuid, uuid, uuid)
to authenticated;

-- Realtime for chat.
alter publication supabase_realtime add table public.messages;
