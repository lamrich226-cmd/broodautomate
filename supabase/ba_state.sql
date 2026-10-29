-- Broodautomate v5 : données partagées (admin + appli opérateur)
-- Supabase → SQL Editor → New query → coller → Run (une seule fois).
-- Les tables de la v3 (machines, products, sales, events, audits) ne changent pas.
create table if not exists public.ba_state (
  id          text primary key,
  version     bigint not null default 1,
  data        jsonb  not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.ba_state enable row level security;
drop policy if exists "ba_state_authenticated" on public.ba_state;
create policy "ba_state_authenticated" on public.ba_state
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.ba_state to authenticated;
grant all on public.ba_state to service_role;
do $$ begin
  alter publication supabase_realtime add table public.ba_state;
exception when duplicate_object then null;
end $$;
