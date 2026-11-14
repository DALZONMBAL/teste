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

-- Une preuve MFA récente ne peut autoriser qu'une seule opération.
-- Aucun accès direct depuis le navigateur.
create table if not exists public.mfa_transfer_proofs (
  user_id uuid not null references auth.users(id) on delete restrict,
  proof_timestamp bigint not null,
  transfer_id uuid unique references public.transfers(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(user_id, proof_timestamp)
);

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
alter table public.mfa_transfer_proofs enable row level security;

-- Couvrir également toute autre table déjà présente dans le schéma public.
do $rls_all_public$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end
$rls_all_public$;

-- Empêcher les nouvelles tables créées par ce rôle de recevoir des droits client par défaut.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

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
                        'security_events','ledger_entries','exchange_rates','mfa_transfer_proofs')
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
  public.exchange_rates, public.mfa_transfer_proofs from anon, authenticated;
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

-- 7) Aucun traitement de transfert n’est défini pour cette maquette.

-- 8) Le taux de présentation est défini localement dans app.js.
-- Aucune lecture de taux ni donnée financière n’est nécessaire côté serveur.
revoke all on table public.exchange_rates from anon, authenticated;

-- 9) À l’inscription, ne créer qu’un identifiant de présentation.
-- Aucun portefeuille ni référence de carte n’est initialisé.
create or replace function public.teste_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $teste_trigger$
declare
  v_account text;
begin
  v_account := 'TST' || pg_catalog.upper(
    pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10)
  );

  insert into public.profiles(id,full_name,account_number)
  values (new.id,coalesce(new.raw_user_meta_data->>'full_name',''),v_account)
  on conflict (id) do nothing;

  return new;
end;
$teste_trigger$;
revoke all on function public.teste_handle_new_user() from public, anon, authenticated;

-- 10) Vérification après migration : toutes les tables de TESTE doivent afficher rowsecurity = true.
select n.nspname as schemaname, c.relname as tablename,
       c.relrowsecurity as rowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- Le taux d’exemple est affiché localement par l’interface ; aucune cotation en direct n’est utilisée.

-- 11) Mode maquette : désactiver les anciennes fonctions et tables financières.
begin;
drop function if exists public.teste_send_simulated_transfer(text,bigint,text,uuid);
drop function if exists public.teste_update_profile(text,text,boolean,jsonb);
do $design_only$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles','wallets','test_cards','transfers','security_events',
    'ledger_entries','exchange_rates','mfa_transfer_proofs'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke all on table public.%I from anon, authenticated',v_table);
    end if;
  end loop;
end
$design_only$;
commit;

-- Les anciennes lignes de démonstration ne sont pas supprimées.
-- Elles ne sont plus accessibles au client et ne sont plus utilisées par l’application.
