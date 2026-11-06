-- TESTE — Retrait Mobile Money (comptabilité interne pédagogique)
-- Déplace le solde du portefeuille utilisateur vers le compte central TESTE.
-- Aucun paiement Airtel/Orange/M-Pesa réel n'est déclenché par cette fonction.

begin;

create table if not exists public.mobile_money_withdrawals (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null unique references public.transfers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  central_user_id uuid not null references auth.users(id) on delete restrict,
  operator text not null check (operator in ('airtel_money','orange_money','mpesa')),
  phone_number text not null check (phone_number ~ '^\\+?[0-9]{9,15}$'),
  currency text not null check (currency in ('USD','CDF')),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'recorded' check (status in ('recorded')),
  created_at timestamptz not null default now()
);

create index if not exists mobile_money_withdrawals_user_created_idx
  on public.mobile_money_withdrawals(user_id, created_at desc);
create index if not exists mobile_money_withdrawals_central_created_idx
  on public.mobile_money_withdrawals(central_user_id, created_at desc);

alter table public.mobile_money_withdrawals enable row level security;
drop policy if exists mobile_money_withdrawals_select_participant
  on public.mobile_money_withdrawals;
create policy mobile_money_withdrawals_select_participant
  on public.mobile_money_withdrawals
  for select to authenticated
  using (user_id = (select auth.uid()) or central_user_id = (select auth.uid()));

revoke all on public.mobile_money_withdrawals from anon, authenticated;
grant select on public.mobile_money_withdrawals to authenticated;

