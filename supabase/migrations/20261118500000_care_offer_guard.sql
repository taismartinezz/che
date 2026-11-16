-- Close the direct-offer/completion bypass. No existing rows are rewritten.
create or replace function public.guard_care_helper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.requests where id=new.request_id and category='cuidado')
     and not exists (select 1 from public.profiles where id=new.helper_id
       and verification_status='verified' and background_checked) then
    raise exception 'needs_verification';
  end if;
  return new;
end $$;
revoke all on function public.guard_care_helper() from public;
create trigger care_offer_guard before insert or update on public.offers
  for each row execute function public.guard_care_helper();
create trigger care_exchange_guard before insert or update on public.exchanges
  for each row execute function public.guard_care_helper();

-- A request must not acquire unverified care providers by changing category later.
create or replace function public.guard_care_category_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category='cuidado' and old.category is distinct from new.category and (
    exists (select 1 from public.offers o join public.profiles p on p.id=o.helper_id
      where o.request_id=new.id and not (p.verification_status='verified' and p.background_checked))
    or exists (select 1 from public.exchanges e join public.profiles p on p.id=e.helper_id
      where e.request_id=new.id and not (p.verification_status='verified' and p.background_checked))
  ) then raise exception 'needs_verification'; end if;
  return new;
end $$;
revoke all on function public.guard_care_category_change() from public;
create trigger care_category_change_guard before update of category on public.requests
  for each row execute function public.guard_care_category_change();
