-- MVP2 experiment. Apply ONLY to an isolated test project after review.
-- No Mercado Pago calls or real funds. Both switches default OFF.
create table public.mvp2_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  simulation_enabled boolean not null default false
);
insert into public.mvp2_settings default values;
alter table public.mvp2_settings enable row level security;
revoke all on public.mvp2_settings from public, anon, authenticated;

create table public.test_agreements (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  task text not null check (length(trim(task)) between 1 and 500),
  scheduled_at timestamptz not null,
  amount_minor bigint not null check (amount_minor between 1 and 9999999999),
  currency text not null check (currency in ('UYU','ARS')),
  accepted_by uuid[] not null default '{}',
  redo_by uuid[] not null default '{}',
  finished_by uuid[] not null default '{}',
  status text not null default 'proposed' check (status in ('proposed','confirmed','completed')),
  payment_state text not null default 'unfunded' check (payment_state in ('unfunded','simulated_held','simulated_released')),
  receipt text,
  review text check (length(review) between 1 and 1000),
  problem text not null default 'none' check (problem in ('none','redo','mediation','closed')),
  versions jsonb not null default '{}',
  share_token uuid unique,
  created_at timestamptz not null default now(),
  check (client_id <> worker_id),
  check (proposer_id in (client_id,worker_id))
);
alter table public.test_agreements enable row level security;
revoke all on public.test_agreements from public, anon, authenticated;
grant select on public.test_agreements to authenticated;
create or replace function public.mvp2_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.mvp2_settings where singleton), false)
$$;
revoke all on function public.mvp2_enabled() from public;
grant execute on function public.mvp2_enabled() to authenticated;
create policy test_agreements_read on public.test_agreements for select to authenticated using (
  public.mvp2_enabled() and (auth.uid() in (client_id,worker_id) or (public.is_admin() and problem = 'mediation'))
);

