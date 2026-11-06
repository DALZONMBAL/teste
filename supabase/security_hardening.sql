-- TESTE — Renforcement de sécurité (migration à exécuter APRÈS supabase/schema.sql)
-- Projet éducatif : transferts simulés uniquement, aucun mouvement de fonds réels.
-- Cette migration ne nécessite et ne doit jamais exposer une clé service_role.

begin;

-- 1) Colonnes de profil utilisées par l'application.
alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- 2) Registre immuable des écritures comptables de simulation.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  entry_type text not null check (entry_type in ('debit','credit')),
  currency text not null check (currency in ('USD','CDF')),
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_user_created_idx
  on public.ledger_entries(user_id, created_at desc);
create index if not exists ledger_entries_transfer_idx
  on public.ledger_entries(transfer_id);

-- 3) Taux de conversion indicatif, lu par le navigateur mais modifiable uniquement
-- depuis SQL par un administrateur du projet. Aucun taux envoyé par le client.
create table if not exists public.exchange_rates (
  pair text primary key check (pair = 'USD_CDF'),
  rate numeric(18,6) not null check (rate > 0 and rate < 1000000),
  updated_at timestamptz not null default now()
);
insert into public.exchange_rates(pair, rate)
values ('USD_CDF', 2850)
on conflict (pair) do nothing;

-- 4) Activer RLS sur toutes les tables de données de TESTE.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.test_cards enable row level security;
alter table public.transfers enable row level security;
alter table public.security_events enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.exchange_rates enable row level security;

-- Supprimer les anciennes politiques sur les tables concernées afin d'éviter
-- qu'une ancienne politique permissive s'ajoute aux nouvelles.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','wallets','test_cards','transfers',
                        'security_events','ledger_entries','exchange_rates')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy wallets_select_own on public.wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy test_cards_select_own on public.test_cards
  for select to authenticated using (user_id = (select auth.uid()));
create policy transfers_select_participant on public.transfers
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy security_events_select_own on public.security_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy ledger_entries_select_own on public.ledger_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy exchange_rates_select_authenticated on public.exchange_rates
  for select to authenticated using (true);

-- Les clients ne peuvent ni insérer, ni modifier, ni supprimer des soldes,
-- transferts, cartes, écritures ou événements directement.
revoke all on public.profiles, public.wallets, public.test_cards,
  public.transfers, public.security_events, public.ledger_entries,
  public.exchange_rates from anon, authenticated;
grant select on public.profiles, public.wallets, public.test_cards,
  public.transfers, public.security_events, public.ledger_entries,
  public.exchange_rates to authenticated;

-- 5) Storage privé : images JPG, PNG, WebP uniquement, 3 Mo maximum.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos','profile-photos',false,3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists profile_photos_select_own on storage.objects;
drop policy if exists profile_photos_insert_own on storage.objects;
drop policy if exists profile_photos_update_own on storage.objects;
drop policy if exists profile_photos_delete_own on storage.objects;

create policy profile_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy profile_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ '\.(jpg|jpeg|png|webp)$'
    and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
    and coalesce((metadata->>'size')::bigint,0) between 1 and 3145728
  );
create policy profile_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ '\.(jpg|jpeg|png|webp)$'
    and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
    and coalesce((metadata->>'size')::bigint,0) between 1 and 3145728
  );
