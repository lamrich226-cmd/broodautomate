-- ============================================================
-- Broodautomate v5.9 / v5.10 : NOTIFICATIONS (page admin + appli Android), COPIE AUTOMATIQUE CHAQUE NUIT
-- et RÉGLAGE À DISTANCE DE « LIRE MAINTENANT »
-- L'éditeur SQL de Supabase : copie UNE commande (une ligne qui finit par « ; »), colle-la dans
-- SQL Editor → Run → « Success », puis la suivante. Les lignes qui commencent par « -- » sont des explications.
-- Rien ici n'efface ni ne change tes données : on AJOUTE des tables et des tâches automatiques.
-- ============================================================

-- A. NOTIFICATIONS (commandes 1 à 12)
-- 1. La liste des notifications (pannes, coupures, froid, porte restée ouverte, boîtier muet…)
create table if not exists public.ba_notifications (id bigint generated always as identity primary key, cle text not null unique, device_id uuid references public.devices(id) on delete cascade, machine_id text, type text not null, titre text not null, texte text not null default '', silencieux boolean not null default false, cree_at timestamptz not null default now(), envoye_at timestamptz);

-- 2.
alter table public.ba_notifications enable row level security;

-- 3. Seuls les comptes admin les voient (un compte « operator » ne les voit pas)
create policy "notifs_lecture_admin" on public.ba_notifications for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- 4.
grant select on public.ba_notifications to authenticated;

-- 5.
grant all on public.ba_notifications to service_role;

-- 6. Les téléphones qui reçoivent les notifications (un « jeton » par téléphone, donné par Android)
create table if not exists public.ba_push_tokens (token text primary key, user_id uuid not null, operateur boolean not null default false, appareil text not null default '', maj_at timestamptz not null default now());

-- 7. Personne ne lit cette table depuis l'appli (seule la fonction « ingest » s'en sert)
alter table public.ba_push_tokens enable row level security;

-- 8.
grant all on public.ba_push_tokens to service_role;

-- 9. L'appli enregistre son téléphone avec cette fonction (le rôle vient du compte, pas de l'appli)
create or replace function public.ba_jeton(t text, appareil text default '') returns void language sql security definer set search_path = '' as $$ insert into public.ba_push_tokens (token, user_id, operateur, appareil, maj_at) select t, auth.uid(), coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator', false), left(coalesce(appareil, ''), 80), now() where auth.uid() is not null and length(coalesce(t, '')) between 20 and 4096 on conflict (token) do update set user_id = excluded.user_id, operateur = excluded.operateur, appareil = excluded.appareil, maj_at = now(); $$;

-- 10. À la déconnexion, l'appli retire son téléphone
create or replace function public.ba_jeton_retirer(t text) returns void language sql security definer set search_path = '' as $$ delete from public.ba_push_tokens where token = t and user_id = auth.uid(); $$;

-- 11.
revoke execute on function public.ba_jeton(text, text), public.ba_jeton_retirer(text) from public, anon;

-- 12.
grant execute on function public.ba_jeton(text, text), public.ba_jeton_retirer(text) to authenticated;

-- B. COPIE DE TOUTES LES DONNÉES CHAQUE NUIT (commandes 13 à 18) — 14 nuits gardées
-- 13.
create table if not exists public.ba_state_backup (jour date not null, ligne text not null, version bigint, data jsonb not null, cree_at timestamptz not null default now(), primary key (jour, ligne));

-- 14.
alter table public.ba_state_backup enable row level security;

-- 15. Seuls les comptes admin peuvent lire les copies
create policy "copies_lecture_admin" on public.ba_state_backup for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- 16.
grant select on public.ba_state_backup to authenticated;

-- 17.
grant all on public.ba_state_backup to service_role;

-- 18. Les tâches automatiques (extension « pg_cron », gratuite). Si cette commande refuse : Database → Extensions → pg_cron → Enable.
create extension if not exists pg_cron with schema pg_catalog;

-- 19. Chaque nuit à 3 h 30 (heure belge en hiver) : copie de toutes les données
select cron.schedule('ba-copie-nuit', '30 2 * * *', $$insert into public.ba_state_backup (jour, ligne, version, data) select current_date, id, version, data from public.ba_state on conflict (jour, ligne) do update set version = excluded.version, data = excluded.data, cree_at = now()$$);

-- 20. Chaque nuit à 3 h 45 : on efface les copies de plus de 14 jours (jamais tes vraies données)
select cron.schedule('ba-copie-menage', '45 2 * * *', $$delete from public.ba_state_backup where jour < current_date - 14$$);

-- C. SURVEILLANCE DES BOÎTIERS (commandes 21 et 22) — même si aucun écran n'est ouvert
-- 21. Extension « pg_net » (gratuite) : permet à Supabase d'appeler la fonction « ingest ». Si elle refuse : Database → Extensions → pg_net → Enable.
create extension if not exists pg_net with schema extensions;

-- 22. Toutes les 15 minutes : boîtier muet depuis 2 h, porte restée ouverte 15 min, notifications pas encore envoyées
select cron.schedule('ba-veille', '*/15 * * * *', $$select net.http_post(url := 'https://ujvihkryzjrawamekwpu.supabase.co/functions/v1/ingest', body := '{"veille":1}'::jsonb)$$);


-- D. RÉGLAGE « LIRE MAINTENANT » À DISTANCE (commande 23) — le délai choisi dans l'admin (Boîtiers 4G : 15 min, 30 min ou 1 h)
-- part vers les boîtiers à leur prochain passage (programme du boîtier v1.2 ou plus récent). Remplace la fonction ba_boitier (même nom).
-- 23.
create or replace function public.ba_boitier(k text, fait bigint default 0, ok boolean default true, msg text default '') returns json language sql security definer set search_path = '' as $$ with d as (update public.devices set last_seen = now() where key_hash = encode(sha256(convert_to(k, 'UTF8')), 'hex') returning id), f as (update public.ba_demandes set statut = case when ok then 'faite' else 'echec' end, fini_at = now(), message = left(coalesce(msg, ''), 240) where fait > 0 and id = fait and statut in ('attente', 'prise') and device_id in (select id from d) returning id), p as (update public.ba_demandes set statut = 'prise', prise_at = now() where id = (select id from public.ba_demandes where statut = 'attente' and cree_at > now() - interval '1 hour' and id <> coalesce(fait, 0) and device_id in (select id from d) order by id limit 1) returning id) select json_build_object('ok', exists (select 1 from d), 't', floor(extract(epoch from now()))::bigint, 'dem', coalesce((select id from p), 0), 'fait', (select count(*) from f), 'ec', coalesce((select case when (data -> 'settings' ->> 'ecouteMin') in ('15', '30', '60') then (data -> 'settings' ->> 'ecouteMin')::int * 60 else 0 end from public.ba_state where id = 'main'), 0)) $$;

-- ============================================================
-- RESTAURER une copie (seulement avec Claude, après avoir fermé tous les écrans Broodautomate) :
-- 1) voir les copies :  select jour, ligne, cree_at from public.ba_state_backup order by jour desc;
-- 2) remettre celle d'un jour (remplace AAAA-MM-JJ) :
--    update public.ba_state s set data = b.data, version = s.version + 1, updated_at = now() from public.ba_state_backup b where b.jour = 'AAAA-MM-JJ' and b.ligne = s.id;
--
-- ARRÊTER les tâches automatiques (une commande à la fois) :
-- select cron.unschedule('ba-copie-nuit');
-- select cron.unschedule('ba-copie-menage');
-- select cron.unschedule('ba-veille');
-- ============================================================
