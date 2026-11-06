-- TESTE — Supabase schema for a SCHOOL TEST ENVIRONMENT.
-- All balances and transfers are simulated. No real payment rails or bank cards.
-- Run this file in Supabase SQL Editor. Never put a service_role key in the frontend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  account_number text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('USD','CDF')),
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  created_at timestamptz not null default now(),
  unique(user_id, currency)
);

-- A card is represented only by a non-payment test reference.
-- Never store a real PAN, CVV, PIN, or expiry credentials here.
create table if not exists public.test_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_reference text not null unique,
  label text not null default 'TESTE Virtual',
  status text not null default 'active' check (status in ('active','frozen')),
  created_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  sender_account text not null,
  recipient_account text not null,
  currency text not null check (currency in ('USD','CDF')),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'completed' check (status in ('completed')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique(sender_id, idempotency_key),
  check (sender_id <> recipient_id)
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallets_user_idx on public.wallets(user_id);
create index if not exists transfers_sender_idx on public.transfers(sender_id, created_at desc);
create index if not exists transfers_recipient_idx on public.transfers(recipient_id, created_at desc);
create index if not exists security_events_user_idx on public.security_events(user_id, created_at desc);

-- Create profile, two simulated wallets and one non-payment card reference
-- automatically whenever a user signs up through Supabase Auth.
create or replace function public.teste_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account text;
begin
  loop
    v_account := 'TST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.profiles where account_number = v_account);
  end loop;

  insert into public.profiles(id, full_name, account_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), v_account)
  on conflict (id) do nothing;

  insert into public.wallets(user_id, currency, balance_minor)
  values (new.id, 'USD', 0), (new.id, 'CDF', 0)
  on conflict (user_id, currency) do nothing;

  insert into public.test_cards(user_id, card_reference)
  values (new.id, 'TST-CARD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));

  return new;
end;
$$;

drop trigger if exists teste_auth_user_created on auth.users;
create trigger teste_auth_user_created
after insert on auth.users
for each row execute procedure public.teste_handle_new_user();

-- Backfill accounts for users who already existed before this trigger was installed.
insert into public.profiles(id, full_name, account_number)
select u.id, coalesce(u.raw_user_meta_data->>'full_name',''),
       'TST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

insert into public.wallets(user_id, currency, balance_minor)
select u.id, c.currency, 0
from auth.users u
cross join (values ('USD'),('CDF')) as c(currency)
on conflict (user_id, currency) do nothing;

insert into public.test_cards(user_id, card_reference)
select u.id, 'TST-CARD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
from auth.users u
where not exists (select 1 from public.test_cards c where c.user_id = u.id);

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.test_cards enable row level security;
alter table public.transfers enable row level security;
alter table public.security_events enable row level security;

drop policy if exists "profile_read_own" on public.profiles;
create policy "profile_read_own" on public.profiles
for select to authenticated using (id = (select auth.uid()));

drop policy if exists "wallet_read_own" on public.wallets;
create policy "wallet_read_own" on public.wallets
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "test_cards_read_own" on public.test_cards;
create policy "test_cards_read_own" on public.test_cards
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "transfers_read_participating" on public.transfers;
create policy "transfers_read_participating" on public.transfers
for select to authenticated using (
  sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
);

drop policy if exists "security_events_read_own" on public.security_events;
create policy "security_events_read_own" on public.security_events
for select to authenticated using (user_id = (select auth.uid()));

-- No client INSERT/UPDATE/DELETE policies are granted on financial tables.
-- Transfers must go through this atomic server-side RPC.
create or replace function public.teste_send_simulated_transfer(
  p_recipient_account text,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_sender_account text;
  v_sender_wallet uuid;
  v_recipient_wallet uuid;
  v_sender_balance bigint;
  v_transfer uuid;
begin
  if v_sender is null then
    raise exception 'Authentication required';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000 then
    raise exception 'Invalid test amount';
  end if;
  if p_currency not in ('USD','CDF') then
    raise exception 'Unsupported currency';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;

  select id into v_transfer
  from public.transfers
  where sender_id = v_sender and idempotency_key = p_idempotency_key;
  if v_transfer is not null then
    return v_transfer;
  end if;

  select id into v_recipient
  from public.profiles
  where account_number = upper(trim(p_recipient_account));
  if v_recipient is null then
    raise exception 'Recipient account not found';
  end if;
  if v_recipient = v_sender then
    raise exception 'Cannot transfer to the same account';
  end if;

  select account_number into v_sender_account
  from public.profiles where id = v_sender;

  select id into v_sender_wallet
  from public.wallets where user_id = v_sender and currency = p_currency;
  select id into v_recipient_wallet
  from public.wallets where user_id = v_recipient and currency = p_currency;

  if v_sender_wallet is null or v_recipient_wallet is null then
    raise exception 'Wallet not found';
  end if;

  -- Lock both wallets in a stable order to reduce deadlocks.
  perform w.id
  from public.wallets w
  where w.id in (v_sender_wallet, v_recipient_wallet)
  order by w.id
  for update;

  select balance_minor into v_sender_balance
  from public.wallets where id = v_sender_wallet;
  if v_sender_balance < p_amount_minor then
    raise exception 'Insufficient simulated balance';
  end if;

  insert into public.transfers(
    sender_id, recipient_id, sender_account, recipient_account,
    currency, amount_minor, idempotency_key
  )
  values (
    v_sender, v_recipient, v_sender_account,
    upper(trim(p_recipient_account)), p_currency,
    p_amount_minor, p_idempotency_key
  )
  on conflict (sender_id, idempotency_key) do nothing
  returning id into v_transfer;

  if v_transfer is null then
    select id into v_transfer from public.transfers
    where sender_id = v_sender and idempotency_key = p_idempotency_key;
    return v_transfer;
  end if;

  update public.wallets
  set balance_minor = balance_minor - p_amount_minor
  where id = v_sender_wallet;

  update public.wallets
  set balance_minor = balance_minor + p_amount_minor
  where id = v_recipient_wallet;

  insert into public.security_events(user_id, event_type, details)
  values (v_sender, 'simulated_transfer_sent',
    jsonb_build_object('transfer_id', v_transfer, 'currency', p_currency));

  insert into public.security_events(user_id, event_type, details)
  values (v_recipient, 'simulated_transfer_received',
    jsonb_build_object('transfer_id', v_transfer, 'currency', p_currency));

  return v_transfer;
end;
$$;

revoke all on function public.teste_send_simulated_transfer(text,bigint,text,uuid) from public;
grant execute on function public.teste_send_simulated_transfer(text,bigint,text,uuid) to authenticated;

-- Remove default table privileges from anon/authenticated; SELECT is governed by RLS.
revoke all on public.profiles, public.wallets, public.test_cards, public.transfers, public.security_events from anon, authenticated;
grant select on public.profiles, public.wallets, public.test_cards, public.transfers, public.security_events to authenticated;
