-- TESTE v2 — portefeuille pédagogique uniquement.
-- Aucun paiement, retrait Mobile Money, réseau bancaire ou carte réelle.
begin;

create table if not exists public.teste_settings (
  id boolean primary key default true check (id),
  opening_usd_cents bigint not null default 0 check (opening_usd_cents >= 0),
  opening_cdf bigint not null default 0 check (opening_cdf >= 0),
  usd_cdf_rate numeric(14,4) not null default 2300 check (usd_cdf_rate > 0),
  updated_at timestamptz not null default now()
);
insert into public.teste_settings(id) values(true) on conflict(id) do nothing;

create table if not exists public.teste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text unique not null,
  full_name text not null default 'Utilisateur TESTE',
  email text,
  created_at timestamptz not null default now()
);
create table if not exists public.teste_wallets (
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check(currency in ('USD','CDF')),
  balance_minor bigint not null default 0 check(balance_minor >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,currency)
);
create table if not exists public.teste_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  sender_currency text not null check(sender_currency in ('USD','CDF')),
  recipient_currency text not null check(recipient_currency in ('USD','CDF')),
  sender_amount_minor bigint not null check(sender_amount_minor > 0),
  recipient_amount_minor bigint not null check(recipient_amount_minor > 0),
  rate numeric(14,4) not null,
  created_at timestamptz not null default now()
);
create table if not exists public.teste_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.teste_cards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last4 text not null,
  status text not null default 'active' check(status in ('active','locked')),
  created_at timestamptz not null default now()
);

create or replace function public.teste_is_admin()
returns boolean language sql stable security definer set search_path=public,auth
as $$ select coalesce((auth.jwt()->'app_metadata'->>'role')='admin',false) $$;

create or replace function public.teste_create_user_data()
returns trigger language plpgsql security definer set search_path=public,auth
as $$
declare s public.teste_settings%rowtype; aid text;
begin
  select * into s from public.teste_settings where id=true;
  aid := 'TST'||upper(substr(replace(new.id::text,'-',''),1,10));
  insert into public.teste_profiles(user_id,account_id,full_name,email)
  values(new.id,aid,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(coalesce(new.email,''),'@',1),'Utilisateur TESTE'),new.email)
  on conflict(user_id) do nothing;
  insert into public.teste_wallets(user_id,currency,balance_minor)
  values(new.id,'USD',coalesce(s.opening_usd_cents,0)),(new.id,'CDF',coalesce(s.opening_cdf,0))
  on conflict(user_id,currency) do nothing;
  insert into public.teste_cards(user_id,last4)
  values(new.id,upper(substr(replace(new.id::text,'-',''),27,4)))
  on conflict(user_id) do nothing;
  insert into public.teste_notifications(user_id,title,body)
  values(new.id,'Bienvenue sur TESTE','Votre espace pédagogique est prêt. Les soldes sont des montants de démonstration.');
  return new;
end $$;

drop trigger if exists teste_v2_auth_created on auth.users;
create trigger teste_v2_auth_created after insert on auth.users
for each row execute function public.teste_create_user_data();

