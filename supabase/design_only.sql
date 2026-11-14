-- TESTE — configuration minimale pour la maquette.
-- Les seuls services utilisés sont Supabase Auth et le stockage privé facultatif
-- des photos de profil. Aucun traitement financier n'est activé.

begin;

-- 1) Espace privé pour les photos de profil (JPG, PNG, WebP, 3 Mo maximum).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  3145728,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=3145728,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists profile_photos_select_own on storage.objects;
drop policy if exists profile_photos_insert_own on storage.objects;
drop policy if exists profile_photos_update_own on storage.objects;
drop policy if exists profile_photos_delete_own on storage.objects;

create policy profile_photos_select_own on storage.objects
for select to authenticated
using (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create policy profile_photos_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and lower(name) ~ '\\.(jpg|jpeg|png|webp)$'
  and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
  and coalesce((metadata->>'size')::bigint,0) between 1 and 3145728
);

create policy profile_photos_update_own on storage.objects
for update to authenticated
using (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and lower(name) ~ '\\.(jpg|jpeg|png|webp)$'
  and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
  and coalesce((metadata->>'size')::bigint,0) between 1 and 3145728
);

create policy profile_photos_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

-- 2) Désactiver les anciennes fonctions de transfert, de retrait et de profil.
drop trigger if exists teste_auth_user_created on auth.users;
drop function if exists public.teste_handle_new_user();
drop function if exists public.teste_send_simulated_transfer(text,bigint,text,uuid);
drop function if exists public.teste_mobile_money_withdrawal(text,text,bigint,text,uuid);
drop function if exists public.teste_update_profile(text,text,boolean,jsonb);

-- 3) Fermer l’accès client aux anciennes tables de démonstration.
-- Les éventuelles anciennes lignes ne sont pas supprimées par cette migration.
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
    'mobile_money_withdrawals'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke all on table public.%I from anon, authenticated',v_table);
    end if;
  end loop;
end
$lock_legacy$;

commit;

-- Vérification facultative : les anciennes tables financières ne doivent plus
-- accorder de privilèges à anon ou authenticated.
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema='public'
  and table_name in (
    'profiles','wallets','test_cards','transfers','ledger_entries',
    'exchange_rates','mfa_transfer_proofs','mobile_money_withdrawals'
  )
  and grantee in ('anon','authenticated')
order by table_name,grantee,privilege_type;