create or replace function public.teste_mobile_money_withdrawal(
  p_operator text,
  p_phone_number text,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $withdrawal$
declare
  v_sender uuid := auth.uid();
  v_sender_account text;
  v_central uuid;
  v_central_account text;
  v_sender_wallet uuid;
  v_central_wallet uuid;
  v_sender_balance bigint;
  v_transfer uuid;
  v_email_confirmed_at timestamptz;
  v_daily_total bigint;
  v_max_transaction bigint;
  v_daily_limit bigint;
  v_totp_timestamp bigint;
  v_exchange_rate numeric(18,6);
begin
  if v_sender is null then raise exception 'Connexion requise'; end if;

  select u.email_confirmed_at into v_email_confirmed_at
  from auth.users u where u.id = v_sender;
  if v_email_confirmed_at is null then raise exception 'Confirmation e-mail requise'; end if;

  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Vérification MFA requise';
  end if;

  select pg_catalog.max((f.item->>'timestamp')::bigint)
    into v_totp_timestamp
  from pg_catalog.jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) as f(item)
  where f.item->>'method' = 'totp'
    and pg_catalog.jsonb_typeof(f.item->'timestamp') = 'number';

  if v_totp_timestamp is null or v_totp_timestamp <
    pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()))::bigint - 90 then
    raise exception 'Un nouveau code de vérification est requis';
  end if;

  if p_operator is null or p_operator not in ('airtel_money','orange_money','mpesa') then
    raise exception 'Opérateur Mobile Money non reconnu';
  end if;
  if p_phone_number is null or p_phone_number !~ '^\\+?[0-9]{9,15}$' then
    raise exception 'Numéro Mobile Money invalide';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Montant invalide';
  end if;
  if p_currency is null or p_currency not in ('USD','CDF') then raise exception 'Devise non prise en charge'; end if;
  if p_idempotency_key is null then raise exception 'Référence de demande manquante'; end if;

  insert into public.mfa_transfer_proofs(user_id,proof_timestamp)
  values (v_sender,v_totp_timestamp)
  on conflict (user_id,proof_timestamp) do nothing;
  if not found then raise exception 'Ce code de sécurité a déjà été utilisé'; end if;

  select t.id into v_transfer
  from public.transfers t
  where t.sender_id = v_sender and t.idempotency_key = p_idempotency_key;
  if v_transfer is not null then return v_transfer; end if;

  select p.id,p.account_number into v_central,v_central_account
  from public.profiles p
  join auth.users u on u.id = p.id
  where pg_catalog.lower(u.email) = 'dalzonmbal@gmail.com'
    and p.account_number = 'TST2261094C50';

  if v_central is null then
    raise exception 'Compte central TESTE introuvable : vérifiez le compte administrateur';
  end if;
  if v_central = v_sender then raise exception 'Le compte central ne peut pas retirer vers lui-même'; end if;

  select p.account_number into v_sender_account
  from public.profiles p where p.id = v_sender;

  select w.id into v_sender_wallet from public.wallets w
  where w.user_id = v_sender and w.currency = p_currency;
  select w.id into v_central_wallet from public.wallets w
  where w.user_id = v_central and w.currency = p_currency;
  if v_sender_wallet is null or v_central_wallet is null then
    raise exception 'Portefeuille introuvable pour cette devise';
  end if;

  perform w.id from public.wallets w
  where w.id in (v_sender_wallet,v_central_wallet)
  order by w.id for update;

  select w.balance_minor into v_sender_balance
  from public.wallets w where w.id = v_sender_wallet;
  if v_sender_balance < p_amount_minor then raise exception 'Solde insuffisant'; end if;

  select r.rate into v_exchange_rate from public.exchange_rates r where r.pair='USD_CDF';
  if v_exchange_rate is null or v_exchange_rate <= 0 then raise exception 'Taux serveur indisponible'; end if;
  v_max_transaction := case when p_currency='USD' then 100000
    else pg_catalog.round(v_exchange_rate*1000)::bigint end;
  v_daily_limit := case when p_currency='USD' then 500000
    else pg_catalog.round(v_exchange_rate*5000)::bigint end;
  if p_amount_minor > v_max_transaction then raise exception 'Plafond par opération dépassé'; end if;

  select coalesce(pg_catalog.sum(t.amount_minor),0)::bigint into v_daily_total
  from public.transfers t
  where t.sender_id=v_sender and t.currency=p_currency
    and t.created_at >= pg_catalog.date_trunc('day',pg_catalog.now());
  if v_daily_total + p_amount_minor > v_daily_limit then
    raise exception 'Plafond journalier dépassé';
  end if;

  insert into public.transfers(
    sender_id,recipient_id,sender_account,recipient_account,
    currency,amount_minor,idempotency_key
  ) values (
    v_sender,v_central,v_sender_account,v_central_account,
    p_currency,p_amount_minor,p_idempotency_key
  ) returning id into v_transfer;

  update public.wallets set balance_minor=balance_minor-p_amount_minor where id=v_sender_wallet;
  update public.wallets set balance_minor=balance_minor+p_amount_minor where id=v_central_wallet;

  insert into public.ledger_entries(transfer_id,user_id,wallet_id,entry_type,currency,amount_minor)
  values
    (v_transfer,v_sender,v_sender_wallet,'debit',p_currency,p_amount_minor),
    (v_transfer,v_central,v_central_wallet,'credit',p_currency,p_amount_minor);

  insert into public.mobile_money_withdrawals(
    transfer_id,user_id,central_user_id,operator,phone_number,currency,amount_minor,status
  ) values (
    v_transfer,v_sender,v_central,p_operator,p_phone_number,p_currency,p_amount_minor,'recorded'
  );

  update public.mfa_transfer_proofs set transfer_id=v_transfer
  where user_id=v_sender and proof_timestamp=v_totp_timestamp;

  insert into public.security_events(user_id,event_type,details)
  values (v_sender,'mobile_money_withdrawal_recorded',
    pg_catalog.jsonb_build_object('transfer_id',v_transfer,'operator',p_operator,'currency',p_currency));

  return v_transfer;
end;
$withdrawal$;

revoke all on function public.teste_mobile_money_withdrawal(text,text,bigint,text,uuid)
  from public, anon;
grant execute on function public.teste_mobile_money_withdrawal(text,text,bigint,text,uuid)
  to authenticated;

commit;
