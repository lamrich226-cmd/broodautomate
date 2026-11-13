-- Broodautomate v5.26 — « Lire maintenant » instantané pour les boîtiers à carte 1NCE.
-- Ajoute le numéro de la carte SIM (ICCID, 18 à 20 chiffres) à chaque boîtier. Sans danger si on le relance.
alter table public.devices add column if not exists iccid text;
alter table public.devices drop constraint if exists devices_iccid_format;
alter table public.devices add constraint devices_iccid_format check (iccid is null or iccid ~ '^[0-9]{18,20}$');
