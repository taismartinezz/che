-- =============================================================================
-- Recommendation paths: intros for people 3 steps away
-- For someone 3 steps away (me -> my friend -> their friend -> them), the
-- author can ask their friend (the "bridge") to ask around. The only rule that
-- changes: request_intro now accepts a via who is my friend and is either a
-- friend of the target or a friend of one of the target's friends.
-- =============================================================================

-- A friend of `via` who is a friend of `target` (null when via knows target directly).
create or replace function public.path_hop(p_via uuid, p_target uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when public.are_friends(p_via, p_target) then null else (
    select h.id from public.friend_ids(p_via) h(id)
    join public.profiles p on p.id = h.id
    where h.id <> p_target and public.are_friends(h.id, p_target)
    order by p.display_name
    limit 1
  ) end
$$;

-- New output columns -> the function has to be dropped first.
drop function if exists public.get_recommendations(uuid);
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
  reasons text[],
  bridge_id uuid,
  bridge_name text,
  hop_name text
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
      b.bridge_id, b.bridge_name, b.hop_name,
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
    -- 3 steps away: me -> bridge (my friend) -> hop (their friend) -> candidate
    left join lateral (
      select fb.id as bridge_id, fb.display_name as bridge_name, hp.display_name as hop_name
      from f1
      join public.profiles fb on fb.id = f1.id
      join public.friend_ids(f1.id) h(id) on true
      join public.profiles hp on hp.id = h.id
      where h.id in (select id from f2)
        and public.are_friends(h.id, c.id)
        and not public.is_blocked_between(me, fb.id)
        and not public.is_blocked_between(me, hp.id)
      order by fb.display_name, hp.display_name
      limit 1
    ) b on true
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
    ], null) as reasons,
    case when s.dist = 3 then s.bridge_id end,
    case when s.dist = 3 then s.bridge_name end,
    case when s.dist = 3 then s.hop_name end
  from scored s
  order by score desc, s.display_name
  limit 30;
end $$;

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
    if not (public.are_friends(me, p_via)
            and (public.are_friends(p_via, p_target) or public.path_hop(p_via, p_target) is not null)) then
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
      'hop_name', (select display_name from public.profiles where id = public.path_hop(p_via, p_target)),
      'request_text', left(r.text, 80)));
  else
    perform public.notify(p_target, 'intro_target', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'from_id', me, 'from_name', my_name, 'request_text', left(r.text, 80)));
  end if;
  return i;
end $$;

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
      'via_id', auth.uid(), 'via_name', via_name,
      'hop_name', (select display_name from public.profiles where id = public.path_hop(auth.uid(), i.target_id)),
      'request_text', left(r.text, 80)));
    perform public.notify(i.requester_id, 'intro_via_accepted', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'via_id', auth.uid(), 'via_name', via_name,
      'target_id', i.target_id, 'target_name', (select display_name from public.profiles where id = i.target_id)));
  else
    perform public.notify(i.requester_id, 'intro_declined', jsonb_build_object('intro_id', i.id, 'request_id', r.id,
      'target_name', (select display_name from public.profiles where id = i.target_id)));
  end if;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.path_hop(uuid, uuid),
  public.get_recommendations(uuid),
  public.request_intro(uuid, uuid, uuid),
  public.respond_intro_via(uuid, boolean)
to authenticated;