-- Participants cannot edit/delete the event history through application roles.
create table public.test_agreement_events (
  id bigint generated always as identity primary key,
  agreement_id uuid not null references public.test_agreements(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  body text check (length(body) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.test_agreement_events enable row level security;
revoke all on public.test_agreement_events from public, anon, authenticated;
grant select on public.test_agreement_events to authenticated;
create policy test_agreement_events_read on public.test_agreement_events for select to authenticated using (
  public.mvp2_enabled() and exists (select 1 from public.test_agreements a
    where a.id=agreement_id and (auth.uid() in (a.client_id,a.worker_id) or (public.is_admin() and a.problem='mediation')))
);

create function public.propose_test_agreement(p_other uuid, p_worker uuid, p_task text, p_scheduled_at timestamptz, p_amount_minor bigint, p_currency text)
returns public.test_agreements language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.test_agreements;
begin
  if me is null or not public.mvp2_enabled() then raise exception 'experiment_disabled'; end if;
  if p_other is null or p_other = me or p_worker not in (me,p_other) or p_worker is null
     or not public.can_contact(me,p_other) then raise exception 'not_allowed'; end if;
  if p_scheduled_at <= now() then raise exception 'invalid_date'; end if;
  insert into public.test_agreements(proposer_id,client_id,worker_id,task,scheduled_at,amount_minor,currency)
    values(me, case when p_worker=me then p_other else me end,p_worker,trim(p_task),p_scheduled_at,p_amount_minor,p_currency)
    returning * into a;
  insert into public.test_agreement_events(agreement_id,actor_id,action) values(a.id,me,'propose');
  return a;
end $$;

-- Lock each agreement so concurrent confirmations cannot lose state or release twice.
create function public.act_test_agreement(p_id uuid, p_action text, p_text text default null)
returns public.test_agreements language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.test_agreements;
begin
  if me is null or not public.mvp2_enabled() then raise exception 'experiment_disabled'; end if;
  select * into a from public.test_agreements where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_action='close_mediation' then
    if not public.is_admin() or a.problem <> 'mediation' then raise exception 'not_allowed'; end if;
    a.problem := 'closed'; -- Deliberately does NOT unlock release. Human review remains necessary.
  else
    if me not in (a.client_id,a.worker_id) then raise exception 'not_allowed'; end if;
    if public.is_blocked_between(a.client_id,a.worker_id) then raise exception 'blocked'; end if;
    case p_action
    when 'accept' then
      if a.status <> 'proposed' then raise exception 'invalid_state'; end if;
      if not me = any(a.accepted_by) then a.accepted_by := array_append(a.accepted_by,me); end if;
      if cardinality(a.accepted_by)=2 then a.status := 'confirmed'; end if;
    when 'simulate_payment' then
      if not (select simulation_enabled from public.mvp2_settings where singleton)
        or me <> a.client_id or a.status <> 'confirmed' or a.payment_state <> 'unfunded'
        or a.problem <> 'none' then raise exception 'invalid_state'; end if;
      a.payment_state := 'simulated_held';
    when 'finish' then
      if a.status <> 'confirmed' or a.payment_state <> 'simulated_held' or a.problem <> 'none' then raise exception 'invalid_state'; end if;
      if not me = any(a.finished_by) then a.finished_by := array_append(a.finished_by,me); end if;
      if cardinality(a.finished_by)=2 then
        a.status := 'completed'; a.payment_state := 'simulated_released';
        a.receipt := 'SIMULATED-NO-MONEY-' || a.id::text;
      end if;
    when 'report' then
      if a.status <> 'confirmed' or a.problem <> 'none' or length(trim(coalesce(p_text,''))) not between 1 and 2000 then raise exception 'invalid_state'; end if;
      a.problem := 'redo'; a.finished_by := '{}'; a.redo_by := '{}';
      a.versions := jsonb_build_object(me::text,trim(p_text));
    when 'respond' then
      if a.problem not in ('redo','mediation') or length(trim(coalesce(p_text,''))) not between 1 and 2000 then raise exception 'invalid_state'; end if;
      a.versions := a.versions || jsonb_build_object(me::text,trim(p_text));
    when 'redo_done' then
      if a.problem <> 'redo' then raise exception 'invalid_state'; end if;
      if not me = any(a.redo_by) then a.redo_by := array_append(a.redo_by,me); end if;
      if cardinality(a.redo_by)=2 then a.problem := 'none'; a.redo_by := '{}'; end if;
    when 'escalate' then
      if a.problem <> 'redo' then raise exception 'invalid_state'; end if;
      a.problem := 'mediation';
    when 'review' then
      if a.status <> 'completed' or me <> a.client_id or length(trim(coalesce(p_text,''))) not between 1 and 1000 then raise exception 'invalid_state'; end if;
      a.review := trim(p_text);
    when 'share' then
      if a.status <> 'completed' or me <> a.worker_id then raise exception 'invalid_state'; end if;
      a.share_token := coalesce(a.share_token,gen_random_uuid());
    when 'revoke_share' then
      if me <> a.worker_id then raise exception 'not_allowed'; end if;
      a.share_token := null;
    else raise exception 'invalid_action';
    end case;
  end if;
  update public.test_agreements set redo_by=a.redo_by,accepted_by=a.accepted_by,finished_by=a.finished_by,status=a.status,
    payment_state=a.payment_state,receipt=a.receipt,problem=a.problem,versions=a.versions,review=a.review,share_token=a.share_token where id=a.id;
  insert into public.test_agreement_events(agreement_id,actor_id,action,body)
    values(a.id,me,p_action,case when p_action in ('report','respond','review') then trim(p_text) else null end);
  return a;
end $$;

-- Explicit opt-in bearer link; excludes identities, chat, contact details and disputes.
create function public.shared_test_record(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('task',task,'scheduled_at',scheduled_at,'amount_minor',amount_minor,
    'currency',currency,'receipt',receipt,'review',review,'simulation',true)
  from public.test_agreements where share_token=p_token and status='completed' and public.mvp2_enabled()
$$;
revoke all on function public.propose_test_agreement(uuid,uuid,text,timestamptz,bigint,text),
 public.act_test_agreement(uuid,text,text),public.shared_test_record(uuid) from public;
grant execute on function public.propose_test_agreement(uuid,uuid,text,timestamptz,bigint,text),
 public.act_test_agreement(uuid,text,text) to authenticated;
grant execute on function public.shared_test_record(uuid) to anon,authenticated;
