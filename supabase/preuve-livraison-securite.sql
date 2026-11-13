-- ============================================================
-- PRÉPARÉ, PAS APPLIQUÉ — appli « Preuve de livraison » (même projet Supabase que Broodautomate)
-- v5.25 : vérification complète : les fonctions de connexion de cette appli (pl_login, pl_admin_list,
-- pl_admin_add, pl_admin_delete) peuvent être essayées sans limite par n'importe qui (la clé publique est dans
-- l'appli) : on peut tenter des milliers de mots de passe. Et pl_admin_list rend TOUS les mots de passe des
-- chauffeurs à qui trouve celui de l'admin.
--
-- Ce fichier ajoute un VERROU : après 5 mots de passe faux pour un même nom, ce nom est bloqué 15 minutes
-- (le bon mot de passe ne marche plus pendant ce temps), et chaque essai faux attend une demi-seconde.
-- L'admin voit toujours les mots de passe des chauffeurs (c'est ce que tu as demandé pour cette appli).
-- Un seul changement visible : avec un mauvais mot de passe ADMIN, la liste des chauffeurs revient vide au lieu
-- d'un message « Accès refusé » (sinon PostgreSQL annule aussi le compteur d'essais : le verrou ne marcherait pas).
--
-- À faire dans Supabase → SQL Editor, UNE commande à la fois (de « create » jusqu'au « ; » ou au « $$; »).
-- Pour revenir en arrière : les commandes « ANCIENNES VERSIONS » tout en bas.
-- ============================================================

-- 1. Les essais ratés (personne n'y touche directement : seulement par les fonctions ci-dessous)
create table if not exists public.pl_essais (cle text primary key, echecs integer not null default 0, bloque_jusqua timestamptz);

-- 2. Sécurité de cette table
alter table public.pl_essais enable row level security;

-- 3. Vérification avec verrou (utilisée par les deux fonctions suivantes)
create or replace function public.pl_verifie(p_cle text, p_ok boolean) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare e public.pl_essais; n integer;
begin
  select * into e from public.pl_essais where cle = p_cle;
  if e.bloque_jusqua is not null and e.bloque_jusqua > now() then return false; end if;
  if p_ok then delete from public.pl_essais where cle = p_cle; return true; end if;
  perform pg_sleep(0.5);                                   -- chaque essai faux attend : essayer des milliers de mots de passe devient très long
  n := case when e.cle is null or (e.bloque_jusqua is not null and e.bloque_jusqua <= now()) then 1 else e.echecs + 1 end;
  insert into public.pl_essais (cle, echecs, bloque_jusqua) values (p_cle, n, case when n >= 5 then now() + interval '15 minutes' else null end)
    on conflict (cle) do update set echecs = excluded.echecs, bloque_jusqua = excluded.bloque_jusqua;
  return false;
end $$;

-- 4. Personne ne l'appelle directement
revoke execute on function public.pl_verifie(text, boolean) from public, anon, authenticated;

-- 5. Connexion d'un chauffeur ou de l'admin (même réponse qu'avant : le rôle, ou rien)
create or replace function public.pl_login(p_user text, p_pass text) returns text language plpgsql security definer set search_path to 'public' as $$
declare r text;
begin
  select role into r from public.pl_accounts where lower(username) = lower(trim(p_user)) and password = p_pass;
  if not public.pl_verifie('login:' || lower(trim(coalesce(p_user, ''))), r is not null) then return null; end if;
  return r;
end $$;

-- 6. « Est-ce bien l'admin ? » (utilisée par pl_admin_list, pl_admin_add, pl_admin_delete)
create or replace function public.pl_is_admin(a_user text, a_pass text) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare ok boolean;
begin
  ok := exists (select 1 from public.pl_accounts where lower(username) = lower(trim(a_user)) and password = a_pass and role = 'admin');
  return public.pl_verifie('admin:' || lower(trim(coalesce(a_user, ''))), ok);
end $$;

-- 7. à 9. Les fonctions de l'admin : avec un mauvais mot de passe, elles ne font rien (sans erreur, pour que l'essai soit compté)
create or replace function public.pl_admin_list(a_user text, a_pass text) returns table(username text, password text, role text) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.pl_is_admin(a_user, a_pass) then return; end if;
  return query select a.username, a.password, a.role from public.pl_accounts a order by a.role, a.username;
end $$;

create or replace function public.pl_admin_add(a_user text, a_pass text, p_user text, p_pass text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.pl_is_admin(a_user, a_pass) then return; end if;
  if exists (select 1 from public.pl_accounts where lower(username) = lower(trim(p_user))) then raise exception 'Ce nom existe déjà'; end if;
  insert into public.pl_accounts (username, password, role) values (trim(p_user), p_pass, 'driver');
end $$;

create or replace function public.pl_admin_delete(a_user text, a_pass text, p_user text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.pl_is_admin(a_user, a_pass) then return; end if;
  delete from public.pl_accounts where lower(username) = lower(trim(p_user)) and role = 'driver';
end $$;

-- ANCIENNES VERSIONS (pour revenir en arrière, une commande à la fois) :
-- create or replace function public.pl_login(p_user text, p_pass text) returns text language sql security definer set search_path to 'public' as $$ select role from pl_accounts where lower(username)=lower(trim(p_user)) and password=p_pass; $$;
-- create or replace function public.pl_is_admin(a_user text, a_pass text) returns boolean language sql security definer set search_path to 'public' as $$ select exists(select 1 from pl_accounts where lower(username)=lower(trim(a_user)) and password=a_pass and role='admin'); $$;
-- create or replace function public.pl_admin_list(a_user text, a_pass text) returns table(username text, password text, role text) language plpgsql security definer set search_path to 'public' as $$ begin if not pl_is_admin(a_user,a_pass) then raise exception 'Accès refusé'; end if; return query select a.username, a.password, a.role from pl_accounts a order by a.role, a.username; end $$;
-- create or replace function public.pl_admin_add(a_user text, a_pass text, p_user text, p_pass text) returns void language plpgsql security definer set search_path to 'public' as $$ begin if not pl_is_admin(a_user,a_pass) then raise exception 'Accès refusé'; end if; if exists(select 1 from pl_accounts where lower(username)=lower(trim(p_user))) then raise exception 'Ce nom existe déjà'; end if; insert into pl_accounts(username,password,role) values (trim(p_user), p_pass, 'driver'); end $$;
-- create or replace function public.pl_admin_delete(a_user text, a_pass text, p_user text) returns void language plpgsql security definer set search_path to 'public' as $$ begin if not pl_is_admin(a_user,a_pass) then raise exception 'Accès refusé'; end if; delete from pl_accounts where lower(username)=lower(trim(p_user)) and role='driver'; end $$;
