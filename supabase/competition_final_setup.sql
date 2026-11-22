-- TESTE — finition concours : préférences persistantes, carte, photos et compte propriétaire.
-- À exécuter une seule fois dans Supabase SQL Editor après teste_demo_wallet_v2.sql.
begin;

alter table public.teste_profiles
  add column if not exists preferences jsonb not null
  default '{"theme":"light","currency":"USD","language":"fr"}'::jsonb;

create or replace function public.teste_update_preferences(p_preferences jsonb)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_user uuid := auth.uid();
  v_theme text;
  v_currency text;
  v_language text;
begin
  if v_user is null then raise exception 'Connexion requise.'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then raise exception 'Préférences invalides.'; end if;
  v_theme := case when p_preferences->>'theme' in ('light','dark') then p_preferences->>'theme' else 'light' end;
  v_currency := case when p_preferences->>'currency' in ('USD','CDF') then p_preferences->>'currency' else 'USD' end;
  v_language := case when p_preferences->>'language' in ('fr','en','sw') then p_preferences->>'language' else 'fr' end;
  update public.teste_profiles
     set preferences=jsonb_build_object('theme',v_theme,'currency',v_currency,'language',v_language)
   where user_id=v_user;
  if not found then raise exception 'Profil introuvable.'; end if;
end;
$$;

revoke all on function public.teste_update_preferences(jsonb) from public,anon;
grant execute on function public.teste_update_preferences(jsonb) to authenticated;

-- Garantir une carte pour chaque compte existant, sans créer de numéro bancaire.
insert into public.teste_cards(user_id,last4,status)
select u.id,upper(right(replace(u.id::text,'-',''),4)),'active'
from auth.users u
on conflict(user_id) do nothing;

-- Stockage privé des photos. Les formats image/* courants sont acceptés.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,10485760,null)
on conflict(id) do update
set public=false,file_size_limit=10485760,allowed_mime_types=null;

drop policy if exists profile_photos_select_own on storage.objects;
drop policy if exists profile_photos_insert_own on storage.objects;
drop policy if exists profile_photos_update_own on storage.objects;
drop policy if exists profile_photos_delete_own on storage.objects;

create policy profile_photos_select_own on storage.objects
for select to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy profile_photos_insert_own on storage.objects
for insert to authenticated
with check(
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce(metadata->>'mimetype','') like 'image/%'
  and coalesce((metadata->>'size')::bigint,0) between 1 and 10485760
  and lower(name) ~ '\.[a-z0-9]{2,8}$'
);

create policy profile_photos_update_own on storage.objects
for update to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(
  bucket_id='profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and coalesce(metadata->>'mimetype','') like 'image/%'
  and coalesce((metadata->>'size')::bigint,0) between 1 and 10485760
  and lower(name) ~ '\.[a-z0-9]{2,8}$'
);

create policy profile_photos_delete_own on storage.objects
for delete to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Crédit initial du seul compte propriétaire, une seule fois.
-- Les montants sont des crédits virtuels de concours, sans valeur monétaire.
create table if not exists public.teste_admin_seed_log(
  user_id uuid primary key references auth.users(id) on delete cascade,
  seeded_at timestamptz not null default now()
);
revoke all on public.teste_admin_seed_log from public,anon,authenticated;

do $$
declare
  v_admin uuid;
  v_email text := 'dalzonmbal@gmail.com';
begin
  select id into v_admin
  from auth.users
  where lower(email)=lower(v_email)
  limit 1;

  if v_admin is null then
    raise exception 'Le compte % est introuvable. Créez-le et confirmez son adresse e-mail avant de relancer ce script.',v_email;
  end if;

  update auth.users
     set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"role":"admin"}'::jsonb
   where id=v_admin;

  insert into public.teste_profiles(user_id,account_id,full_name,email)
  select v_admin,
         'TST'||upper(substr(replace(v_admin::text,'-',''),1,10)),
         coalesce(nullif(split_part(v_email,'@',1),''),'Administrateur TESTE'),
         v_email
  on conflict(user_id) do nothing;

  if not exists(select 1 from public.teste_admin_seed_log where user_id=v_admin) then
    insert into public.teste_wallets(user_id,currency,balance_minor)
    values(v_admin,'USD',100000000),(v_admin,'CDF',1000000)
    on conflict(user_id,currency) do update
      set balance_minor=excluded.balance_minor,updated_at=now();

    insert into public.teste_cards(user_id,last4,status)
    values(v_admin,upper(right(replace(v_admin::text,'-',''),4)),'active')
    on conflict(user_id) do nothing;

    insert into public.teste_admin_seed_log(user_id) values(v_admin);
  end if;
end;
$$;

commit;

-- Contrôle après exécution : doit afficher 1 000 000,00 USD et 1 000 000 CDF.
select w.currency,
       case when w.currency='USD' then (w.balance_minor::numeric/100)::text||' USD'
            else w.balance_minor::text||' CDF' end as solde,
       u.email,
       (u.raw_app_meta_data->>'role') as role
from public.teste_wallets w
join auth.users u on u.id=w.user_id
where lower(u.email)='dalzonmbal@gmail.com'
order by w.currency;
