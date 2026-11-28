-- TESTE — verrouillage de la version design-only.
-- Supabase Auth reste le seul service distant utilisé par le client.
-- Les préférences et photos restent locales; aucun portefeuille, transfert,
-- retrait, paiement, carte bancaire ou historique financier n'est utilisé.
--
-- Les anciennes tables et leurs lignes sont conservées. Ce script ferme
-- simplement les accès client et désactive les anciennes fonctions.

begin;

-- Retirer les anciennes politiques de stockage des photos.
-- Les fichiers déjà présents ne sont pas supprimés.
drop policy if exists profile_photos_select_own on storage.objects;
drop policy if exists profile_photos_insert_own on storage.objects;
drop policy if exists profile_photos_update_own on storage.objects;
drop policy if exists profile_photos_delete_own on storage.objects;

-- Empêcher la création automatique d'anciens portefeuilles à l'inscription.
drop trigger if exists teste_auth_user_created on auth.users;
drop trigger if exists teste_v2_auth_created on auth.users;
drop function if exists public.teste_handle_new_user();
drop function if exists public.teste_create_user_data();

-- Désactiver les anciennes fonctions qui modifiaient des montants ou des cartes.
drop function if exists public.teste_send_simulated_transfer(text,bigint,text,uuid);
drop function if exists public.teste_mobile_money_withdrawal(text,text,bigint,text,uuid);
drop function if exists public.teste_update_profile(text,text,boolean,jsonb);
drop function if exists public.teste_demo_send(text,numeric,text,text);
drop function if exists public.teste_demo_toggle_card(boolean);
drop function if exists public.teste_admin_set_opening(bigint,bigint,numeric);
drop function if exists public.teste_update_preferences(jsonb);

-- Fermer les privilèges client sur les anciennes tables financières.
-- Aucune table ni aucune ligne n'est supprimée.
do $lock_legacy$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles',
    'wallets',
    'test_cards',
    'transfers',
    'security_events',
    'ledger_entries',
    'exchange_rates',
    'mfa_transfer_proofs',
    'mobile_money_withdrawals',
    'teste_settings',
    'teste_profiles',
    'teste_wallets',
    'teste_transfers',
    'teste_notifications',
    'teste_cards',
    'teste_admin_seed_log'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke all on table public.%I from anon, authenticated',v_table);
    end if;
  end loop;
end
$lock_legacy$;

commit;

-- Contrôle : cette requête ne doit retourner aucun privilège client
-- pour les tables de comptes, de cartes ou d'opérations.
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema='public'
  and table_name in (
    'profiles','wallets','test_cards','transfers','ledger_entries',
    'exchange_rates','mfa_transfer_proofs','mobile_money_withdrawals',
    'teste_settings','teste_profiles','teste_wallets','teste_transfers',
    'teste_notifications','teste_cards','teste_admin_seed_log'
  )
  and grantee in ('anon','authenticated')
order by table_name,grantee,privilege_type;

-- Contrôle : les anciennes fonctions d'opération ne doivent plus exister.
select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'teste_send_simulated_transfer','teste_mobile_money_withdrawal',
    'teste_demo_send','teste_demo_toggle_card','teste_admin_set_opening',
    'teste_create_user_data'
  );