-- BanterBird PRO subscriptions (NOWPayments: card/crypto in → crypto to merchant wallet)

-- Denormalized PRO flags on profiles (updated only by service role / webhook)
alter table public.profiles
  add column if not exists is_pro boolean not null default false,
  add column if not exists pro_until timestamptz;

comment on column public.profiles.is_pro is 'True while PRO subscription is active. Written only by service role.';
comment on column public.profiles.pro_until is 'UTC end of current PRO period. Written only by service role.';

-- Prevent clients from forging PRO status via profile UPDATE
create or replace function public.protect_pro_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (
       old.is_pro is distinct from new.is_pro
       or old.pro_until is distinct from new.pro_until
     )
     and coalesce(auth.role(), '') <> 'service_role'
  then
    raise exception 'is_pro and pro_until can only be updated by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_pro_columns on public.profiles;
create trigger profiles_protect_pro_columns
  before update on public.profiles
  for each row
  execute function public.protect_pro_columns();

-- Payment / subscription audit trail
create table if not exists public.pro_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null
    check (status in ('pending', 'active', 'expired', 'cancelled', 'failed')),
  provider text not null default 'nowpayments',
  provider_invoice_id text,
  provider_payment_id text,
  order_id text not null unique,
  amount_usd numeric(10, 2) not null default 9.00,
  current_period_start timestamptz,
  current_period_end timestamptz,
  raw_ipn jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pro_subscriptions_user_id_idx
  on public.pro_subscriptions (user_id);

create index if not exists pro_subscriptions_status_idx
  on public.pro_subscriptions (status);

create index if not exists pro_subscriptions_provider_payment_id_idx
  on public.pro_subscriptions (provider_payment_id)
  where provider_payment_id is not null;

alter table public.pro_subscriptions enable row level security;

grant select on public.pro_subscriptions to authenticated;

-- Users can read their own subscription rows; all writes go through service role
drop policy if exists "pro_subscriptions: owner read" on public.pro_subscriptions;
create policy "pro_subscriptions: owner read"
  on public.pro_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Helper: expire PRO when period ended (service role only — trigger allows service_role)
create or replace function public.sync_expired_pro(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the service role may run this (protect_pro_columns checks auth.role())
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sync_expired_pro requires service_role';
  end if;

  update public.profiles
  set
    is_pro = false,
    updated_at = now()
  where is_pro = true
    and pro_until is not null
    and pro_until < now()
    and (p_user_id is null or id = p_user_id);

  update public.pro_subscriptions
  set
    status = 'expired',
    updated_at = now()
  where status = 'active'
    and current_period_end is not null
    and current_period_end < now()
    and (p_user_id is null or user_id = p_user_id);
end;
$$;

revoke all on function public.sync_expired_pro(uuid) from public;
grant execute on function public.sync_expired_pro(uuid) to service_role;
