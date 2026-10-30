-- ============================================================
-- Broodautomate — boîtiers 4G (LILYGO) : 2 nouvelles tables
-- Les tables actuelles (ba_state, machines, products, sales, events, audits) ne changent pas.
--
-- L'éditeur SQL de Supabase n'accepte qu'UNE commande à la fois :
-- copie UNE ligne (une commande), colle-la dans SQL Editor → Run → « Success »,
-- efface, puis passe à la ligne suivante. 9 commandes en tout.
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
