-- ============================================================
-- Broodautomate v5.34.6 : NOTIFICATIONS SUR iPHONE (et ordinateur), appli fermée — « Web Push »
-- L'éditeur SQL de Supabase : copie UNE commande (une ligne qui finit par « ; »), colle-la dans
-- SQL Editor → Run → « Success », puis la suivante. Les lignes qui commencent par « -- » sont des explications.
-- Rien ici n'efface ni ne change tes données : on AJOUTE une table et une fonction.
-- Il n'y a RIEN à copier à la main (pas de clé, pas de secret) : la fonction « ingest » crée toute seule
-- la paire de clés au premier passage (la tâche automatique de 15 min), et la garde dans la table ci-dessous.
-- ============================================================

-- 1. La paire de clés qui identifie ce serveur auprès d'Apple / Google / Mozilla (une seule ligne). Personne ne la lit depuis l'appli.
create table if not exists public.ba_vapid (id int primary key default 1 check (id = 1), pub text not null, priv text not null, cree_at timestamptz not null default now());

-- 2.
alter table public.ba_vapid enable row level security;

-- 3. Aucun compte (ni admin ni opérateur) ne peut lire ou écrire cette table : seule la fonction « ingest » (clé serveur) s'en sert
revoke all on public.ba_vapid from public, anon, authenticated;

-- 4.
grant all on public.ba_vapid to service_role;

-- 5. L'appli demande ici la clé PUBLIQUE (celle qui ne sert qu'à s'abonner) ; la clé privée ne sort jamais de la base
create or replace function public.ba_vapid_public() returns text language sql stable security definer set search_path = '' as $$ select pub from public.ba_vapid where id = 1; $$;

-- 6.
revoke execute on function public.ba_vapid_public() from public, anon;

-- 7. Les comptes admin (et opérateur : l'appli ne lui propose pas le bouton) peuvent demander la clé publique
grant execute on function public.ba_vapid_public() to authenticated;
