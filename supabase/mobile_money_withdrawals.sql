-- TESTE — Désactivation définitive du parcours Mobile Money.
-- Le projet reste une interface éducative : aucun numéro de téléphone,
-- ordre de retrait ou transfert vers un opérateur externe ne doit être stocké.
--
-- À exécuter dans Supabase SQL Editor uniquement si l'ancienne migration
-- mobile_money_withdrawals.sql a déjà été exécutée.
-- Cette opération supprime la fonction et la table de retrait, ainsi que
-- les numéros et demandes qui auraient pu y être enregistrés.

begin;

drop function if exists public.teste_mobile_money_withdrawal(text,text,bigint,text,uuid);
drop table if exists public.mobile_money_withdrawals;

commit;
