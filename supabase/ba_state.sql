-- ============================================================
-- Broodautomate v5 : données partagées (admin + appli opérateur) — table ba_state
-- Les tables de la v3 (machines, products, sales, events, audits) ne changent pas.
--
-- L'éditeur SQL de Supabase n'accepte qu'UNE commande à la fois :
-- copie UNE ligne, colle-la dans SQL Editor → Run → « Success », puis la suivante.
-- (Broodautomate les montre aussi une par une, avec un bouton « Copier ».)
-- ============================================================

create table if not exists public.ba_state (id text primary key, version bigint not null default 1, data jsonb not null, updated_at timestamptz not null default now(), updated_by text);

alter table public.ba_state enable row level security;

create policy "ba_state_authenticated" on public.ba_state for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.ba_state to authenticated;

grant all on public.ba_state to service_role;
