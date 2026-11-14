-- Broodautomate v5.28 — envoi des boîtiers par UDP (carte 1NCE) : morceaux de message en attente de recollage.
-- Sans danger si on le relance. Accessible seulement par les fonctions Supabase (aucune règle publique).
create table if not exists public.ba_udp_morceaux (
  iccid   text        not null,
  seq     integer     not null,
  idx     integer     not null,
  total   integer     not null,
  data    text        not null,
  recu_at timestamptz not null default now(),
  primary key (iccid, seq, idx)
);
alter table public.ba_udp_morceaux enable row level security;
-- Nettoyage : les morceaux orphelins (message jamais complété) de plus d'un jour sont supprimés par la fonction elle-même.
create index if not exists ba_udp_morceaux_recu on public.ba_udp_morceaux (recu_at);
-- Messages déjà traités (une même séquence réessayée par 1NCE ne sera pas comptée deux fois)
create table if not exists public.ba_udp_faits (
  iccid   text        not null,
  seq     integer     not null,
  fait_at timestamptz not null default now(),
  primary key (iccid, seq)
);
alter table public.ba_udp_faits enable row level security;