create policy profile_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 6) Fonction de profil sécurisée : aucun accès direct UPDATE depuis le navigateur.
create or replace function public.teste_update_profile(
  p_full_name text default null,
  p_avatar_path text default null,
  p_update_avatar boolean default false,
  p_preferences jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  if p_full_name is not null and
     (pg_catalog.length(pg_catalog.btrim(p_full_name)) = 0
      or pg_catalog.length(pg_catalog.btrim(p_full_name)) > 80) then
    raise exception 'Nom invalide';
  end if;

  if p_update_avatar and p_avatar_path is not null then
    if pg_catalog.split_part(p_avatar_path, '/', 1) <> auth.uid()::text
       or p_avatar_path !~ '^[0-9a-fA-F-]{36}/avatar\.(jpg|jpeg|png|webp)$' then
      raise exception 'Chemin de photo non autorisé';
    end if;
  end if;

  if p_preferences is not null
     and pg_catalog.jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Préférences invalides';
  end if;

  update public.profiles
  set full_name = case when p_full_name is null then full_name
                       else pg_catalog.btrim(p_full_name) end,
      avatar_path = case when p_update_avatar then p_avatar_path
                         else avatar_path end,
      preferences = case when p_preferences is null then preferences
                         else p_preferences end
  where id = auth.uid();

  if not found then
    raise exception 'Profil introuvable';
  end if;
end;
$$;
revoke all on function public.teste_update_profile(text,text,boolean,jsonb) from public, anon;
grant execute on function public.teste_update_profile(text,text,boolean,jsonb) to authenticated;

-- 7) Fonction de transfert atomique.
-- Exige e-mail confirmé + AAL2 + preuve TOTP récente (90 secondes).
-- Le client ne fournit jamais de solde, de frais ou de taux de change.
create or replace function public.teste_send_simulated_transfer(
  p_recipient_account text,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_sender_account text;
  v_sender_wallet uuid;
  v_recipient_wallet uuid;
  v_sender_balance bigint;
  v_transfer uuid;
  v_email_confirmed_at timestamptz;
  v_daily_total bigint;
  v_max_transaction bigint;
  v_daily_limit bigint;
begin
  if v_sender is null then
    raise exception 'Authentication required';
  end if;

  select u.email_confirmed_at into v_email_confirmed_at
  from auth.users u where u.id = v_sender;
  if v_email_confirmed_at is null then
    raise exception 'Email confirmation required';
  end if;

  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'MFA verification required';
  end if;

  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(auth.jwt()->'amr','[]'::jsonb)
    ) as factor
    where factor->>'method' = 'totp'
      and (factor->>'timestamp') ~ '^[0-9]+$'
      and (factor->>'timestamp')::bigint >=
          pg_catalog.floor(extract(epoch from pg_catalog.now()))::bigint - 90
  ) then
    raise exception 'A fresh TOTP code is required for each transfer';
  end if;

  if p_recipient_account is null or
     p_recipient_account !~* '^TST[A-Z0-9]{10}$' then
    raise exception 'Invalid recipient account';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Invalid test amount';
  end if;
  if p_currency not in ('USD','CDF') then
    raise exception 'Unsupported currency';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;

  -- Limits équivalents à 1 000 USD par opération et 5 000 USD par jour.
  v_max_transaction := case when p_currency = 'USD' then 100000 else 2850000 end;
  v_daily_limit := case when p_currency = 'USD' then 500000 else 14250000 end;
  if p_amount_minor > v_max_transaction then
    raise exception 'Per-transfer test limit exceeded';
  end if;

  -- La clé d'idempotence bloque les répétitions/reprises de la même requête.
  select t.id into v_transfer
  from public.transfers t
  where t.sender_id = v_sender and t.idempotency_key = p_idempotency_key;
  if v_transfer is not null then
    return v_transfer;
  end if;

  select p.id into v_recipient
  from public.profiles p
  where p.account_number = pg_catalog.upper(pg_catalog.btrim(p_recipient_account));
  if v_recipient is null then
    raise exception 'Recipient account not found';
  end if;
  if v_recipient = v_sender then
    raise exception 'Cannot transfer to the same account';
  end if;

  select p.account_number into v_sender_account
  from public.profiles p where p.id = v_sender;

  select w.id into v_sender_wallet
  from public.wallets w where w.user_id = v_sender and w.currency = p_currency;
  select w.id into v_recipient_wallet
  from public.wallets w where w.user_id = v_recipient and w.currency = p_currency;
  if v_sender_wallet is null or v_recipient_wallet is null then
    raise exception 'Wallet not found';
  end if;

  -- Verrouiller les deux portefeuilles dans un ordre stable.
  perform w.id
  from public.wallets w
  where w.id in (v_sender_wallet, v_recipient_wallet)
  order by w.id
  for update;

  select w.balance_minor into v_sender_balance
  from public.wallets w where w.id = v_sender_wallet;
  if v_sender_balance < p_amount_minor then
    raise exception 'Insufficient simulated balance';
  end if;

  select coalesce(pg_catalog.sum(t.amount_minor),0)::bigint into v_daily_total
  from public.transfers t
  where t.sender_id = v_sender
    and t.currency = p_currency
    and t.created_at >= pg_catalog.date_trunc('day', pg_catalog.now());

  if v_daily_total + p_amount_minor > v_daily_limit then
    raise exception 'Daily test limit exceeded';
  end if;

  insert into public.transfers(
    sender_id, recipient_id, sender_account, recipient_account,
    currency, amount_minor, idempotency_key
  )
  values (
    v_sender, v_recipient, v_sender_account,
    pg_catalog.upper(pg_catalog.btrim(p_recipient_account)),
    p_currency, p_amount_minor, p_idempotency_key
  )
  on conflict (sender_id, idempotency_key) do nothing
  returning id into v_transfer;

  if v_transfer is null then
    select t.id into v_transfer from public.transfers t
    where t.sender_id = v_sender and t.idempotency_key = p_idempotency_key;
    return v_transfer;
  end if;

  update public.wallets
  set balance_minor = balance_minor - p_amount_minor
  where id = v_sender_wallet;

  update public.wallets
  set balance_minor = balance_minor + p_amount_minor
  where id = v_recipient_wallet;

  insert into public.ledger_entries(
    transfer_id,user_id,wallet_id,entry_type,currency,amount_minor
  ) values
    (v_transfer,v_sender,v_sender_wallet,'debit',p_currency,p_amount_minor),
    (v_transfer,v_recipient,v_recipient_wallet,'credit',p_currency,p_amount_minor);

  insert into public.security_events(user_id,event_type,details)
  values
    (v_sender,'simulated_transfer_sent',
     pg_catalog.jsonb_build_object('transfer_id',v_transfer,'currency',p_currency)),
    (v_recipient,'simulated_transfer_received',
     pg_catalog.jsonb_build_object('transfer_id',v_transfer,'currency',p_currency));

  return v_transfer;
end;
$$;
revoke all on function public.teste_send_simulated_transfer(text,bigint,text,uuid) from public, anon;
grant execute on function public.teste_send_simulated_transfer(text,bigint,text,uuid) to authenticated;

-- 8) Le taux est consultable par les comptes connectés, jamais modifiable par eux.
revoke all on table public.exchange_rates from anon, authenticated;
grant select on table public.exchange_rates to authenticated;

-- 9) Le déclencheur d'inscription reste serveur uniquement.
revoke all on function public.teste_handle_new_user() from public, anon, authenticated;

commit;

-- Pour modifier le taux indicatif, exécuter manuellement dans SQL Editor :
-- update public.exchange_rates set rate = 2850, updated_at = now() where pair = 'USD_CDF';
