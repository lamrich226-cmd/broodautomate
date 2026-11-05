-- ============================================================
-- Broodautomate — boîtiers 4G (LILYGO) : 3 tables et 1 fonction
-- Les tables actuelles (ba_state, machines, products, sales, events, audits) ne changent pas.
--
-- L'éditeur SQL de Supabase n'accepte qu'UNE commande à la fois :
-- copie UNE ligne (une commande), colle-la dans SQL Editor → Run → « Success »,
-- efface, puis passe à la ligne suivante. 17 commandes en tout.
-- Déjà fait les commandes 1 à 9 (boîtiers 4G, octobre 2026) ? Fais seulement 10 à 17
-- (bouton « Lire maintenant »).
-- (Broodautomate les montre aussi une par une, avec un bouton « Copier » :
--  onglet Connexion RS232 → Boîtiers 4G → « Commandes SQL ».)
-- ============================================================

-- 1. Les boîtiers (la clé secrète n'est jamais gardée : seulement son empreinte SHA-256)
create table if not exists public.devices (id uuid primary key default gen_random_uuid(), name text not null, machine_id text not null, key_hash text not null unique, last_seen timestamptz, info jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

-- 2. Les relevés reçus par la 4G (texte EVA-DTS tel que lu sur la machine)
create table if not exists public.device_reports (id bigint generated always as identity primary key, device_id uuid references public.devices(id) on delete cascade, machine_id text not null, raw text not null, role text, received_at timestamptz not null default now());

-- 3. Index (relevés d'une machine dans l'ordre)
create index if not exists device_reports_machine_id on public.device_reports (machine_id, id);

-- 4. et 5. Sécurité : accès seulement après connexion à ton compte
alter table public.devices enable row level security;

alter table public.device_reports enable row level security;

-- 6. et 7. Règles d'accès (ton compte : tout ; les boîtiers passent par la fonction « ingest »)
create policy "devices_authenticated" on public.devices for all to authenticated using (true) with check (true);

create policy "device_reports_authenticated" on public.device_reports for all to authenticated using (true) with check (true);

-- 8. et 9. Droits
grant select, insert, update, delete on public.devices, public.device_reports to authenticated;

grant all on public.devices, public.device_reports to service_role;

-- 10. Bouton « Lire maintenant » : les demandes de lecture (attente → prise par le boîtier → faite ou echec)
create table if not exists public.ba_demandes (id bigint generated always as identity primary key, device_id uuid not null references public.devices(id) on delete cascade, machine_id text not null, statut text not null default 'attente', message text, cree_at timestamptz not null default now(), prise_at timestamptz, fini_at timestamptz);

-- 11. Index (demandes d'un boîtier)
create index if not exists ba_demandes_device on public.ba_demandes (device_id, statut, id);

-- 12. à 15. Sécurité et droits (comme les autres tables)
alter table public.ba_demandes enable row level security;

create policy "ba_demandes_authenticated" on public.ba_demandes for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.ba_demandes to authenticated;

grant all on public.ba_demandes to service_role;

-- 16. La fonction que le boîtier appelle régulièrement (2 min au départ, puis le délai réglé dans l'admin : 15 min, 30 min ou 1 h) : vérifie SA clé (empreinte SHA-256),
--     note « vu à », enregistre le résultat de la demande terminée, et lui donne la demande en attente
--     (une demande de plus d'une heure n'est plus donnée : le boîtier était hors ligne)
create or replace function public.ba_boitier(k text, fait bigint default 0, ok boolean default true, msg text default '') returns json language sql security definer set search_path = '' as $$ with d as (update public.devices set last_seen = now() where key_hash = encode(sha256(convert_to(k, 'UTF8')), 'hex') returning id), f as (update public.ba_demandes set statut = case when ok then 'faite' else 'echec' end, fini_at = now(), message = left(coalesce(msg, ''), 240) where fait > 0 and id = fait and statut in ('attente', 'prise') and device_id in (select id from d) returning id), p as (update public.ba_demandes set statut = 'prise', prise_at = now() where id = (select id from public.ba_demandes where statut = 'attente' and cree_at > now() - interval '1 hour' and id <> coalesce(fait, 0) and device_id in (select id from d) order by id limit 1) returning id) select json_build_object('ok', exists (select 1 from d), 't', floor(extract(epoch from now()))::bigint, 'dem', coalesce((select id from p), 0), 'fait', (select count(*) from f), 'ec', coalesce((select case when (data -> 'settings' ->> 'ecouteMin') in ('15', '30', '60') then (data -> 'settings' ->> 'ecouteMin')::int * 60 else 0 end from public.ba_state where id = 'main'), 0)) $$;

-- 17. Le boîtier appelle la fonction avec la clé publique (sans compte) : seulement cette fonction
grant execute on function public.ba_boitier(text, bigint, boolean, text) to anon;