-- Backfill des comptes déjà créés : ils reçoivent les montants configurés à l'installation.
do $$
declare u record; s public.teste_settings%rowtype;
begin
  select * into s from public.teste_settings where id=true;
  for u in select id,email,raw_user_meta_data from auth.users loop
    insert into public.teste_profiles(user_id,account_id,full_name,email)
    values(u.id,'TST'||upper(substr(replace(u.id::text,'-',''),1,10)),
      coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',split_part(coalesce(u.email,''),'@',1),'Utilisateur TESTE'),u.email)
    on conflict(user_id) do nothing;
    insert into public.teste_wallets(user_id,currency,balance_minor)
    values(u.id,'USD',coalesce(s.opening_usd_cents,0)),(u.id,'CDF',coalesce(s.opening_cdf,0))
    on conflict(user_id,currency) do nothing;
    insert into public.teste_cards(user_id,last4)
    values(u.id,upper(substr(replace(u.id::text,'-',''),27,4)))
    on conflict(user_id) do nothing;
  end loop;
end $$;

create or replace function public.teste_demo_send(
  p_recipient_account text,
  p_amount numeric,
  p_sender_currency text,
  p_recipient_currency text
) returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_rate numeric(14,4);
  v_sender_minor bigint;
  v_recipient_minor bigint;
  v_sender_balance bigint;
  v_recipient_balance bigint;
  v_transfer uuid;
  v_sender_name text;
begin
  if v_sender is null then raise exception 'Connectez-vous pour continuer.'; end if;
  if p_sender_currency not in ('USD','CDF') or p_recipient_currency not in ('USD','CDF') then raise exception 'Devise invalide.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'Montant invalide.'; end if;
  select user_id into v_recipient from public.teste_profiles where account_id=upper(trim(p_recipient_account));
  if v_recipient is null then raise exception 'Identifiant TESTE introuvable.'; end if;
  if v_recipient=v_sender then raise exception 'Vous ne pouvez pas vous envoyer un montant à vous-même.'; end if;
  select usd_cdf_rate into v_rate from public.teste_settings where id=true;
  v_sender_minor := case when p_sender_currency='USD' then round(p_amount*100)::bigint else round(p_amount)::bigint end;
  v_recipient_minor := case
    when p_sender_currency=p_recipient_currency then v_sender_minor
    when p_sender_currency='USD' then round(p_amount*v_rate)::bigint
    else round((p_amount/v_rate)*100)::bigint
  end;
  -- Lock both wallets in stable user-id order to avoid concurrent overspending.
  perform 1 from public.teste_wallets
   where (user_id=v_sender or user_id=v_recipient)
     and currency in (p_sender_currency,p_recipient_currency)
   order by user_id,currency for update;
  select balance_minor into v_sender_balance from public.teste_wallets
   where user_id=v_sender and currency=p_sender_currency for update;
  if coalesce(v_sender_balance,0)<v_sender_minor then raise exception 'Solde de démonstration insuffisant.'; end if;
  update public.teste_wallets set balance_minor=balance_minor-v_sender_minor,updated_at=now()
   where user_id=v_sender and currency=p_sender_currency;
  insert into public.teste_wallets(user_id,currency,balance_minor)
   values(v_recipient,p_recipient_currency,v_recipient_minor)
   on conflict(user_id,currency) do update set balance_minor=teste_wallets.balance_minor+excluded.balance_minor,updated_at=now();
  insert into public.teste_transfers(sender_id,recipient_id,sender_currency,recipient_currency,sender_amount_minor,recipient_amount_minor,rate)
  values(v_sender,v_recipient,p_sender_currency,p_recipient_currency,v_sender_minor,v_recipient_minor,v_rate)
  returning id into v_transfer;
  select full_name into v_sender_name from public.teste_profiles where user_id=v_sender;
  insert into public.teste_notifications(user_id,title,body)
  values(v_sender,'Envoi enregistré (démo)','Votre opération pédagogique a été enregistrée dans TESTE.'),
        (v_recipient,'Montant reçu (démo)','Un montant de démonstration a été ajouté à votre portefeuille.');
  return jsonb_build_object('transfer_id',v_transfer,'sender_amount_minor',v_sender_minor,
    'recipient_amount_minor',v_recipient_minor,'sender_currency',p_sender_currency,
    'recipient_currency',p_recipient_currency,'rate',v_rate,'recipient_account',upper(trim(p_recipient_account)));
end $$;

create or replace function public.teste_admin_set_opening(p_usd_cents bigint,p_cdf bigint,p_rate numeric default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
 if not public.teste_is_admin() then raise exception 'Accès administrateur requis.'; end if;
 if p_usd_cents<0 or p_cdf<0 or (p_rate is not null and p_rate<=0) then raise exception 'Paramètres invalides.'; end if;
 update public.teste_settings set opening_usd_cents=p_usd_cents,opening_cdf=p_cdf,
 usd_cdf_rate=coalesce(p_rate,usd_cdf_rate),updated_at=now() where id=true;
end $$;

create or replace function public.teste_demo_toggle_card(p_locked boolean)
returns text language plpgsql security definer set search_path=public,auth
as $
declare v_status text;
begin
 if auth.uid() is null then raise exception 'Connectez-vous.'; end if;
 update public.teste_cards set status=case when p_locked then 'locked' else 'active' end
 where user_id=auth.uid() returning status into v_status;
 if v_status is null then raise exception 'Carte de démonstration introuvable.'; end if;
 insert into public.teste_notifications(user_id,title,body)
 values(auth.uid(),'Carte mise à jour',case when p_locked then 'Votre carte de démonstration est verrouillée.' else 'Votre carte de démonstration est activée.' end);
 return v_status;
end $;

alter table public.teste_profiles enable row level security;
alter table public.teste_wallets enable row level security;
alter table public.teste_transfers enable row level security;
alter table public.teste_notifications enable row level security;
alter table public.teste_cards enable row level security;
alter table public.teste_settings enable row level security;
drop policy if exists teste_profile_read on public.teste_profiles;
create policy teste_profile_read on public.teste_profiles for select to authenticated using(user_id=auth.uid());
drop policy if exists teste_wallet_read on public.teste_wallets;
create policy teste_wallet_read on public.teste_wallets for select to authenticated using(user_id=auth.uid());
drop policy if exists teste_transfer_read on public.teste_transfers;
create policy teste_transfer_read on public.teste_transfers for select to authenticated using(sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists teste_notification_read on public.teste_notifications;
create policy teste_notification_read on public.teste_notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists teste_notification_update on public.teste_notifications;
create policy teste_notification_update on public.teste_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists teste_card_read on public.teste_cards;
create policy teste_card_read on public.teste_cards for select to authenticated using(user_id=auth.uid());
-- No direct client INSERT/UPDATE/DELETE on balances, transfers, profiles, cards or settings.
revoke all on public.teste_settings,public.teste_profiles,public.teste_wallets,public.teste_transfers,public.teste_cards from anon,authenticated;
grant select on public.teste_profiles,public.teste_wallets,public.teste_transfers,public.teste_cards to authenticated;
grant select,update on public.teste_notifications to authenticated;
grant execute on function public.teste_demo_send(text,numeric,text,text) to authenticated;
grant execute on function public.teste_admin_set_opening(bigint,bigint,numeric) to authenticated;
grant execute on function public.teste_demo_toggle_card(boolean) to authenticated;
revoke all on function public.teste_create_user_data() from public,anon,authenticated;
revoke all on function public.teste_is_admin() from public,anon;

-- Publication Realtime pour actualiser les portefeuilles et notifications ouverts.
do $realtime$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['teste_wallets','teste_transfers','teste_notifications','teste_cards'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end
$realtime$;
commit;

-- Après installation, attribuer le rôle admin au compte propriétaire depuis SQL Editor :
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'ADRESSE_EMAIL_DU_PROPRIETAIRE';
-- Puis configurer les soldes initiaux (exemple : 100 USD et 230000 CDF) :
-- select public.teste_admin_set_opening(10000,230000,2300);
-- À exécuter UNE SEULE FOIS si vous voulez créditer les comptes déjà existants
-- avec les montants de départ configurés (cela remplace leurs soldes actuels) :
-- update public.teste_wallets w
-- set balance_minor = case when w.currency='USD' then s.opening_usd_cents else s.opening_cdf end,
--     updated_at = now()
-- from public.teste_settings s where s.id=true;
-- Les nouveaux comptes reçoivent automatiquement les montants configurés.
